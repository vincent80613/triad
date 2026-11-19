import { copyFile, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { shell } from 'electron'
import { unzipSync } from 'fflate'
import type {
  HealthCheck,
  HealthReport,
  Instance,
  InstalledMod,
  LoaderType,
  ModUpdate,
  ModrinthProject,
  ModrinthVersion,
  ProjectType
} from '@shared/types'
import { detectJava } from './java'
import { events } from './events'
import { getProject, getProjectVersions, getVersion, modrinthLoader } from './modrinth'
import type { Store } from './store'
import type { TaskHandle, TaskManager } from './tasks'
import {
  downloadFile,
  ensureDir,
  isInside,
  mapPool,
  pathExists,
  readJson,
  sanitizeFileName,
  uid
} from './util'
import { ensureInstanceVersion } from './versions'

const PROJECT_TYPES: Record<string, ProjectType> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader'
}

const FOLDER_BY_TYPE: Record<string, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
}

function primaryFile(version: ModrinthVersion): ModrinthVersion['files'][number] {
  const file = version.files.find((entry) => entry.primary) ?? version.files[0]
  if (!file) throw new Error('This version has no downloadable files.')
  return file
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

interface PackFile {
  path: string
  hashes: { sha1?: string }
  env?: { client?: 'required' | 'optional' | 'unsupported' }
  downloads: string[]
  fileSize?: number
}

interface PackIndex {
  formatVersion: number
  name?: string
  versionId?: string
  files: PackFile[]
  dependencies: Record<string, string>
}

export class ContentManager {
  constructor(
    private store: Store,
    private tasks: TaskManager
  ) {}

  async listMods(instanceId: string): Promise<InstalledMod[]> {
    const instance = this.store.requireInstance(instanceId)
    const dir = join(this.store.minecraftDir(instance.id), 'mods')
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }
    const records = this.store.modRecords(instanceId)
    const result: InstalledMod[] = []
    for (const entry of entries) {
      if (!/\.jar(\.disabled)?$/i.test(entry)) continue
      const base = entry.replace(/\.disabled$/, '')
      const record = records[base]
      const info = await stat(join(dir, entry)).catch(() => null)
      result.push({
        fileName: entry,
        title: record?.title ?? base.replace(/\.jar$/i, '').replace(/[-_]/g, ' '),
        iconUrl: record?.iconUrl,
        projectId: record?.projectId,
        versionId: record?.versionId,
        versionNumber: record?.versionNumber,
        enabled: !entry.endsWith('.disabled'),
        size: info?.size ?? 0,
        source: record?.source ?? 'manual',
        installedAt: record?.installedAt ?? info?.mtimeMs ?? Date.now()
      })
    }
    return result.sort((a, b) => a.title.localeCompare(b.title))
  }

  async importMods(instanceId: string, paths: string[]): Promise<string[]> {
    const instance = this.store.requireInstance(instanceId)
    if (instance.loader === 'vanilla') {
      throw new Error(
        'This instance is vanilla. Create a Fabric, Quilt, Forge or NeoForge instance to load mods.'
      )
    }
    const dir = join(this.store.minecraftDir(instance.id), 'mods')
    await ensureDir(dir)
    const records = this.store.modRecords(instanceId)
    const pending: { source: string; file: string; title: string }[] = []
    const names = new Set<string>()

    for (const source of paths) {
      const file = sanitizeFileName(source)
      if (!/\.jar$/i.test(file)) throw new Error(`${file} is not a .jar file.`)
      const key = file.toLowerCase()
      if (names.has(key)) throw new Error(`Two selected files are both named ${file}.`)
      const info = await stat(source).catch(() => null)
      if (!info?.isFile()) throw new Error(`Could not read ${file}.`)
      const target = join(dir, file)
      if (!isInside(dir, target)) throw new Error('Invalid mod path.')
      if ((await pathExists(target)) || (await pathExists(`${target}.disabled`))) {
        throw new Error(`${file} is already in this instance.`)
      }
      names.add(key)
      pending.push({
        source,
        file,
        title: file.replace(/\.jar$/i, '').replace(/[-_]+/g, ' ').trim() || file
      })
    }

    for (const entry of pending) {
      await copyFile(entry.source, join(dir, entry.file))
      records[entry.file] = {
        file: entry.file,
        title: entry.title,
        source: 'manual',
        installedAt: Date.now()
      }
    }

    this.store.setModRecords(instanceId, records)
    events.dataChanged(`mods:${instanceId}`)
    return pending.map((entry) => entry.title)
  }

  async setModEnabled(instanceId: string, fileName: string, enabled: boolean): Promise<void> {
    const instance = this.store.requireInstance(instanceId)
    const dir = join(this.store.minecraftDir(instance.id), 'mods')
    const safe = sanitizeFileName(fileName)
    const source = join(dir, safe)
    if (!isInside(dir, source)) throw new Error('Invalid mod path.')
    const target = enabled ? join(dir, safe.replace(/\.disabled$/, '')) : `${source}.disabled`
    if (safe.endsWith('.disabled') === !enabled) return
    if (!(await pathExists(source))) throw new Error('That mod file no longer exists.')
    if (enabled && (await pathExists(target))) throw new Error('A file with that name already exists.')
    await rename(source, target)
    events.dataChanged(`mods:${instanceId}`)
  }

  async removeMod(instanceId: string, fileName: string): Promise<void> {
    const instance = this.store.requireInstance(instanceId)
    const dir = join(this.store.minecraftDir(instance.id), 'mods')
    const safe = sanitizeFileName(fileName)
    const base = safe.replace(/\.disabled$/, '')
    for (const name of [base, `${base}.disabled`]) {
      const target = join(dir, name)
      if (isInside(dir, target)) await rm(target, { force: true })
    }
    const records = this.store.modRecords(instanceId)
    delete records[base]
    this.store.setModRecords(instanceId, records)
    events.dataChanged(`mods:${instanceId}`)
  }

  openModsFolder(instanceId: string): Promise<string> {
    const instance = this.store.requireInstance(instanceId)
    return shell.openPath(join(this.store.minecraftDir(instance.id), 'mods'))
  }

  async health(instanceId: string): Promise<HealthReport> {
    const instance = this.store.requireInstance(instanceId)
    const instanceDir = this.store.instanceDir(instance.id)
    const gameDir = this.store.minecraftDir(instance.id)
    const checks: HealthCheck[] = []
    const add = (check: HealthCheck): void => {
      checks.push(check)
    }

    const gameExists = await pathExists(gameDir)
    add({
      id: 'instance-folder',
      label: 'Instance folder',
      status: (await pathExists(instanceDir)) ? 'ok' : 'error',
      detail: gameExists ? 'Instance data is present.' : 'The instance folder is missing.',
      fixable: true
    })

    const marker = await readJson<{ versionId?: string; mcVersion?: string }>(
      join(this.store.metaDir(instance.id), 'install.json'),
      {}
    )
    const versionId = marker.versionId || instance.versionId
    const versionPresent = versionId
      ? await pathExists(join(this.store.sharedDir, 'versions', versionId, `${versionId}.json`))
      : false
    add({
      id: 'game-files',
      label: 'Minecraft files',
      status: versionPresent ? 'ok' : 'error',
      detail: versionPresent
        ? `Version ${versionId} is ready in the shared game folder.`
        : 'The game version is missing from the shared folder.',
      fixable: true
    })

    const modsDir = join(gameDir, 'mods')
    const modsPresent = await pathExists(modsDir)
    add({
      id: 'mods-folder',
      label: 'Mods folder',
      status: instance.loader === 'vanilla' || modsPresent ? 'ok' : 'warn',
      detail: instance.loader === 'vanilla'
        ? 'Vanilla instance — no mods folder required.'
        : modsPresent
          ? 'Mods folder is present.'
          : 'Mods folder has not been created yet.',
      fixable: true
    })

    const records = this.store.data.mods[instance.id] ?? {}
    const missingMods = Object.values(records).filter(
      (record) => !record.file || record.file.length === 0
    )
    const missingFiles: string[] = []
    for (const record of Object.values(records)) {
      if (!record.file) continue
      if (
        !(await pathExists(join(modsDir, record.file))) &&
        !(await pathExists(join(modsDir, `${record.file}.disabled`)))
      ) {
        missingFiles.push(record.file)
      }
    }
    add({
      id: 'mod-files',
      label: 'Installed mods',
      status: missingFiles.length || missingMods.length ? 'warn' : 'ok',
      detail: missingFiles.length
        ? `${missingFiles.length} recorded mod file${missingFiles.length === 1 ? '' : 's'} missing from the folder.`
        : `${Object.keys(records).length} mods tracked.`,
      fixable: missingFiles.length > 0
    })

    const duplicateProjects = new Map<string, number>()
    for (const record of Object.values(records)) {
      if (!record.projectId) continue
      duplicateProjects.set(record.projectId, (duplicateProjects.get(record.projectId) ?? 0) + 1)
    }
    const duplicates = [...duplicateProjects.values()].filter((count) => count > 1).length
    add({
      id: 'mod-conflicts',
      label: 'Mod conflicts',
      status: duplicates ? 'warn' : 'ok',
      detail: duplicates
        ? `${duplicates} project${duplicates === 1 ? '' : 's'} installed more than once.`
        : 'No duplicate project IDs detected.'
    })

    let javaOk = true
    if (this.store.settings.javaPath) {
      javaOk = await pathExists(this.store.settings.javaPath)
    } else {
      try {
        javaOk = (await detectJava(false)).length > 0
      } catch {
        javaOk = false
      }
    }
    add({
      id: 'java',
      label: 'Java runtime',
      status: javaOk ? 'ok' : 'error',
      detail: javaOk
        ? 'A Java runtime is available.'
        : 'No Java runtime was detected. Install one from Settings.',
      fixable: false
    })

    const saves = join(gameDir, 'saves')
    const worldFolders = await readdir(saves).catch(() => [] as string[])
    add({
      id: 'worlds',
      label: 'Worlds',
      status: 'ok',
      detail: `${worldFolders.length} world folder${worldFolders.length === 1 ? '' : 's'} found.`
    })

    const hasError = checks.some((check) => check.status === 'error')
    const hasWarn = checks.some((check) => check.status === 'warn')
    return {
      status: hasError ? 'broken' : hasWarn ? 'attention' : 'healthy',
      checks,
      checkedAt: Date.now()
    }
  }

  repair(instanceId: string): string {
    const instance = this.store.requireInstance(instanceId)
    const task = this.tasks.create(`Repairing ${instance.name}`, 'install')
    void (async () => {
      await ensureDir(this.store.instanceDir(instance.id))
      await ensureDir(this.store.minecraftDir(instance.id))
      await ensureDir(join(this.store.minecraftDir(instance.id), 'mods'))
      await ensureDir(join(this.store.minecraftDir(instance.id), 'saves'))
      await ensureDir(this.store.metaDir(instance.id))

      const records = this.store.modRecords(instance.id)
      let changed = false
      for (const [file, record] of Object.entries(records)) {
        const modsDir = join(this.store.minecraftDir(instance.id), 'mods')
        if (
          !(await pathExists(join(modsDir, file))) &&
          !(await pathExists(join(modsDir, `${file}.disabled`))) &&
          !(await pathExists(join(modsDir, record.file)))
        ) {
          delete records[file]
          changed = true
        }
      }
      if (changed) this.store.setModRecords(instance.id, records)

      await ensureInstanceVersion(
        instance,
        this.store,
        this.store.settings.javaPath || instance.javaPath || undefined,
        (progress, stage) => task.update(progress, stage),
        task.signal
      )
      task.done({ instanceId: instance.id })
      events.dataChanged('instances')
      events.dataChanged(`mods:${instance.id}`)
    })().catch((error) => task.fail(error))
    return task.id
  }

  private isInstalled(instanceId: string, projectId: string): boolean {
    return Object.values(this.store.modRecords(instanceId)).some(
      (record) => record.projectId === projectId
    )
  }

  private async resolveVersion(
    projectId: string,
    instance: Instance,
    versionId?: string
  ): Promise<{ project: ModrinthProject; version: ModrinthVersion }> {
    const project = await getProject(projectId)
    if (versionId) {
      const version = await getVersion(versionId)
      return { project, version }
    }
    const loader =
      project.project_type === 'mod' || project.project_type === 'modpack'
        ? modrinthLoader(instance.loader)
        : undefined
    const versions = await getProjectVersions(project.id, {
      gameVersion: instance.mcVersion,
      loader
    })
    if (!versions.length) {
      const loaderLabel = instance.loader === 'vanilla' ? '' : ` + ${instance.loader}`
      throw new Error(
        `${project.title} has no release for Minecraft ${instance.mcVersion}${loaderLabel}.`
      )
    }
    return { project, version: versions[0] }
  }

  private async downloadProjectFile(
    project: ModrinthProject,
    version: ModrinthVersion,
    folder: string,
    task: TaskHandle,
    signal: AbortSignal
  ): Promise<string> {
    const file = primaryFile(version)
    const fileName = sanitizeFileName(file.filename)
    const destination = join(folder, fileName)
    await ensureDir(folder)
    task.update(null, `Downloading ${project.title}`)
    await downloadFile(file.url, destination, {
      sha1: file.hashes.sha1,
      size: file.size,
      signal,
      onProgress: (received, total) => {
        const fraction = total ? received / total : 0
        task.update(0.2 + fraction * 0.5, `Downloading ${project.title}`)
      }
    })
    return fileName
  }

  private async record(
    instanceId: string,
    project: ModrinthProject,
    version: ModrinthVersion,
    fileName: string,
    source: 'modrinth' | 'modpack' = 'modrinth'
  ): Promise<void> {
    const records = this.store.modRecords(instanceId)
    for (const [name, record] of Object.entries(records)) {
      if (record.projectId === project.id && name !== fileName) {
        delete records[name]
        await rm(join(this.store.minecraftDir(instanceId), 'mods', name), { force: true })
        await rm(join(this.store.minecraftDir(instanceId), 'mods', `${name}.disabled`), {
          force: true
        })
      }
    }
    records[fileName] = {
      file: fileName,
      title: project.title,
      iconUrl: project.icon_url ?? undefined,
      projectId: project.id,
      versionId: version.id,
      versionNumber: version.version_number,
      source,
      installedAt: Date.now()
    }
    this.store.setModRecords(instanceId, records)
  }

  installProject(instanceId: string, projectId: string, versionId?: string): string {
    const instance = this.store.requireInstance(instanceId)
    const task = this.tasks.create('Installing mod', 'mod')
    void (async () => {
      const project = await getProject(projectId)
      if (project.project_type === 'modpack') {
        throw new Error('Use the modpack installer for modpacks.')
      }
      task.setTitle(`Installing ${project.title}`)
      task.subtitle(project.description)

      const visited = new Set<string>()
      const installNode = async (
        id: string,
        explicitVersion?: string,
        depth = 0
      ): Promise<void> => {
        if (visited.has(id) || depth > 4) return
        visited.add(id)
        const { project: nodeProject, version } = await this.resolveVersion(
          id,
          instance,
          explicitVersion
        )
        const nodeType = PROJECT_TYPES[nodeProject.project_type] ?? 'mod'
        const folder = join(
          this.store.minecraftDir(instance.id),
          FOLDER_BY_TYPE[nodeType] ?? 'mods'
        )
        const fileName = await this.downloadProjectFile(
          nodeProject,
          version,
          folder,
          task,
          task.signal
        )
        if (nodeType === 'mod') {
          await this.record(instance.id, nodeProject, version, fileName)
        }
        if (depth === 0) task.update(0.75, 'Resolving dependencies')
        const dependencies = (version.dependencies ?? []).filter(
          (dependency) => dependency.dependency_type === 'required' && dependency.project_id
        )
        for (const dependency of dependencies) {
          if (!dependency.project_id || this.isInstalled(instance.id, dependency.project_id)) {
            continue
          }
          await installNode(dependency.project_id, dependency.version_id ?? undefined, depth + 1)
        }
      }

      await installNode(project.id, versionId)
      task.done()
      events.dataChanged(`mods:${instanceId}`)
    })().catch((error) => {
      task.fail(error)
    })
    return task.id
  }

  async checkUpdates(instanceId: string): Promise<ModUpdate[]> {
    const instance = this.store.requireInstance(instanceId)
    const records = this.store.modRecords(instanceId)
    const loader = modrinthLoader(instance.loader)
    const updates: ModUpdate[] = []
    const seen = new Set<string>()
    for (const record of Object.values(records)) {
      if (!record.projectId || seen.has(record.projectId)) continue
      seen.add(record.projectId)
      try {
        const versions = await getProjectVersions(record.projectId, {
          gameVersion: instance.mcVersion,
          loader
        })
        const latest = versions[0]
        if (!latest || latest.id === record.versionId) continue
        updates.push({
          fileName: record.file,
          projectId: record.projectId,
          title: record.title,
          current: record.versionNumber ?? 'unknown',
          latestId: latest.id,
          latestNumber: latest.version_number,
          iconUrl: record.iconUrl
        })
        await sleep(30)
      } catch {
        // Skip projects that cannot be resolved right now.
      }
    }
    return updates
  }

  installModpack(projectId: string, versionId: string): string {
    const task = this.tasks.create('Installing modpack', 'modpack', 'Preparing download')
    void this.runModpack(projectId, versionId, task).catch((error) => {
      task.fail(error)
    })
    return task.id
  }

  private async runModpack(projectId: string, versionId: string, task: TaskHandle): Promise<void> {
    const project = await getProject(projectId)
    const version = await getVersion(versionId)
    task.setTitle(`Installing ${project.title}`)
    task.subtitle(`${version.version_number} · modpack`)

    const file = primaryFile(version)
    const cacheDir = join(this.store.sharedDir, '.triad', 'packs')
    await ensureDir(cacheDir)
    const packPath = join(cacheDir, sanitizeFileName(file.filename))
    task.update(null, 'Downloading modpack archive')
    await downloadFile(file.url, packPath, {
      sha1: file.hashes.sha1,
      size: file.size,
      signal: task.signal,
      onProgress: (received, total) => {
        if (total) task.update((received / total) * 0.1, 'Downloading modpack archive')
      }
    })

    task.update(0.12, 'Reading pack manifest')
    const archive = unzipSync(new Uint8Array(await readFile(packPath)))
    const indexBytes = archive['modrinth.index.json']
    if (!indexBytes) throw new Error('This .mrpack file is missing modrinth.index.json.')
    const index = JSON.parse(new TextDecoder().decode(indexBytes)) as PackIndex
    const mcVersion = index.dependencies.minecraft
    if (!mcVersion) throw new Error('The modpack manifest does not specify a Minecraft version.')

    let loader: LoaderType = 'vanilla'
    let loaderVersion = ''
    if (index.dependencies['fabric-loader']) {
      loader = 'fabric'
      loaderVersion = index.dependencies['fabric-loader']
    } else if (index.dependencies['quilt-loader']) {
      loader = 'quilt'
      loaderVersion = index.dependencies['quilt-loader']
    } else if (index.dependencies.neoforge) {
      loader = 'neoforge'
      loaderVersion = index.dependencies.neoforge
    } else if (index.dependencies.forge) {
      loader = 'forge'
      loaderVersion = index.dependencies.forge
    }

    const instance: Instance = {
      id: uid('inst_'),
      name: this.uniqueName(project.title),
      icon: project.icon_url ?? '📦',
      tint: '#8f7bff',
      mcVersion,
      loader,
      loaderVersion: loaderVersion || undefined,
      created: Date.now(),
      playtimeMs: 0,
      memoryMb: this.store.settings.memoryMb,
      modpackProjectId: project.id,
      modpackVersionId: version.id
    }
    this.store.addInstance(instance)
    events.dataChanged('instances')

    const gameDir = this.store.minecraftDir(instance.id)
    await ensureDir(gameDir)

    task.update(0.16, `Installing Minecraft ${mcVersion}`)
    await ensureInstanceVersion(
      instance,
      this.store,
      undefined,
      (progress, stage) => {
        task.update(progress === null ? null : 0.16 + progress * 0.45, stage)
      },
      task.signal
    )

    const files = index.files.filter((entry) => entry.env?.client !== 'unsupported')
    let done = 0
    await mapPool(
      files,
      6,
      async (entry) => {
        const destination = join(gameDir, entry.path)
        if (!isInside(gameDir, destination)) return
        if (!entry.downloads?.length) return
        await downloadFile(entry.downloads[0], destination, {
          sha1: entry.hashes?.sha1,
          size: entry.fileSize,
          signal: task.signal
        })
        done++
        if (done % 3 === 0 || done === files.length) {
          task.update(
            0.62 + 0.3 * (done / Math.max(files.length, 1)),
            `Downloading pack files (${done}/${files.length})`
          )
        }
      },
      task.signal
    )

    task.update(0.94, 'Applying pack overrides')
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const name of Object.keys(archive)) {
        if (!name.startsWith(prefix) || name.endsWith('/')) continue
        const destination = join(gameDir, name.slice(prefix.length))
        if (!isInside(gameDir, destination)) continue
        await ensureDir(dirname(destination))
        await writeFile(destination, archive[name])
      }
    }

    this.store.data.activeInstanceId = instance.id
    this.store.save()
    task.done({ instanceId: instance.id })
    events.dataChanged('instances')
    events.toast({
      title: `${project.title} is ready`,
      description: 'The modpack instance has been created.',
      variant: 'success'
    })
  }

  private uniqueName(base: string): string {
    const existing = new Set(this.store.data.instances.map((instance) => instance.name))
    if (!existing.has(base)) return base
    let index = 2
    while (existing.has(`${base} (${index})`)) index++
    return `${base} (${index})`
  }

  createInstance(input: {
    name: string
    icon: string
    tint: string
    mcVersion: string
    loader: LoaderType
    loaderVersion?: string
    memoryMb?: number
  }): { instance: Instance; taskId: string } {
    const name = input.name.trim()
    if (!name) throw new Error('Give your instance a name.')
    if (name.length > 48) throw new Error('Instance names must be 48 characters or fewer.')
    const instance: Instance = {
      id: uid('inst_'),
      name: this.uniqueName(name),
      icon: input.icon || '🌿',
      tint: input.tint || '#8f7bff',
      mcVersion: input.mcVersion,
      loader: input.loader,
      loaderVersion: input.loaderVersion,
      created: Date.now(),
      playtimeMs: 0,
      memoryMb: input.memoryMb ?? this.store.settings.memoryMb
    }
    this.store.addInstance(instance)
    events.dataChanged('instances')

    const task = this.tasks.create(
      `Setting up ${instance.name}`,
      'install',
      `${instance.mcVersion} · ${instance.loader}`
    )
    void ensureInstanceVersion(instance, this.store, undefined, (progress, stage) => {
      task.update(progress, stage)
    })
      .then(() => {
        task.done({ instanceId: instance.id })
        events.dataChanged('instances')
        events.dataChanged(`mods:${instance.id}`)
      })
      .catch((error) => {
        task.fail(error)
      })

    return { instance, taskId: task.id }
  }
}

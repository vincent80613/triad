#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const notesPath = path.join(releaseDir, 'RELEASE_NOTES.md')
const latestPath = path.join(releaseDir, 'latest.yml')
const feedPath = path.join(root, 'resources', 'update-feed.json')
const appUpdatePath = path.join(root, 'resources', 'app-update.yml')

function fail(message) {
  console.error(`\n[Triad update] ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--dry-run' || token === '--no-upload') {
      result[token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true
      continue
    }
    if (token === '--configure-feed') {
      result.configureFeed = true
      continue
    }
    if (token === '--configure-feed-only') {
      result.configureFeedOnly = true
      continue
    }
    if (token === '--help' || token === '-h') {
      result.help = true
      continue
    }
    if (token.startsWith('--')) {
      result[token.slice(2)] = argv[index + 1] ?? ''
      index += 1
      continue
    }
    fail(`Unknown argument: ${token}`)
  }
  return result
}

function normalizeRepo(raw) {
  const value = String(raw ?? '').trim().replace(/\.git$/i, '')
  if (!value) return ''
  const match = value.match(/(?:github\.com[/:])([^/]+)\/([^/]+)$/i) || value.match(/^([^/]+)\/([^/]+)$/)
  return match ? `${match[1]}/${match[2]}` : ''
}

function inferRepo() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  return result.status === 0 ? normalizeRepo(result.stdout) : ''
}

function readFeedUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(feedPath, 'utf8'))
    return typeof raw.url === 'string' ? raw.url.trim().replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

function writeFeed(url) {
  fs.writeFileSync(feedPath, `${JSON.stringify({ url }, null, 2)}\n`)
  fs.writeFileSync(
    appUpdatePath,
    `provider: generic\nurl: ${JSON.stringify(url)}\nupdaterCacheDirName: triad-updater\n`
  )
}

function markdownFor(release) {
  const lines = [`# Triad ${release.version}`, '', release.title, '']
  for (const section of release.sections) {
    lines.push(`## ${section.title}`, '')
    for (const item of section.items) lines.push(`- ${item}`)
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

function yamlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function indent(value, prefix) {
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function isLoopback(url) {
  return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
}

function isLocalPath(value) {
  if (!value) return true
  if (/^file:\/\//i.test(value)) return true
  if (/^[a-z]:[\\/]/i.test(value)) return true
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)
}

function localPathFor(value) {
  if (/^file:\/\//i.test(value)) {
    try {
      return decodeURIComponent(new URL(value).pathname).replace(/^\/([a-z]:)/i, '$1')
    } catch {
      fail(`Invalid file URL: ${value}`)
    }
  }
  return path.resolve(root, value)
}

async function downloadInstaller(rawUrl, version) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    fail('The installer link must use HTTPS (localhost HTTP is allowed for testing).')
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'triad-update-'))
  const guessedName = path.basename(url.pathname) || `Triad-Setup-${version}.exe`
  const destination = path.join(tempDir, guessedName.toLowerCase().endsWith('.exe') ? guessedName : `${guessedName}.exe`)

  console.log(`Downloading installer from ${rawUrl}`)
  let response
  try {
    response = await fetch(rawUrl, { redirect: 'follow' })
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true })
    fail(`Could not download the installer link: ${error.message}`)
  }
  if (!response.ok || !response.body) {
    await fsp.rm(tempDir, { recursive: true, force: true })
    fail(`The installer link returned HTTP ${response.status} ${response.statusText}.`)
  }

  const total = Number(response.headers.get('content-length') ?? 0)
  let received = 0
  let lastPercent = -1
  const source = Readable.fromWeb(response.body)
  source.on('data', (chunk) => {
    received += chunk.length
    if (!total) return
    const percent = Math.min(100, Math.floor((received / total) * 100))
    if (percent >= lastPercent + 5) {
      lastPercent = percent
      process.stdout.write(`\r  ${percent}% (${(received / 1024 / 1024).toFixed(1)} MB)`)
    }
  })

  try {
    await pipeline(source, fs.createWriteStream(destination))
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true })
    fail(`The installer download was interrupted: ${error.message}`)
  }
  if (total) process.stdout.write('\r  100%                    \n')

  return {
    path: destination,
    sourceUrl: rawUrl,
    cleanup: () => fsp.rm(tempDir, { recursive: true, force: true })
  }
}

async function resolveInstaller(rawUrl, version, packageVersion) {
  if (!rawUrl) {
    if (version !== packageVersion) {
      fail(
        `No installer link was given, and package.json is ${packageVersion}. ` +
          `The local installer is release/Triad-Setup-${packageVersion}.exe.`
      )
    }
    const installerPath = path.join(releaseDir, `Triad-Setup-${version}.exe`)
    if (!fs.existsSync(installerPath)) {
      fail(`Missing local installer: ${path.relative(root, installerPath)}. Build it first, or paste a direct installer link.`)
    }
    return { path: installerPath, sourceUrl: '', cleanup: null }
  }

  if (isLocalPath(rawUrl)) {
    const installerPath = localPathFor(rawUrl)
    if (!fs.existsSync(installerPath)) fail(`Missing local installer: ${installerPath}`)
    return { path: installerPath, sourceUrl: '', cleanup: null }
  }

  return downloadInstaller(rawUrl, version)
}

async function inspectInstaller(installerPath) {
  const handle = await fsp.open(installerPath, 'r')
  const signature = Buffer.alloc(2)
  try {
    await handle.read(signature, 0, 2, 0)
  } finally {
    await handle.close()
  }
  if (signature.toString('ascii') !== 'MZ') {
    fail('That file is not a Windows installer (it does not start with MZ).')
  }

  const hash = crypto.createHash('sha512')
  await pipeline(fs.createReadStream(installerPath), hash)
  return {
    sha512: hash.digest('base64'),
    size: fs.statSync(installerPath).size
  }
}

function gh(args, options = {}) {
  const result = spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })
  if (result.error) {
    fail(`Could not run the GitHub CLI (gh): ${result.error.message}. Install it and run "gh auth login" first.`)
  }
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : ''
    fail(`GitHub CLI command failed${detail ? `: ${detail}` : ''}`)
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

function ensureGh() {
  gh(['auth', 'status'], { capture: true })
}

function releaseExists(tag, repo) {
  const result = spawnSync('gh', ['release', 'view', tag, '--repo', repo], {
    cwd: root,
    stdio: 'ignore'
  })
  if (result.error) fail(`Could not run the GitHub CLI (gh): ${result.error.message}.`)
  return result.status === 0
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`
Usage: node scripts/publish-update.cjs [options]

  --url <link-or-path>
                     Direct HTTPS link, or a local Windows installer path.
                     A local path is uploaded to the GitHub release via gh.
                     Leave empty to publish release/Triad-Setup-<version>.exe.
  --repo <owner/repo> GitHub repository that hosts the latest.yml feed.
  --configure-feed   Write resources/update-feed.json for this repository.
  --configure-feed-only
                     Write the feed and exit (used by send.bat before a local build).
  --dry-run          Build the manifest and reports without uploading.
  --no-upload        Same as --dry-run, but still downloads and hashes the installer.
  --version <x.y.z>  Version to publish. Defaults to package.json.

The installer is hashed locally, then latest.yml is published as the latest
GitHub release. With a link, the installer stays at that link. With a local
path, it is uploaded too; GitHub release assets can be up to 2 GiB each, so
the 25 MB website upload limit does not apply.
`)
    return
  }

  const repo = normalizeRepo(args.repo || process.env.GITHUB_REPOSITORY || inferRepo())
  if (args.configureFeedOnly) {
    if (!repo) fail('No GitHub repository given. Pass --repo owner/repo or set GITHUB_REPOSITORY.')
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const notes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'shared', 'releaseNotes.json'), 'utf8'))
    if (!notes.releases?.some((release) => String(release.version) === String(pkg.version))) {
      fail(
        `No patch notes found for ${pkg.version} in src/shared/releaseNotes.json. ` +
          'Add a release entry before building a launcher update.'
      )
    }
    writeFeed(`https://github.com/${repo}/releases/latest/download`)
    console.log(`Configured update feed: https://github.com/${repo}/releases/latest/download`)
    return
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const rawVersion = String(args.version || packageJson.version).trim()
  const version = rawVersion.replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`"${version}" is not a valid release version.`)
  }
  if (version !== packageJson.version) {
    console.warn(
      `\n[Triad update] Warning: package.json is ${packageJson.version}, but you are publishing ${version}. ` +
        'Use the installer built for this version and make sure its bundled releaseNotes.json has a matching entry.\n'
    )
  }

  const feedUrl = repo ? `https://github.com/${repo}/releases/latest/download` : ''
  if (!repo && !args.dryRun && !args.noUpload) {
    fail('No GitHub repository given. Pass --repo owner/repo or set GITHUB_REPOSITORY.')
  }

  const configuredFeed = readFeedUrl()
  if (repo) {
    if (args.configureFeed && configuredFeed !== feedUrl) {
      writeFeed(feedUrl)
      console.log(`Configured update feed: ${feedUrl}`)
    } else if (configuredFeed && configuredFeed !== feedUrl) {
      fail(
        `The project currently points at ${configuredFeed}, not ${feedUrl}. ` +
          'Use --configure-feed to switch it, or publish to the configured repository.'
      )
    } else if (!configuredFeed) {
      console.warn(
                  `\n[Triad update] This project has no update feed configured. Run send.bat ` +
          `(it configures the feed), or set TRIAD_UPDATE_URL=${feedUrl} and rebuild the installer.\n`
      )
    }
  }

  const releaseNotes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'shared', 'releaseNotes.json'), 'utf8'))
  const note = releaseNotes.releases?.find((release) => String(release.version) === version)
  if (!note) {
    fail(
      `No patch notes found for ${version} in src/shared/releaseNotes.json. ` +
        'Add a release entry for this version before sending the update.'
    )
  }

  const installer = await resolveInstaller(String(args.url ?? ''), version, packageJson.version)
  try {
    console.log(`Checking ${path.basename(installer.path)}…`)
    const { sha512, size } = await inspectInstaller(installer.path)

    const installerUrl = installer.sourceUrl || path.basename(installer.path)
    const markdown = markdownFor(note)
    const latest = [
      `version: ${yamlQuote(version)}`,
      'files:',
      `  - url: ${yamlQuote(installerUrl)}`,
      `    sha512: ${yamlQuote(sha512)}`,
      `    size: ${size}`,
      `path: ${yamlQuote(installerUrl)}`,
      `sha512: ${yamlQuote(sha512)}`,
      `releaseDate: ${yamlQuote(new Date().toISOString())}`,
      'releaseNotes: |-',
      indent(markdown, '  '),
      ''
    ].join('\n')

    fs.mkdirSync(releaseDir, { recursive: true })
    fs.writeFileSync(latestPath, latest)
    fs.writeFileSync(notesPath, markdown)
    console.log(`\nWrote ${path.relative(root, latestPath)}`)
    console.log(`Wrote ${path.relative(root, notesPath)}`)
    console.log(`Installer: ${installer.sourceUrl || path.relative(root, installer.path)}`)
    console.log(`SHA-512: ${sha512}`)

    if (args.dryRun || args.noUpload) {
      console.log('\n[Triad update] Dry run only. Nothing was uploaded.')
      return
    }

    if (!feedUrl) fail('Cannot publish without a GitHub repository.')
    ensureGh()

    const tag = `v${version}`
    const assetPaths = [latestPath, notesPath]
    if (!installer.sourceUrl) assetPaths.push(installer.path)

    if (releaseExists(tag, repo)) {
      console.log(`\nUpdating existing GitHub release ${tag} in ${repo}…`)
      gh(['release', 'upload', tag, ...assetPaths, '--repo', repo, '--clobber'])
      gh([
        'release',
        'edit',
        tag,
        '--repo',
        repo,
        '--title',
        `Triad ${version}`,
        '--notes-file',
        notesPath,
        '--latest'
      ])
    } else {
      console.log(`\nCreating GitHub release ${tag} in ${repo}…`)
      gh([
        'release',
        'create',
        tag,
        ...assetPaths,
        '--repo',
        repo,
        '--title',
        `Triad ${version}`,
        '--notes-file',
        notesPath,
        '--latest'
      ])
    }

    console.log(`\nPublished Triad ${version} to ${repo}.`)
    console.log(`Feed: ${feedUrl}/latest.yml`)
    console.log('Installed launchers will see it on their next check (at launch or hourly).')
    if (installer.sourceUrl) {
      console.log(`Installer link: ${installer.sourceUrl}`)
      console.log('The installer itself stays on that link; only latest.yml and the notes were published here.')
    }
    if (configuredFeed !== feedUrl || !configuredFeed) {
      console.log(
        '\nRemember: the installer at the link must itself have this feed baked in. ' +
          'If it was built before the feed was configured, rebuild it with this project and upload that build.'
      )
    }
  } finally {
    if (installer.cleanup) await installer.cleanup()
  }
}

main().catch((error) => fail(error?.stack || error?.message || String(error)))

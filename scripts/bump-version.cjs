#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const packagePath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')
const notesPath = path.join(root, 'src', 'shared', 'releaseNotes.json')
const dryRun = process.argv.includes('--dry-run')
const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

function fail(message) {
  console.error(`\n[Triad version] ${message}\n`)
  process.exit(1)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`Could not read ${path.relative(root, file)}: ${error.message}`)
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function main() {
  const pkg = readJson(packagePath)
  const notes = readJson(notesPath)
  const current = String(pkg.version ?? '').trim()
  const match = current.match(versionPattern)
  if (!match) fail(`package.json has an invalid version: "${current}"`)
  if (!Array.isArray(notes.releases)) fail('src/shared/releaseNotes.json has no releases array.')

  const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
  const existingNotes = notes.releases.find((release) => String(release.version) === next)

  if (dryRun) {
    console.log(`Triad version: ${current} -> ${next} (dry run; no files changed)`)
    console.log(existingNotes ? `Existing patch notes found for ${next}.` : `Would add maintenance patch notes for ${next}.`)
    return
  }

  pkg.version = next
  writeJson(packagePath, pkg)

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath)
    lock.version = next
    if (lock.packages?.['']) lock.packages[''].version = next
    writeJson(lockPath, lock)
  }

  if (!existingNotes) {
    notes.releases.unshift({
      version: next,
      title: 'Maintenance update',
      date: new Date().toISOString().slice(0, 10),
      sections: [
        {
          title: 'This build',
          items: ['Bug fixes and stability improvements.']
        }
      ]
    })
    writeJson(notesPath, notes)
    console.log(`Added maintenance patch notes for ${next}.`)
  } else {
    console.log(`Using existing patch notes for ${next}.`)
  }

  console.log(`Triad version bumped: ${current} -> ${next}`)
}

main()

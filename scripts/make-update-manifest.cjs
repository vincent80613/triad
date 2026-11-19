#!/usr/bin/env node
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const notes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'shared', 'releaseNotes.json'), 'utf8'))
const releaseDir = path.join(root, 'release')
const version = pkg.version
const installerName = `Triad-Setup-${version}.exe`
const installerPath = path.join(releaseDir, installerName)
const blockmapPath = `${installerPath}.blockmap`

for (const file of [installerPath, blockmapPath]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing build artifact: ${path.relative(root, file)}`)
    process.exit(1)
  }
}

const note = notes.releases.find((release) => release.version === version)
if (!note) {
  console.error(`No release notes found for ${version} in src/shared/releaseNotes.json.`)
  process.exit(1)
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

const markdown = markdownFor(note)
const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installerPath)).digest('base64')
const size = fs.statSync(installerPath).size
const latest = [
  `version: ${yamlQuote(version)}`,
  'files:',
  `  - url: ${yamlQuote(installerName)}`,
  `    sha512: ${yamlQuote(sha512)}`,
  `    size: ${size}`,
  `path: ${yamlQuote(installerName)}`,
  `sha512: ${yamlQuote(sha512)}`,
  `releaseDate: ${yamlQuote(new Date().toISOString())}`,
  'releaseNotes: |-',
  indent(markdown, '  '),
  ''
].join('\n')

fs.writeFileSync(path.join(releaseDir, 'latest.yml'), latest)
fs.writeFileSync(path.join(releaseDir, 'RELEASE_NOTES.md'), markdown)
console.log(`Wrote ${path.relative(root, path.join(releaseDir, 'latest.yml'))}`)
console.log(`Wrote ${path.relative(root, path.join(releaseDir, 'RELEASE_NOTES.md'))}`)

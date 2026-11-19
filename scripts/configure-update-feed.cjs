#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const resources = path.join(__dirname, '..', 'resources')
const target = path.join(resources, 'update-feed.json')
const appUpdateConfig = path.join(resources, 'app-update.yml')
const repository = process.env.GITHUB_REPOSITORY?.trim()
const explicitUrl = process.env.TRIAD_UPDATE_URL?.trim()
const rawUrl =
  explicitUrl ||
  (repository && /^[^/]+\/[^/]+$/.test(repository)
    ? `https://github.com/${repository}/releases/latest/download`
    : '')

if (!rawUrl) {
  console.error(
    'No update feed configured. Set TRIAD_UPDATE_URL (or run inside GitHub Actions with GITHUB_REPOSITORY set).'
  )
  process.exit(1)
}

let parsed
try {
  parsed = new URL(rawUrl)
} catch {
  console.error(`TRIAD_UPDATE_URL is not a valid URL: ${rawUrl}`)
  process.exit(1)
}

const local =
  parsed.protocol === 'http:' &&
  (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1')
if (parsed.protocol !== 'https:' && !local) {
  console.error('The public update feed must use HTTPS (localhost HTTP is allowed for testing).')
  process.exit(1)
}

const url = parsed.toString().replace(/\/+$/, '')
fs.writeFileSync(target, `${JSON.stringify({ url }, null, 2)}\n`)
fs.writeFileSync(
  appUpdateConfig,
  `provider: generic\nurl: ${JSON.stringify(url)}\nupdaterCacheDirName: triad-updater\n`
)
console.log(`Update feed written to ${path.relative(process.cwd(), target)}: ${url}`)
console.log(`Update config written to ${path.relative(process.cwd(), appUpdateConfig)}`)

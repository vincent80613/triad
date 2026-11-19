const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

app.disableHardwareAcceleration()

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(16 * images.length)
  let offset = 6 + directory.length
  images.forEach((entry, index) => {
    const at = index * 16
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at)
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1)
    directory.writeUInt8(0, at + 2)
    directory.writeUInt8(0, at + 3)
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(entry.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.data.length
  })
  return Buffer.concat([header, directory, ...images.map((entry) => entry.data)])
}

app
  .whenReady()
  .then(async () => {
    const root = path.join(__dirname, '..')
    const svg = await fs.readFile(path.join(root, 'src', 'renderer', 'src', 'assets', 'logo.svg'), 'utf8')
    const encoded = Buffer.from(svg).toString('base64')
    const html = `<!doctype html><style>html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}img{display:block;width:512px;height:512px}</style><img src="data:image/svg+xml;base64,${encoded}">`

    const win = new BrowserWindow({
      width: 512,
      height: 512,
      x: -10000,
      y: -10000,
      show: true,
      skipTaskbar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { backgroundThrottling: false }
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((resolve) => setTimeout(resolve, 900))

    const image = await win.webContents.capturePage()
    if (image.isEmpty()) throw new Error('Icon capture returned an empty image.')
    const png512 = image.toPNG()
    if (png512.length < 1000) throw new Error('Icon capture looks empty.')

    const buildDir = path.join(root, 'build')
    const resourcesDir = path.join(root, 'resources')
    await fs.mkdir(buildDir, { recursive: true })
    await fs.mkdir(resourcesDir, { recursive: true })
    await fs.writeFile(path.join(buildDir, 'icon.png'), png512)
    await fs.writeFile(path.join(resourcesDir, 'icon.png'), png512)

    const sizes = [16, 24, 32, 48, 64, 128, 256]
    const images = sizes.map((size) => ({
      size,
      data: size === 512 ? png512 : image.resize({ width: size, height: size, quality: 'best' }).toPNG()
    }))
    await fs.writeFile(path.join(buildDir, 'icon.ico'), buildIco(images))

    console.log(`PNG ${png512.length} bytes, ICO ${sizes.join('/')} written`)
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })

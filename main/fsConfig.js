const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const rfs = require('rotating-file-stream')

let initialized = false
let cfg = null
let logStream = null

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function createLogStream(logsDir) {
  ensureDir(logsDir)
  const stream = rfs.createStream('app.log', {
    size: '1M',
    compress: 'gzip',
    path: logsDir,
  })
  stream.on('rotated', async (filename) => {
    try {
      const files = fs.readdirSync(logsDir).filter(f => f.startsWith('app.log') )
      // Keep newest 5
      const stats = files.map(f => ({ f, t: fs.statSync(path.join(logsDir, f)).mtimeMs }))
      stats.sort((a,b) => b.t - a.t)
      const toDelete = stats.slice(5)
      for (const d of toDelete) {
        fs.unlinkSync(path.join(logsDir, d.f))
      }
    } catch (_) {}
  })
  return stream
}

async function validateImage(p) {
  try {
    const { fileTypeFromFile } = await import('file-type')
    const t = await fileTypeFromFile(p)
    if (!t) return false
    return ['image/png','image/jpeg','image/webp'].includes(t.mime)
  } catch (_) {
    return false
  }
}

function toFileUrl(p) {
  const pre = process.platform === 'win32' ? '/' : ''
  return 'file://' + pre + p.replace(/\\/g, '/')
}

const fsConfig = {
  init() {
    if (initialized) return cfg
    const isProd = app.isPackaged
    const base = isProd
      ? path.join(app.getPath('userData'), 'storage')
      : path.resolve(__dirname, '../storage')
    const upcsDir = path.join(base, 'upcs')
    const imagesDir = path.join(base, 'images')
    const responsesDir = path.join(base, 'responses')
    const promptsDir = path.join(base, 'prompts')
    const logsDir = path.join(base, 'logs')
    ;[base, upcsDir, imagesDir, responsesDir, promptsDir, logsDir].forEach(ensureDir)

    // placeholder path
    const placeholder = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'placeholder.png')
      : path.resolve(__dirname, '../renderer/public/placeholder.png')

    logStream = createLogStream(logsDir)
    const log = (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`
      try { logStream.write(line) } catch (_) {}
      if (!isProd) console.log(line.trim())
    }

    cfg = { base, upcsDir, imagesDir, responsesDir, promptsDir, logsDir, placeholder, log, toFileUrl, resolveImage: async (filename) => {
      try {
        const full = path.join(imagesDir, filename)
        if (fs.existsSync(full)) {
          const ok = await validateImage(full)
          if (ok) return full
        }
      } catch (_) {}
      return placeholder
    }}

    // Log resolved paths on startup
    log(`Storage base: ${base}`)
    log(`Paths: upcs=${upcsDir} images=${imagesDir} responses=${responsesDir} prompts=${promptsDir} logs=${logsDir}`)
    initialized = true
    return cfg
  },
  get() {
    if (!cfg) return this.init()
    return cfg
  }
}

module.exports = { fsConfig }


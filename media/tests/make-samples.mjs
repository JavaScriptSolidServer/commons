// Makes the sample media in ../samples, all drawn or synthesised here (nothing is downloaded):
// small PNG and SVG pictures, short WAV tones written byte by byte, and a short WebM clip
// recorded from a canvas in headless Chromium (the only way to get a real video file without a codec).
//   node tests/make-samples.mjs          makes what is missing
//   node tests/make-samples.mjs --all    makes everything again
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import path from 'node:path'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const again = process.argv.includes('--all')
const put = (rel, data) => {
  const file = path.join(SAMPLES, rel)
  if (existsSync(file) && !again) return
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, data)
  console.log('made samples/' + rel)
}

// PNG: 8-bit RGB, one zlib stream, the pixel colour from a function of (x, y).
function png (w, h, colour) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colour(x / w, y / h)
      const at = y * (w * 3 + 1) + 1 + x * 3
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// A lake: sky, a far shore, water with a sun's reflection.
const lake = (x, y) => {
  if (y < 0.55) { const sun = Math.hypot(x - 0.7, y - 0.3) < 0.08; return sun ? [255, 236, 170] : mix([120, 170, 235], [250, 205, 160], y / 0.55) }
  if (y < 0.6) return [52, 92, 70]
  const glint = Math.abs(x - 0.7) < 0.04 * (1 - (y - 0.6)) && ((y * 60) | 0) % 2 === 0
  return glint ? [250, 225, 170] : mix([60, 110, 160], [25, 55, 95], (y - 0.6) / 0.4)
}
// Rolling hills.
const hills = (x, y) => {
  const h1 = 0.55 + 0.08 * Math.sin(x * 7), h2 = 0.7 + 0.06 * Math.sin(x * 11 + 2)
  if (y > h2) return mix([70, 140, 60], [40, 100, 45], (y - h2) / (1 - h2))
  if (y > h1) return mix([120, 175, 90], [90, 150, 75], (y - h1) / (h2 - h1))
  return mix([180, 215, 245], [235, 245, 252], y / h1)
}
// Dusk over a city.
const dusk = (x, y) => {
  const tower = [[0.1, 0.55], [0.22, 0.4], [0.35, 0.62], [0.5, 0.35], [0.63, 0.5], [0.78, 0.45], [0.9, 0.6]]
  for (const [cx, top] of tower) if (Math.abs(x - cx) < 0.05 && y > top) return ((x * 90 | 0) % 3 === 0 && (y * 60 | 0) % 3 === 0) ? [250, 210, 110] : [35, 30, 60]
  return mix([60, 40, 110], [245, 140, 90], y)
}
// Tall trees, for a portrait picture.
const forest = (x, y) => {
  for (let i = 0; i < 5; i++) {
    const cx = 0.1 + i * 0.2, top = 0.2 + (i % 2) * 0.15
    if (y > top && Math.abs(x - cx) < (y - top) * 0.3) return mix([40, 110, 60], [20, 70, 40], y)
  }
  return y > 0.9 ? [90, 70, 50] : mix([210, 230, 240], [170, 205, 225], y)
}

put('gallery/alice-lake.png', png(240, 160, lake))
put('gallery/bob-hills.png', png(240, 160, hills))
put('gallery/city-dusk.png', png(240, 160, dusk))
put('gallery/forest.png', png(120, 180, forest))
put('gallery/carol-sun.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient></defs>
<rect width="240" height="160" fill="url(#g)"/><circle cx="120" cy="92" r="38" fill="#fff3c4"/>
<path d="M0 120 Q60 100 120 120 T240 120 V160 H0Z" fill="#6c4a8c"/></svg>
`)
put('gallery/about.txt', 'Holiday pictures from Alice, Bob and Carol. Made up for the media pane samples.\n')

// WAV: 16-bit mono PCM at 8000 Hz; a few notes with a soft start and end.
function wav (notes, seconds) {
  const rate = 8000, count = Math.round(rate * seconds)
  const out = Buffer.alloc(44 + count * 2)
  out.write('RIFF', 0); out.writeUInt32LE(36 + count * 2, 4); out.write('WAVE', 8)
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34)
  out.write('data', 36); out.writeUInt32LE(count * 2, 40)
  const each = count / notes.length
  for (let i = 0; i < count; i++) {
    const n = Math.min(notes.length - 1, Math.floor(i / each)), t = (i % each) / each
    const envelope = Math.min(1, t * 20, (1 - t) * 8)
    out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * notes[n] * i / rate) * 9000 * envelope), 44 + i * 2)
  }
  return out
}
put('music/01-morning.wav', wav([523, 659, 784], 1.2))
put('music/02-noon.wav', wav([440, 554], 0.8))
put('music/03-night.wav', wav([392, 330, 262], 1.2))

put('mixed/cover.png', png(120, 80, hills))
for (const [name, text] of [['plan.txt', 'Plan for the week.\n'], ['budget.txt', 'Budget: made up.\n'], ['minutes.txt', 'Minutes of a made-up meeting.\n'], ['list.txt', 'A list.\n']]) put('mixed/' + name, text)
put('docs/readme.txt', 'Just documents, no media.\n')
put('docs/people.ttl', '@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n<#alice> foaf:name "Alice".\n<#bob> foaf:name "Bob".\n')

put('private/secret-garden.png', png(240, 160, forest))
put('private/secret-lake.png', png(240, 160, lake))
put('private/hum.wav', wav([330, 392], 0.8))

// The video: a canvas recorded with MediaRecorder in headless Chromium.
const VIDEO = path.join(SAMPLES, 'music', 'clip.webm')
if (!existsSync(VIDEO) || again) {
  const { launch } = await import('../../lib/cdp.mjs')
  const page = await launch({ profile: path.join(import.meta.dirname, 'profile-make'), port: 9513, width: 400, height: 300 })
  try {
    const b64 = await page.evaluate(() => new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
      document.body.appendChild(canvas)
      const g = canvas.getContext('2d')
      const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: 'video/webm;codecs=vp8' })
      const parts = []
      recorder.ondataavailable = (e) => parts.push(e.data)
      recorder.onerror = reject
      recorder.onstop = async () => {
        const bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
        let s = ''; for (const b of bytes) s += String.fromCharCode(b)
        resolve(btoa(s))
      }
      const start = performance.now()
      const draw = () => {
        const t = (performance.now() - start) / 1500
        g.fillStyle = '#dbeafe'; g.fillRect(0, 0, 160, 90)
        g.fillStyle = '#2563eb'; g.beginPath(); g.arc(20 + t * 120, 45 + Math.sin(t * 6) * 20, 12, 0, 7); g.fill()
        if (t < 1) requestAnimationFrame(draw); else recorder.stop()
      }
      recorder.start(); draw()
    }))
    mkdirSync(path.dirname(VIDEO), { recursive: true })
    writeFileSync(VIDEO, Buffer.from(b64, 'base64'))
    console.log('made samples/music/clip.webm (' + Buffer.from(b64, 'base64').length + ' bytes)')
  } finally { await page.close() }
}

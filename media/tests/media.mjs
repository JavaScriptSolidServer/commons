// The media pane on the test pod, logged in: the photo grid and large view, the playlist, single files,
// a private folder through the logged-in fetch, blob URLs revoked on leaving, a reload, and that nothing is written.
//   node tests/media.mjs          logs in, everything at 1300 px
//   node tests/media.mjs 400      reuses that login; layout and the main views at a true 400 px (design/viewport.mjs)
import { open, config, POD, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const width = +(process.argv[2] || 1300)
const BASE = POD + 'public/suite-data/media/'
const DIR = path.join(config.podDir, 'public', 'suite-data', 'media')
const PANE = LAB + 'media/media-pane.js'
const { page, check, finish, shot, address: at } = await open({ pane: PANE, port: 9513, dir: import.meta.dirname, width: 1300, login: width === 1300 })
if (width === 400) await narrow(page) // a true 400 px page (CDP device metrics), not the helper's ~500 px window

// Every file on disk with its size and time, to show the pane wrote nothing.
const snapshot = () => {
  const out = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(p.slice(DIR.length) + ' ' + s.size + ' ' + s.mtimeMs) } }
  walk(DIR)
  return out.sort().join('\n')
}
const before = snapshot()

const pane = (sel) => `document.querySelector('.med.media-pane ${sel}')`
const visible = (sel) => page.evaluate(`(() => { const e = ${pane(sel)}; return !!e && !!(e.offsetWidth || e.offsetHeight) })()`)
const go = async (uri, ready) => {
  await page.goto(at(uri))
  return page.waitFor(ready, { timeout: 40000 }).then(() => true, () => false)
}
const thumbsLoaded = (n) => page.waitFor((n) => { const imgs = [...document.querySelectorAll('.med-grid img')]; return imgs.length === n && imgs.every(i => i.complete && i.naturalWidth > 0) }, { timeout: 20000, args: [n] }).then(() => true, () => false)
const wide = async () => { const m = await measure(page); if (m.sideways) console.log('     sideways: ' + JSON.stringify(m)); return m.sideways }
// A real mouse click (a user gesture, which the browser needs before it plays sound).
const realClick = async (sel, i = 0) => {
  const r = await page.evaluate((v) => { const [sel, i] = JSON.parse(v); const e = document.querySelectorAll(sel)[i]; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, JSON.stringify([sel, i]))
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 })
}
const key = (k) => page.evaluate((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k)
const boxState = () => page.evaluate(() => { const b = document.querySelector('.med-box'); const img = b && b.querySelector('.med-frame img'); return { open: !!b && !b.hidden, name: b && b.querySelector('.med-bname').textContent, count: b && b.querySelector('.med-count').textContent, img: img ? img.complete && img.naturalWidth : 0 } })

try {
  // The gallery: most of it is media, so the pane opens first.
  const opened = await go(BASE + 'gallery/', () => document.querySelectorAll('.med.media-pane .med-tile').length > 0)
  check(width + ' px: a folder of photos opens in the pane, ahead of the folder view', opened && await visible('.med-grid'))
  const names = await page.evaluate(() => [...document.querySelectorAll('.med-name')].map(n => n.textContent))
  check('the five pictures, by name, the text file left out', names.join(',') === 'alice-lake.png,bob-hills.png,carol-sun.svg,city-dusk.png,forest.png', names.join(','))
  const meta = await page.evaluate(() => document.querySelector('.med-meta').textContent)
  check('it counts the photos and says one item is not shown', meta === '5 photos · 1 other item not shown', meta)
  check('the thumbnails load (PNG and SVG)', await thumbsLoaded(5))
  check('public thumbnails use the file address, not a blob', await page.evaluate(() => [...document.querySelectorAll('.med-grid img')].every(i => i.src.startsWith('http'))))
  check('the pane labels the folder Photos', await page.evaluate((u) => window.panes.byName('media').label(window.SolidLogic.store.sym(u), { session: { store: window.SolidLogic.store } }), BASE + 'gallery/') === 'Photos')
  if (width === 1300) await shot('gallery-1300')
  else await shot('gallery-400')
  check('no sideways scroll on the gallery at ' + width + ' px', !await wide())

  // The large view.
  await realClick('.med-tile', 1)
  await page.waitFor(() => { const b = document.querySelector('.med-box'); const i = b && b.querySelector('.med-frame img'); return b && !b.hidden && i && i.complete && i.naturalWidth > 0 }, { timeout: 10000 })
  let s = await boxState()
  check('clicking a photo opens it large, with its name and place', s.open && s.name === 'bob-hills.png' && s.count === '2 / 5' && s.img === 240, JSON.stringify(s))
  check('focus moves into the large view', await page.evaluate(() => document.activeElement === document.querySelector('.med-close')))
  await shot('large-' + width)
  check('no sideways scroll in the large view at ' + width + ' px', !await wide())
  await key('ArrowRight'); s = await boxState()
  check('right arrow: the next photo', s.name === 'carol-sun.svg' && s.count === '3 / 5', JSON.stringify(s))
  await page.evaluate(() => document.querySelector('.med-next').click()); s = await boxState()
  check('the next button', s.name === 'city-dusk.png', s.name)
  await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft'); s = await boxState()
  check('left arrow back to the first', s.name === 'alice-lake.png' && s.count === '1 / 5', JSON.stringify(s))
  await page.evaluate(() => document.querySelector('.med-prev').click()); s = await boxState()
  check('previous from the first wraps to the last', s.name === 'forest.png' && s.count === '5 / 5', JSON.stringify(s))
  // Its details, beside it (alone: the viewer's own side panel).
  await page.evaluate(() => document.querySelector('.med-info').click())
  const side = await page.waitFor(() => { const d = document.querySelector('.med-side:not([hidden]) .med-details-wrap'); const p = d && [...d.querySelectorAll('.med-props dt')].map(t => t.textContent + '=' + t.nextElementSibling.textContent).join('|'); return p && /Dimensions=/.test(p) && d.querySelector('.med-details-title').textContent + '|' + p }, { timeout: 10000 }).catch(() => '')
  check('the Details button shows the photo\'s name, type, dimensions, size and date beside it', /^forest\.png\|Type=PNG image[^|]*\|Dimensions=\d+ × \d+ pixels\|Size=1\.2 kB\|Modified=.+\|Folder=gallery\|Address=http/.test(side), side)
  await shot('large-details-' + width)
  check('no sideways scroll with the details open at ' + width + ' px', !await wide())
  await key('ArrowLeft'); await page.waitFor(() => /city-dusk/.test(document.querySelector('.med-side .med-details-title').textContent), { timeout: 5000 }).catch(() => {})
  check('the details follow the photo', await page.evaluate(() => document.querySelector('.med-side .med-details-title').textContent) === 'city-dusk.png')
  await key('Escape'); s = await boxState()
  check('Escape first closes the details, the photo stays', s.open && await page.evaluate(() => document.querySelector('.med-side').hidden && document.querySelector('.med-info').getAttribute('aria-pressed') === 'false'), JSON.stringify(s))
  await key('Escape'); s = await boxState()
  check('Escape closes it and focus goes back to the photo', !s.open && await page.evaluate(() => document.activeElement === document.querySelectorAll('.med-tile')[1]), JSON.stringify(s))

  // The playlist.
  const music = await go(BASE + 'music/', () => document.querySelectorAll('.med-track').length === 4)
  check('a folder of sound and video opens as a playlist', music)
  const tracks = await page.evaluate(() => [...document.querySelectorAll('.med-track')].map(t => t.querySelector('.med-tname').textContent + '|' + t.querySelector('.med-kind').textContent))
  check('the tracks in order, with their kind', tracks.join(',') === '01-morning.wav|Audio,02-noon.wav|Audio,03-night.wav|Audio,clip.webm|Video', tracks.join(','))
  check('the first track is ready, not playing', await page.evaluate(() => { const a = document.querySelector('.med-player audio'); return !!a && a.paused && a.controls }))
  await shot('playlist-' + width)
  check('no sideways scroll on the playlist at ' + width + ' px', !await wide())
  if (width === 1300) {
    await realClick('.med-track', 1)
    const playing = await page.waitFor(() => { const a = document.querySelector('.med-player audio'); return a && !a.paused && a.currentTime > 0 && /02-noon/.test(document.querySelector('.med-now').textContent) }, { timeout: 10000 }).then(() => true, () => false)
    check('clicking a track plays it', playing)
    check('the track playing is marked', await page.evaluate(() => document.querySelectorAll('.med-track')[1].getAttribute('aria-current') === 'true'))
    const moved = await page.waitFor(() => /03-night/.test(document.querySelector('.med-now').textContent) && document.querySelectorAll('.med-track')[2].getAttribute('aria-current') === 'true', { timeout: 10000 }).then(() => true, () => false)
    check('when it ends, the next one plays', moved && await page.waitFor(() => { const a = document.querySelector('.med-player audio'); return a && !a.paused }, { timeout: 5000 }).then(() => true, () => false))
    await page.evaluate(() => document.querySelectorAll('.med-track')[3].click())
    const vid = await page.waitFor(() => { const v = document.querySelector('.med-player video'); return v && v.videoWidth }, { timeout: 10000 }).catch(() => 0)
    check('a video track plays in a video player', vid === 160, String(vid))
    await sleep(300)
    await shot('playlist-video-1300')
  }

  // A folder that is mostly documents: the pane is offered but does not take over.
  await go(BASE + 'mixed/', () => !!window.panes && !!window.SolidLogic && window.SolidLogic.store.each(window.SolidLogic.store.sym(location.href.match(/uri=([^&]+)/) ? decodeURIComponent(location.href.match(/uri=([^&]+)/)[1]) : ''), window.SolidLogic.store.sym('http://www.w3.org/ns/ldp#contains')).length === 5)
  await sleep(1500)
  const mixed = await page.evaluate((u) => { const st = window.SolidLogic.store; const p = window.panes.byName('media'); const n = st.sym(u); return { label: p.label(n, { session: { store: st } }), focus: p.shouldGetFocus(n), shown: [...document.querySelectorAll('.med.media-pane')].some(e => e.offsetWidth > 0) } }, BASE + 'mixed/')
  check('one picture among documents: offered as Photos, but the folder view stays in front', mixed.label === 'Photos' && !mixed.focus && !mixed.shown, JSON.stringify(mixed))
  await shot('mixed-' + width)
  await go(BASE + 'docs/', () => !!window.panes && window.SolidLogic.store.each(window.SolidLogic.store.sym(decodeURIComponent(location.href.match(/uri=([^&]+)/)[1])), window.SolidLogic.store.sym('http://www.w3.org/ns/ldp#contains')).length === 2)
  const docs = await page.evaluate((u) => { const st = window.SolidLogic.store; const p = window.panes.byName('media'); const n = st.sym(u); return { label: p.label(n, { session: { store: st } }), focus: p.shouldGetFocus(n), shown: !!document.querySelector('.med.media-pane') } }, BASE + 'docs/')
  check('a folder of documents only is left alone', docs.label === null && !docs.focus && !docs.shown, JSON.stringify(docs))

  // Single files.
  const one = await go(BASE + 'gallery/alice-lake.png', () => { const i = document.querySelector('.med-single img'); return i && i.complete && i.naturalWidth > 0 })
  check('one picture: shown, with its name and size', one && await page.evaluate(() => document.querySelector('.med-title').textContent === 'alice-lake.png' && /240 × 160/.test(document.querySelector('.med-cap').textContent)))
  await shot('image-' + width)
  check('no sideways scroll on one picture at ' + width + ' px', !await wide())
  const svg = await go(BASE + 'gallery/carol-sun.svg', () => { const i = document.querySelector('.med-single img'); return i && i.complete && i.naturalWidth > 0 })
  check('an SVG picture is shown', svg)
  const wav = await go(BASE + 'music/03-night.wav', () => { const a = document.querySelector('.med-single audio'); return a && a.readyState >= 1 && a.duration })
  check('one sound file: an audio player that knows its length', wav && await page.evaluate(() => Math.abs(document.querySelector('.med-single audio').duration - 1.2) < 0.05 && document.querySelector('.med-single audio').controls))
  await shot('audio-' + width)
  const webm = await go(BASE + 'music/clip.webm', () => { const v = document.querySelector('.med-single video'); return v && v.videoWidth })
  check('one video file: a video player', webm && await page.evaluate(() => document.querySelector('.med-single video').controls))
  await shot('video-' + width)
  check('no sideways scroll on a video at ' + width + ' px', !await wide())

  if (width === 1300) {
    // Private: the folder and its files can only be read logged in, so they come through blob: URLs.
    const priv = await go(BASE + 'private/', () => document.querySelectorAll('.med-track').length === 1 && document.querySelectorAll('.med-tile').length === 2)
    check('a private folder opens with its photos and track', priv)
    check('private thumbnails load through the logged-in fetch, as blob: URLs', await thumbsLoaded(2) && await page.evaluate(() => [...document.querySelectorAll('.med-grid img')].every(i => i.src.startsWith('blob:'))))
    await sleep(800)
    check('the private track is not downloaded until asked for: a Play button, no player yet', await page.evaluate(() => !document.querySelector('.med-player audio') && !!document.querySelector('.med-player .med-load') && !performance.getEntriesByType('resource').some(e => /hum\.wav/.test(e.name))))
    await page.evaluate(() => document.querySelector('.med-player .med-load').click())
    check('Play: the private track loads the same way, as a blob: URL', await page.waitFor(() => { const a = document.querySelector('.med-player audio'); return a && a.src.startsWith('blob:') && a.readyState >= 1 }, { timeout: 10000 }).then(() => true, () => false))
    await page.evaluate(() => document.querySelectorAll('.med-tile')[0].click())
    check('a private photo opens large from the same blob', await page.waitFor(() => { const i = document.querySelector('.med-frame img'); return i && i.complete && i.naturalWidth > 0 && i.src === document.querySelectorAll('.med-grid img')[0].src }, { timeout: 10000 }).then(() => true, () => false))
    await key('Escape')
    await shot('private-1300')
    // Leave the folder inside the page: the blob URLs are given back.
    const made = await page.evaluate(() => [...new Set([...document.querySelectorAll('.med img, .med audio')].map(e => e.src))].filter(s => s.startsWith('blob:')))
    await page.evaluate((u) => { window.__revoked = []; const r = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (x) => { window.__revoked.push(x); r(x) }; const o = window.panes.getOutliner ? window.panes.getOutliner(document) : (window.outliner || (window.UI && window.UI.outliner)); (o || window.SolidLogic.outliner).GotoSubject(window.SolidLogic.store.sym(u), true, undefined, true, undefined) }, BASE + 'gallery/').catch(e => console.log('     navigate: ' + e.message))
    const revoked = await page.waitFor((n) => window.__revoked && window.__revoked.length >= n && window.__revoked, { timeout: 10000, args: [made.length] }).catch(() => [])
    check('leaving the folder revokes its blob: URLs', made.length === 3 && made.every(u => revoked.includes(u)), made.length + ' made, ' + revoked.length + ' revoked')
    const privOne = await go(BASE + 'private/secret-lake.png', () => { const i = document.querySelector('.med-single img'); return i && i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:') })
    check('one private picture is shown through the logged-in fetch', privOne)

    // A picture that loads but cannot be decoded says so (it does not stay a broken image).
    const bad = await go(BASE + 'broken/', () => { const t = [...document.querySelectorAll('.med-tile')]; return t.length === 2 && /Could not show/.test(t[0].querySelector('.med-thumb').textContent) && t[1].querySelector('img') && t[1].querySelector('img').naturalWidth > 0 })
    check('a picture that cannot be decoded: "Could not show this file."; the good one shows', bad)
    // A folder without media, drawn by the pane anyway: an empty state, not a blank.
    const empty = await page.evaluate(async (u) => { const st = window.SolidLogic.store; const n = st.sym(u); await st.fetcher.load(n); const r = window.panes.byName('media').render(n, { dom: document, session: { store: st } }); return r.querySelector('.med-empty .med-empty-title') ? r.querySelector('.med-empty-title').textContent + '|' + !!r.querySelector('.med-empty-icon .med-icon') : '' }, BASE + 'docs/')
    check('a folder with no media gets an empty state (icon, title, sentence)', empty === 'No photos or sound here|true', empty)

    // A reload reads back the same.
    await go(BASE + 'gallery/', () => document.querySelectorAll('.med-tile').length === 5)
    await page.reload()
    await page.waitFor(() => document.querySelectorAll('.med-tile').length === 5, { timeout: 40000 })
    check('after a reload it shows the same', await thumbsLoaded(5) && (await page.evaluate(() => [...document.querySelectorAll('.med-name')].map(n => n.textContent))).join(',') === names.join(','))
  }
  check('nothing on the pod changed (read-only)', snapshot() === before)
  await finish()
} catch (error) { await finish(error) }

// The document pane on the test pod, logged in: every kind of file it shows, a hostile page that
// must not run, the states (private, missing, too large), what it does not claim, and a reload.
//   node tests/document.mjs
import { open, sleep } from '../../lib/lib.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setup, DATA, SAMPLES, PANE, PORT, PRIVATE_TEXT, SETTLED, SEEN, DIRECT } from './setup.mjs'

setup()
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, width: 1300, login: true, resource: DATA + 'notes.txt' })
const sample = (f) => readFileSync(path.join(SAMPLES, f), 'utf8')

// Every request the page makes, frames included.
const requests = []
await page.send('Network.enable')
page.on(({ method, params }) => { if (method === 'Network.requestWillBeSent') requests.push(params.request.method + ' ' + params.request.url) })
const asked = (part) => requests.filter(r => r.includes(part))

async function view (uri) {
  await page.goto(address(uri))
  const ok = await page.waitFor(SETTLED, { timeout: 40000 }).catch(() => false)
  await sleep(800)
  return ok ? page.evaluate(SEEN) : null
}

// The sandboxed frame has an origin of its own, so Chromium runs it as a separate DevTools target.
// Attach to it directly to look inside, and to see the requests it makes.
let frame = null
async function attachFrame () {
  if (frame) { try { frame.ws.close() } catch {} frame = null }
  for (let i = 0; i < 30 && !frame; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const target = list.find(t => t.type === 'iframe' && t.url === 'about:srcdoc')
    if (target) {
      const ws = new WebSocket(target.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
      const pending = new Map()
      const requests = []
      let id = 0
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
        if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.method + ' ' + m.params.request.url)
      }
      const send = (method, params = {}) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })) })
      await send('Network.enable')
      frame = { ws, send, requests }
    } else await sleep(300)
  }
  return frame
}
async function inFrame (expression) {
  if (!frame) return { error: 'no frame' }
  const m = await frame.send('Runtime.evaluate', { expression, returnByValue: true })
  return m.error ? { error: m.error.message } : m.result.exceptionDetails ? { error: m.result.exceptionDetails.text } : m.result.result.value
}

// A real mouse click, at an element inside the frame.
async function clickInFrame (selector) {
  const outer = await page.evaluate(() => { const f = document.querySelector('.doc-frame'); f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.x + 1, y: r.y + 1 } })
  const inner = await inFrame(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  if (!inner || inner.error) return false
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: outer.x + inner.x, y: outer.y + inner.y, button: 'left', clickCount: 1 })
  return true
}
const loaded = () => inFrame('performance.getEntriesByType("resource").map(e => e.name).join(" ")')

try {
  // Plain text.
  let seen = await view(DATA + 'notes.txt')
  check('a text file opens in this pane, which takes the focus', !!seen && /^Text · \d/.test(seen.meta), seen && seen.meta)
  check('text: exactly the file, as text', seen.pre && seen.pre.text === sample('notes.txt'))
  check('text: markup in it stays text (nothing made of it)', seen.scripts === 0 && seen.pre.text.includes('<script>alert(1)</script>'))
  check('text: its size and lines are shown', /bytes|KB/.test(seen.meta) && /\d+ lines/.test(seen.meta), seen.meta)
  check('text: "Open in a new tab" is the file itself, rel noopener', seen.links[0] === `Open in a new tab|${DATA}notes.txt|noopener noreferrer|`, seen.links[0])
  check('text: no sideways scroll at 1300 px', !seen.wide)
  await shot('text-1300')

  await page.reload()
  await page.waitFor(SETTLED, { timeout: 40000 })
  const again = await page.evaluate(SEEN)
  check('after a reload it reads back the same', again.pre && again.pre.text === seen.pre.text && again.meta === seen.meta)

  seen = await view(DATA + 'server.log')
  check('a .log file is shown as text', seen && seen.pre && seen.pre.text === sample('server.log') && /6 lines/.test(seen.meta), seen && seen.meta)

  // CSV.
  seen = await view(DATA + 'team.csv')
  check('CSV: a table first, header from the first row', seen.table && !seen.table.hidden && seen.table.head.join('|') === 'name|role|email|notes' && seen.pre.hidden, seen.table && seen.table.head.join('|'))
  check('CSV: quoted commas, "" and line breaks inside a cell are read right', seen.table.rows.length === 3 && seen.table.rows[0][3] === 'Runs the meetings, keeps the minutes' && seen.table.rows[1][3] === 'Says "no" to new tools, usually' && seen.table.rows[2][3] === 'Two lines:\nfirst, then second', JSON.stringify(seen.table.rows))
  check('CSV: it says how many rows', /3 rows under the header/.test(seen.note), seen.note)
  await shot('csv-1300')
  await page.evaluate(() => [...document.querySelectorAll('.doc-tabs button')].find(b => b.textContent === 'Text').click())
  seen = await page.evaluate(SEEN)
  check('CSV: the Text button shows the file as text', seen.table.hidden && !seen.pre.hidden && seen.pre.text === sample('team.csv'))
  await page.evaluate(() => [...document.querySelectorAll('.doc-tabs button')].find(b => b.textContent === 'Table').click())
  check('CSV: and Table brings the table back', await page.evaluate(() => !document.querySelector('.doc-tablewrap').hidden && document.querySelector('.doc-text').hidden))

  seen = await view(DATA + 'long.csv')
  check('a long CSV: only the first 500 rows in the table, and it says so', seen.table.rows.length === 500 && /Showing the first 500 of 1200 rows/.test(seen.note), seen.table.rows.length + ' ' + seen.note)
  check('a long CSV: the text view has every row', seen.pre.text.split('\n').length === 1202)

  // Very wide CSVs: the table is capped (50 columns, 20,000 cells), so the reader does not freeze.
  let t0 = Date.now()
  seen = await view(DATA + 'wide.csv')
  check('a CSV of 400,000 columns: shown quickly, 50 columns, and it says so', !!seen && seen.table && seen.table.head.length === 50 && /first 50 of 400001 columns/.test(seen.note) && Date.now() - t0 < 20000, seen ? seen.table.head.length + ' ' + seen.note + ' ' + (Date.now() - t0) + ' ms' : 'not settled')
  t0 = Date.now()
  seen = await view(DATA + 'grid.csv')
  check('a CSV of 2,000 rows by 500 columns: 400 rows of 50 columns (20,000 cells), and it says so', !!seen && seen.table.head.length === 50 && seen.table.rows.length === 400 && /Showing the first 400 of 2000 rows and the first 50 of 500 columns/.test(seen.note) && Date.now() - t0 < 20000, seen ? seen.table.rows.length + ' ' + seen.note + ' ' + (Date.now() - t0) + ' ms' : 'not settled')
  check('a wide CSV: no sideways scroll (it scrolls in its own box)', !seen.wide)

  // A plain HTML page.
  seen = await view(DATA + 'welcome.html')
  check('an HTML page opens in a frame in this pane', !!seen && !!seen.frame && seen.meta.startsWith('HTML page'), seen && seen.meta)
  check('HTML: the frame is sandboxed with nothing allowed', seen.frame.sandbox === '')
  check('HTML: the page cannot reach into the frame (it has its own origin)', seen.frame.reachable === false)
  check('HTML: a policy that forbids scripts and a base address come first', /^<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none';/i.test(seen.frame.srcdoc) && seen.frame.srcdoc.includes(`<base href="${DATA}welcome.html" target="_blank">`), seen.frame.srcdoc.slice(0, 200))
  check('HTML: "Shown without scripts." and that pictures from other sites load', /^Shown without scripts\./.test(seen.note) && /pictures from other sites are loaded/.test(seen.note), seen.note)
  check('HTML on the browser\'s own site: no "Open in a new tab" (its scripts would run here), Download instead, and it says why', seen.links.length === 1 && seen.links[0].startsWith('Download|' + DATA + 'welcome.html|') && seen.links[0].endsWith('|welcome.html') && /use Download/.test(seen.note), seen.links.join(' ; ') + ' / ' + seen.note)
  check('HTML: a frame of a sensible height', seen.frame.height >= 360 && seen.frame.height <= 900, String(seen.frame.height))
  await attachFrame()
  const welcome = await inFrame('document.body.innerText')
  check('HTML: the page text shows in the frame', typeof welcome === 'string' && /Written by Alice for Bob and Carol/.test(welcome), JSON.stringify(welcome).slice(0, 80))
  check('HTML: its relative picture is fetched from its own folder', (await loaded() || '').includes(DATA + 'leaf.svg'), await loaded())
  check('HTML: and drawn', await inFrame('(() => { const i = document.querySelector("img"); return i.complete && i.naturalWidth > 0 })()') === true)
  check('HTML: no sideways scroll at 1300 px', !seen.wide)
  await shot('html-1300')

  // The hostile page.
  requests.length = 0
  seen = await view(DATA + 'hostile.html')
  await sleep(1500)
  await attachFrame()
  const hostileText = await inFrame('document.body.innerText')
  check('hostile: the page text still shows', typeof hostileText === 'string' && /this text should still show/.test(hostileText) && /Invoice from Bob/.test(hostileText), JSON.stringify(hostileText).slice(0, 80))
  check('hostile: no inline script, onload, onerror, nested frame, object or refresh ran', seen.pwned === null && await page.evaluate(() => window.__pwned === undefined), String(seen.pwned))
  check('hostile: the page title was not changed', seen.title !== 'PWNED' && !/PWNED/.test(seen.title), seen.title)
  check('hostile: nothing was written to this site\'s storage', seen.stored === null, String(seen.stored))
  check('hostile: its script from another site was never fetched', asked('evil.example').length === 0 && !/evil/.test(await loaded()), await loaded())
  check('hostile: its own <base> did not win: the picture came from the pod', (await inFrame('document.baseURI')) === DATA + 'hostile.html' && (await loaded()).includes(DATA + 'leaf.svg'), await inFrame('document.baseURI'))
  check('hostile: the frame itself ran no script either', await inFrame('typeof window.__pwned') === 'undefined')
  const clicked = [await clickInFrame('#jslink'), await clickInFrame('#outlink'), await clickInFrame('#send')]
  await sleep(1500)
  const after = await page.evaluate(() => ({ title: document.title, href: location.href, pwned: window.__pwned === undefined ? null : window.__pwned }))
  check('hostile: the three things were really clicked', clicked.every(Boolean), clicked.join(' '))
  check('hostile: clicking the javascript: link ran nothing', after.pwned === null && !/PWNED/.test(after.title), JSON.stringify(after))
  check('hostile: the top page did not move', after.href.includes(encodeURIComponent(DATA + 'hostile.html')), after.href)
  check('hostile: the link and the form sent nothing', asked('link-target').length === 0 && asked('form-target').length === 0 && frame.requests.length === 0, frame.requests.concat(requests.filter(r => /target|evil/.test(r))).join(' '))
  check('hostile: the frame did not navigate away', await inFrame('location.href') === 'about:srcdoc')
  check('hostile: the frame is still showing the page', /this text should still show/.test(await inFrame('document.body.innerText') || ''))

  // A link that names its own frame (target="_self") moves the frame: the pane puts the page back and says so.
  const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t => t.type === 'iframe').map(t => t.url)
  check('hostile: the _self link was really clicked', await clickInFrame('#selflink'))
  const stopped = await page.waitFor(() => /it was stopped/.test(document.querySelector('.doc-note').textContent), { timeout: 10000 }).then(() => true, () => false)
  await sleep(1500)
  check('hostile: a _self link is stopped and the person told', stopped, await page.evaluate(() => document.querySelector('.doc-note').textContent))
  const after2 = await targets()
  check('hostile: the frame shows the page again, not the other page', !after2.some(u => /welcome\.html/.test(u)) && after2.includes('about:srcdoc'), after2.join(' '))
  await attachFrame()
  check('hostile: and the page text is back in it', /this text should still show/.test(await inFrame('document.body.innerText') || ''))
  check('hostile: still one frame, still sandboxed with nothing allowed', await page.evaluate(() => { const f = document.querySelectorAll('.document-lab-pane iframe'); return f.length === 1 && f[0].getAttribute('sandbox') === '' }))
  await shot('hostile-1300')

  // PDF.
  seen = await view(DATA + 'minutes.pdf')
  check('a PDF opens in this pane', !!seen && seen.meta.startsWith('PDF'), seen && seen.meta)
  check('PDF: shown from a blob: copy, as a PDF', seen.object && seen.object.type === 'application/pdf' && seen.object.data.startsWith('blob:' + new URL(DATA).origin), JSON.stringify(seen.object))
  check('PDF: with a download link', seen.links.some(l => l.startsWith('Download|' + DATA + 'minutes.pdf|')), seen.links.join(' ; '))
  await sleep(1500)
  await shot('pdf-1300')
  const pdfBlob = seen.object.data
  check('PDF: the blob is there while it is on show', await page.evaluate((u) => fetch(u).then(r => r.ok, () => false), pdfBlob))
  await page.evaluate((u) => { const f = document.getElementById('uriField'); f.value = u; document.getElementById('browseForm').requestSubmit() }, DATA + 'notes.txt')
  await page.waitFor(() => !document.querySelector('.document-lab-pane object') && !!document.querySelector('.document-lab-pane pre'), { timeout: 30000 })
  await sleep(500)
  check('PDF: once the pane is gone, its blob is dropped', await page.evaluate((u) => fetch(u).then(() => false, () => true), pdfBlob))

  // SVG: claimed but not focused, so draw it with the pane directly.
  const svg = DATA + 'diagram.svg'
  await page.goto(address(svg))
  await sleep(3000)
  const svgLabels = await page.evaluate((u) => { const p = window.panes.byName('document-lab'); const s = window.$rdf.sym(u); return { label: p.label(s, { session: { store: window.SolidLogic.store } }), focus: p.shouldGetFocus(s) } }, svg)
  check('SVG: claimed ("View") but does not take the focus', svgLabels.label === 'View' && svgLabels.focus === false, JSON.stringify(svgLabels))
  await page.evaluate((u) => { const box = document.createElement('div'); box.id = 'svgtest'; document.body.prepend(box); box.appendChild(window.panes.byName('document-lab').render(window.$rdf.sym(u), { dom: document, session: { store: window.SolidLogic.store } })) }, svg)
  await page.waitFor(() => { const i = document.querySelector('#svgtest img'); return i && i.complete && i.naturalWidth > 0 }, { timeout: 20000 })
  await sleep(800)
  const pic = await page.evaluate(() => { const r = document.querySelector('#svgtest'); const i = r.querySelector('img'); return { src: i.src, inline: r.querySelectorAll('svg, object, iframe, embed').length, w: i.naturalWidth, pwned: window.__pwned === undefined ? null : window.__pwned, title: document.title } })
  check('SVG: drawn only as <img src="blob:…">, never inline', pic.src.startsWith('blob:') && pic.inline === 0 && pic.w === 320, JSON.stringify(pic))
  check('SVG: its script and onload did not run', pic.pwned === null && !/PWNED/.test(pic.title))
  check('SVG: once drawn, its blob address is dropped (it cannot be opened as a page here)', await page.evaluate((u) => fetch(u).then(() => false, () => true), pic.src))
  const svgOffer = await page.evaluate(() => { const r = document.querySelector('#svgtest'); return { links: [...r.querySelectorAll('.doc-links a')].map(a => a.textContent + '|' + (a.getAttribute('download') || '')), note: r.querySelector('.doc-note').hidden ? '' : r.querySelector('.doc-note').textContent } })
  check('SVG on the browser\'s own site: never "Open in a new tab" (its script would run here), Download instead, and it says why', svgOffer.links.length === 1 && svgOffer.links[0] === 'Download|diagram.svg' && /use Download/.test(svgOffer.note), JSON.stringify(svgOffer))
  await page.screenshot(path.join(import.meta.dirname, 'shots', 'svg-1300.png'))

  // States.
  seen = await view(DATA + 'big.txt')
  check('too large: not shown, it says why and offers the links', !!seen && seen.bad && /larger than 5\.0 MB/.test(seen.state) && !seen.pre && seen.links.some(l => l.startsWith('Download|')), seen && seen.state)
  check('too large: its size is shown', /MB/.test(seen.meta), seen.meta)
  await shot('big-1300')
  seen = await view(DATA + 'private.txt')
  check('a private file of the person logged in: shown', !!seen && seen.pre && seen.pre.text === PRIVATE_TEXT, seen && seen.state)
  // A missing file: the data browser shows its own "Failed to load" and no pane, so draw it directly.
  await page.goto(address(DATA + 'missing.txt'))
  await sleep(2500)
  seen = await page.evaluate(DIRECT, DATA + 'missing.txt')
  check('a missing file: "There is no file at this address."', !!seen && seen.bad && seen.state === 'There is no file at this address.', seen && seen.state)
  await shot('missing-1300')

  // What it leaves alone.
  await page.goto(address(DATA))
  await sleep(3000)
  const labels = await page.evaluate(async (base) => {
    const store = window.SolidLogic.store
    const p = window.panes.byName('document-lab')
    const out = {}
    for (const f of ['readme.md', 'data.ttl', '', 'welcome.html', 'notes.txt', 'team.csv', 'minutes.pdf', 'diagram.svg', 'nothing.png', 'hostile.html#part']) {
      const s = window.$rdf.sym(base + f)
      try { if (f && !f.endsWith('.png')) await store.fetcher.load(s.doc()) } catch { /* the label decides from what it knows */ }
      out[f || '(folder)'] = (p.label(s, { session: { store } }) || 'null') + '/' + p.shouldGetFocus(s)
    }
    const card = window.$rdf.sym(location.origin + '/me/profile/card.jsonld#me')
    await store.fetcher.load(card.doc()).catch(() => {})
    out.profile = (p.label(card, { session: { store } }) || 'null') + '/' + p.shouldGetFocus(card)
    return out
  }, DATA)
  console.log('     ' + JSON.stringify(labels))
  check('not claimed: Markdown, Turtle, a folder, a profile, a PNG', ['readme.md', 'data.ttl', '(folder)', 'profile', 'nothing.png'].every(k => labels[k] === 'null/false'))
  check('claimed and focused: HTML, text, CSV, PDF', ['welcome.html', 'notes.txt', 'team.csv', 'minutes.pdf', 'hostile.html#part'].every(k => labels[k] === 'View/true'))
  check('claimed, not focused: SVG', labels['diagram.svg'] === 'View/false')

  const errors = page.console.filter(l => /^exception/.test(l) && /document-pane/.test(l))
  check('no errors thrown in the page', errors.length === 0, errors.slice(0, 3).join(' | '))
  await finish()
} catch (error) { await finish(error) }

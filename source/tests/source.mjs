// The source pane, logged in as the pod's owner, at 1300 px: read, copy, edit, check, save, conflict,
// cancel, the leave warning, large and binary files, and a reload. Writes only in suite-data/source/.
//   node tests/source.mjs
import { open, sleep } from '../../lib/lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, DATA, DATA_DIR, freshData, openSource, forceSource, view, click, setText, key, settled } from './common.mjs'

freshData()
const big = 'A line of made-up text about Alice, Bob and Carol, repeated to make a large file.\n'.repeat(18000) // about 1.5 MB
writeFileSync(path.join(DATA_DIR, 'big.txt'), big)
writeFileSync(path.join(DATA_DIR, 'blob'), readFileSync(path.join(DATA_DIR, 'dot.png'))) // a picture with no telling name
const disk = (f) => readFileSync(path.join(DATA_DIR, f), 'utf8')
const people = disk('people.ttl')

const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, resource: DATA + 'people.ttl' })
try {
  // Read
  await openSource(page, address, DATA + 'people.ttl')
  let v = await view(page)
  check('it opens from the More options menu as "Source"', v.text !== null)
  check('it shows the file exactly as stored', v.text === people, JSON.stringify(v.text).slice(0, 80))
  check('it says the type and size', /^people\.ttl · text\/turtle · 468 bytes$/.test(v.meta), v.meta)
  check('read only until Edit is pressed; Copy and Edit offered', v.readOnly === true && v.buttons.join(',') === 'Copy,Edit', v.buttons.join(','))
  check('a line number for every line', v.gutter === people.split('\n').length, v.gutter + ' vs ' + people.split('\n').length)
  check('it did not take focus from the default view', await page.evaluate(() => !window.panes.byName('source-lab').shouldGetFocus))

  // Copy
  await page.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(DATA).origin }).catch(() => {})
  await click(page, 'Copy'); await sleep(300)
  v = await view(page)
  const pasted = await page.evaluate(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message))
  check('Copy puts the text on the clipboard', pasted === people && /good :: Copied 468 characters/.test(v.status), v.status + ' / ' + pasted.slice(0, 40))

  // Edit, a bad edit, then Cancel
  await click(page, 'Edit')
  v = await view(page)
  check('Edit makes it editable, with Save and Cancel', v.readOnly === false && v.buttons.join(',') === 'Copy,Save,Cancel', v.buttons.join(','))
  await setText(page, people + '\n<#dan> foaf:name "Dan" ;;; oops\n')
  v = await view(page)
  check('a change shows "Unsaved changes"', v.dirty)
  check('leaving the page now is warned against', await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented }))
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('Turtle that does not parse is not saved, and the line is given', /^bad :: This does not read as text\/turtle.*Line 19: /.test(v.status) && v.statusButtons.includes('Save anyway') && disk('people.ttl') === people, v.status.slice(0, 160))
  await click(page, 'Cancel')
  v = await view(page)
  check('Cancel puts the text back and ends editing', v.text === people && v.readOnly && !v.dirty && v.buttons.join(',') === 'Copy,Edit', v.buttons.join(','))
  check('no leave warning once nothing is unsaved', await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return !e.defaultPrevented }))

  // Tab, Ctrl+S, and a good Turtle save
  await click(page, 'Edit')
  await page.evaluate(() => { const a = document.querySelector('.src-text'); a.setSelectionRange(0, 0) })
  await key(page, 'Tab')
  v = await view(page)
  check('Tab adds two spaces and keeps focus in the text', v.text.startsWith('  # Three') && await page.evaluate(() => document.activeElement === document.querySelector('.src-text')), JSON.stringify(v.text.slice(0, 12)))
  await setText(page, people.replace('"Gardener"', '"Beekeeper"'))
  await key(page, 's', { ctrl: true }); await settled(page)
  v = await view(page)
  check('Ctrl+S saves', /^good :: Saved/.test(v.status), v.status.slice(0, 160))
  await shot('saved-1300')
  check('the pod file holds the change (stored by the server as JSON-LD)', /Beekeeper/.test(disk('people.ttl')) && !/Gardener/.test(disk('people.ttl')), disk('people.ttl').slice(0, 30))
  check('it shows what the server now holds, and says it is the same data in the server\'s layout', /Beekeeper/.test(v.text) && v.text !== people.replace('"Gardener"', '"Beekeeper"') && /same data/.test(v.status) && v.readOnly, v.status)
  check('the store was told: other panes see the change', await page.evaluate((u) => { const s = window.SolidLogic.store; return s.statementsMatching(null, null, null, s.sym(u)).some(st => st.object.value === 'Beekeeper') && !s.statementsMatching(null, null, null, s.sym(u)).some(st => st.object.value === 'Gardener') }, DATA + 'people.ttl'))

  // Someone else changes the file while it is being edited
  const before = disk('people.ttl')
  await click(page, 'Edit')
  await setText(page, v.text + '\n# my note\n')
  writeFileSync(path.join(DATA_DIR, 'people.ttl'), people.replace('"Lisbon"', '"Porto"'))
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('a change on the server meanwhile: 412, not saved, and it says so', /^bad :: Not saved: the file changed on the server/.test(v.status) && /Porto/.test(disk('people.ttl')) && !/my note/.test(disk('people.ttl')), v.status.slice(0, 100))
  check('the person\'s text is kept, still editing', /# my note/.test(v.text) && v.readOnly === false && v.dirty)
  check('it offers the server\'s version', v.statusButtons.includes('Load the server\'s version'))
  await click(page, 'Load the server\'s version'); await settled(page)
  v = await view(page)
  check('Load the server\'s version shows it', /Porto/.test(v.text) && !/# my note/.test(v.text) && /server's version now/.test(v.status), v.status)
  await click(page, 'Cancel')
  void before

  // JSON: a check, Save anyway, and a good save
  await openSource(page, address, DATA + 'settings.json')
  v = await view(page)
  const settings = disk('settings.json')
  check('a .json file opens, with its type', /json/.test(v.meta) && JSON.parse(v.text).owner === 'Alice Example', v.meta)
  await click(page, 'Edit')
  await setText(page, '{\n  "owner": "Alice Example",\n  "theme": "light",\n}\n')
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('JSON that does not parse is not saved, with its line', /^bad :: This does not read as .*json.*Line 4/.test(v.status) && disk('settings.json') === settings, v.status.slice(0, 200))
  await click(page, 'Save anyway'); await settled(page)
  v = await view(page)
  console.log('     Save anyway on broken JSON: ' + v.status.slice(0, 140))
  check('Save anyway sends it: the server\'s answer is reported and the text kept if refused', /Saved|Not saved: the server answered/.test(v.status) && (/^good/.test(v.status) || /"theme": "light",\n}/.test(v.text)), v.status.slice(0, 140))
  if (!/^good/.test(v.status)) {
    await setText(page, settings.replace('"light"', '"paper"'))
    await click(page, 'Save'); await settled(page)
  } else {
    await click(page, 'Edit')
    await setText(page, settings.replace('"light"', '"paper"'))
    await click(page, 'Save'); await settled(page)
  }
  v = await view(page)
  check('good JSON saves, and the pod file has it', /^good :: Saved/.test(v.status) && JSON.parse(disk('settings.json')).theme === 'paper' && JSON.parse(disk('settings.json')).friends.length === 2, v.status.slice(0, 120))

  // Plain text: saved byte for byte
  await openSource(page, address, DATA + 'notes.md')
  v = await view(page)
  check('Markdown opens as text', /^notes\.md · text\/markdown · /.test(v.meta), v.meta)
  await click(page, 'Edit')
  const notes = v.text.replace('Saturday', 'Sunday')
  await setText(page, notes)
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('a text file is saved exactly, and says just "Saved."', v.status === 'good :: Saved.' && disk('notes.md') === notes, v.status)

  // A reload reads back the same
  await openSource(page, address, DATA + 'notes.md')
  v = await view(page)
  check('after a reload it reads back the same', v.text === notes)
  await page.evaluate(async (args) => { const [folder, u] = JSON.parse(args); const s = window.SolidLogic.store; await s.fetcher.load(s.sym(folder)); document.querySelector('solid-ui-file-explorer-provider').openPane(s.sym(u), 'source-lab') }, JSON.stringify([DATA, DATA + 'notes.md']))
  await page.waitFor(() => /modified/.test((document.querySelector('.src-when') || {}).textContent || ''), { timeout: 20000 }).catch(() => {})
  const when = await page.evaluate(() => document.querySelector('.src-facts').textContent)
  check('once the folder listing is in the store, it says when the file was modified', /^notes\.md · text\/markdown · \d+ bytes · modified /.test(when), when)

  // Unsaved text survives leaving the view inside the app (no page unload, so no leave warning): a draft is offered.
  const inApp = (u) => page.evaluate((x) => document.querySelector('solid-ui-file-explorer-provider').openPane(window.SolidLogic.store.sym(x), 'source-lab'), u)
  const shows = (name) => page.waitFor((n) => { const m = document.querySelector('.src.source-pane .src-meta'); return !!m && m.textContent.startsWith(n + ' · ') && !!document.querySelector('.src.source-pane .src-text') }, { timeout: 20000, args: [name] })
  v = await view(page)
  await click(page, 'Edit')
  const draft = v.text + 'A draft line, not saved yet.\n'
  await setText(page, draft)
  await inApp(DATA + 'people.ttl'); await shows('people.ttl')
  await inApp(DATA + 'notes.md'); await shows('notes.md'); await sleep(300)
  v = await view(page)
  check('leaving with unsaved changes inside the app, then coming back: the draft is offered', v.text === notes && v.readOnly && v.statusButtons.join(',') === 'Restore them,Discard them', v.status)
  await click(page, 'Restore them')
  v = await view(page)
  check('Restore them: the draft is back, editing, unsaved', v.text === draft && v.readOnly === false && v.dirty && disk('notes.md') === notes)
  await click(page, 'Cancel')
  await inApp(DATA + 'people.ttl'); await shows('people.ttl')
  await inApp(DATA + 'notes.md'); await shows('notes.md'); await sleep(300)
  v = await view(page)
  check('after Cancel the draft is gone: nothing offered next time', !v.statusButtons.length && v.text === notes, v.status)
  // A draft made from an older version: restoring it and saving gets 412, not a silent overwrite.
  await click(page, 'Edit')
  await setText(page, notes + 'Draft on the old version.\n')
  await inApp(DATA + 'people.ttl'); await shows('people.ttl')
  writeFileSync(path.join(DATA_DIR, 'notes.md'), notes + 'Someone else wrote this meanwhile.\n')
  await inApp(DATA + 'notes.md'); await shows('notes.md'); await sleep(300)
  await click(page, 'Restore them')
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  check('a draft restored over a file changed meanwhile: Save is refused (412), nothing overwritten', /^bad :: Not saved: the file changed on the server/.test(v.status) && /Someone else wrote this meanwhile/.test(disk('notes.md')) && !/Draft on the old version/.test(disk('notes.md')), v.status.slice(0, 80))
  await click(page, 'Cancel')
  writeFileSync(path.join(DATA_DIR, 'notes.md'), notes)

  // A server that sends no ETag and plain application/json: Save says it cannot detect conflicts, sends no If-Match,
  // and a plain JSON file is not parsed into the store as RDF.
  await page.evaluate(() => {
    window.__orig = window.fetch
    window.__puts = []
    window.fetch = async (url, init) => {
      const address = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.url)
      if (!/settings\.json$/.test(address)) return window.__orig(url, init)
      const method = (init && init.method) || (url && url.method) || 'GET'
      if (method === 'PUT') { const h = new Headers((init && init.headers) || (url && url.headers)); window.__puts.push({ ifMatch: h.get('if-match'), type: h.get('content-type') }) }
      const r = await window.__orig(url, init)
      const headers = new Headers(r.headers)
      headers.delete('etag')
      if (/ld\+json/.test(headers.get('content-type') || '')) headers.set('content-type', 'application/json')
      return new Response(method === 'HEAD' || r.status === 204 || r.status === 304 ? null : await r.arrayBuffer(), { status: r.status, statusText: r.statusText, headers })
    }
  })
  await inApp(DATA + 'settings.json'); await shows('settings.json'); await sleep(300)
  v = await view(page)
  await click(page, 'Edit')
  v = await view(page)
  check('no ETag from the server: Edit says a change made elsewhere meanwhile would be replaced', /no version for the file/.test(v.status) && /application\/json/.test(v.meta), v.meta + ' / ' + v.status.slice(0, 120))
  await setText(page, v.text.replace('"paper"', '"meadow"'))
  await click(page, 'Save'); await settled(page)
  v = await view(page)
  const puts = await page.evaluate(() => window.__puts)
  check('…and Save sends no If-Match, then saves', /^good :: Saved/.test(v.status) && puts.length === 1 && !puts[0].ifMatch && JSON.parse(disk('settings.json')).theme === 'meadow', JSON.stringify(puts) + ' ' + v.status.slice(0, 60))
  check('a plain JSON file is not parsed into the store as RDF after saving', await page.evaluate((u) => window.SolidLogic.store.statementsMatching(null, null, null, window.SolidLogic.store.sym(u)).length === 0, DATA + 'settings.json'))
  await page.evaluate(() => { window.fetch = window.__orig })

  // Large and binary
  await openSource(page, address, DATA + 'big.txt')
  v = await view(page)
  check('a large file: the first part, said so, and no Edit', /^info :: This file is 1\.4 MB: only the first 976\.6 KB is shown/.test(v.status) && v.text.length === 1000000 && !v.buttons.includes('Edit'), v.status + ' ' + (v.text || '').length)
  await forceSource(page, address, DATA + 'dot.png', DATA + 'notes.md')
  v = await view(page)
  check('a picture is refused, with its type and size', /not text \(image\/png, 74 bytes\)/.test(v.empty), v.empty)
  check('the menu does not offer Source for a picture, by its name', await page.evaluate((u) => window.panes.byName('source-lab').label(window.SolidLogic.store.sym(u), { session: { store: window.SolidLogic.store } }) === null, DATA + 'dot.png'))
  const blob = await page.evaluate(async (u) => { const s = window.SolidLogic.store; const p = window.panes.byName('source-lab'); const before = p.label(s.sym(u), { session: { store: s } }); await s.fetcher.load(s.sym(u)).catch(() => {}); return before + ' then ' + p.label(s.sym(u), { session: { store: s } }) }, DATA + 'blob')
  check('nor, once the store has read it, for a picture with no telling name', blob === 'Source then null', blob)
  check('nor for a folder, nor a thing inside a document', await page.evaluate((u) => { const p = window.panes.byName('source-lab'); const c = { session: { store: window.SolidLogic.store } }; return p.label(window.SolidLogic.store.sym(u), c) === null && p.label(window.SolidLogic.store.sym(u + 'people.ttl#alice'), c) === null }, DATA))

  // Layout, then the screenshot of the editor
  await openSource(page, address, DATA + 'people.ttl')
  await click(page, 'Edit')
  await setText(page, (await view(page)).text + '\n')
  await sleep(200)
  check('no sideways scroll at 1300 px', !(await view(page)).wide)
  await shot('source-1300')
  await click(page, 'Cancel')
  check('no page errors', !page.console.some(l => /^exception:/.test(l) && /source-pane|src-/.test(l)), page.console.filter(l => /^exception/.test(l)).join(' | ').slice(0, 200))
  await finish()
} catch (error) { await finish(error) }

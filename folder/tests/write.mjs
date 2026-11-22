// Writing, logged in, in suite-data/folder/work/ only: new folder, upload (button, drop, replace),
// rename, delete (exactly one item; a non-empty folder refused), "New …" with another pane, reload.
//   node tests/write.mjs 1300   logs in and runs everything
//   node tests/write.mjs 400    reuses that login; the layout with the confirm and rename strips open
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { BASE, DEST } from './setup.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
const PANE = LAB + 'folder/folder-pane.js'
const WORK = BASE + 'work/'
const WORKDIR = path.join(DEST, 'work')
const width = +(process.argv[2] || 1300)

// Everything under work/ on disk, as relative paths (folders end in /).
const disk = (dir = WORKDIR, pre = '') => readdirSync(dir).sort().flatMap(n => {
  const full = path.join(dir, n)
  return statSync(full).isDirectory() ? [pre + n + '/', ...disk(full, pre + n + '/')] : [pre + n]
})
const diff = (a, b) => ({ gone: a.filter(x => !b.includes(x)), added: b.filter(x => !a.includes(x)) })
const file = (rel) => readFileSync(path.join(WORKDIR, rel))

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9511, dir: import.meta.dirname, width, login: width === 1300, resource: WORK })
const rows = () => page.evaluate(() => [...document.querySelectorAll('.fl-row')].map(r => r.dataset.name + (r.classList.contains('fl-isdir') ? '/' : '')))
const status = () => page.evaluate(() => { const s = document.querySelector('.fl-status'); return s.className.replace('fl-status', '').replace('fl-', '').trim() + ' :: ' + s.textContent })
const quiet = () => page.evaluate(() => { const s = document.querySelector('.fl-status'); s.className = 'fl-status'; s.textContent = '' })
const settled = () => page.waitFor(() => /fl-(good|bad)/.test(document.querySelector('.fl-status').className) && !document.querySelector('.fl-write button:disabled') && document.querySelector('.fl-head'), { timeout: 30000 })
const answer = (text, label) => page.evaluate((v) => { const [t, l] = JSON.parse(v); const box = document.querySelector('.fl-ask'); if (t !== null) box.querySelector('input').value = t; [...box.querySelectorAll('button')].find(b => b.textContent === l).click() }, JSON.stringify([text, label]))
const askShown = () => page.waitFor(() => !document.querySelector('.fl-ask').hidden && document.querySelector('.fl-ask p').textContent, { timeout: 10000 })
const rowButton = (name, cls) => page.evaluate((v) => { const [n, c] = JSON.parse(v); document.querySelector(`.fl-row[data-name="${CSS.escape(n)}"] ${c}`).click() }, JSON.stringify([name, cls]))
// Files made in the page, put on the hidden file input (as the Upload button's picker would) or dropped on the list.
const give = (how, files) => page.evaluate((v) => {
  const { how, files } = JSON.parse(v)
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(new File([f.bytes ? new Uint8Array(f.bytes) : f.text], f.name, { type: f.type || '' }))
  if (how === 'pick') { const input = document.querySelector('.fl-picker'); input.files = dt.files; input.dispatchEvent(new Event('change')) } else {
    const list = document.querySelector('.fl-list')
    list.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    list.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }
}, JSON.stringify({ how, files }))
const PNG = [...readFileSync(path.join(import.meta.dirname, '..', 'samples', 'garden', 'photos', 'bed-a.png'))]

try {
  await page.waitFor(() => !!document.querySelector('.fl-head') && !document.querySelector('.fl-write').hidden, { timeout: 40000 })
  check('logged in as the owner: the write tools show', true)

  if (width === 1300) {
    check('the folder starts empty and says files can be dropped', /empty\.\s*Drop files here/.test(await page.evaluate(() => document.querySelector('.fl-empty').textContent)))
    await page.waitFor(() => document.querySelector('.fl-crumbs a')?.textContent === 'me', { timeout: 10000 }).catch(() => {})
    check('breadcrumbs start at the pod root', (await page.evaluate(() => document.querySelector('.fl-crumbs a').textContent)) === 'me')

    // New folder
    await quiet(); await page.evaluate(() => document.querySelector('.fl-newfolder').click()); await askShown()
    await answer("bobs-notes", 'Create'); await settled()
    check('new folder: made on the pod', disk().includes("bobs-notes/") && /good/.test(await status()), disk().join(' ') + ' ' + await status())
    check('new folder: listed', (await rows()).includes("bobs-notes/"))
    await quiet(); await page.evaluate(() => document.querySelector('.fl-newfolder').click()); await askShown()
    await answer("bobs-notes", 'Create'); await settled()
    check('the same name again is refused', /bad :: .*already exists/.test(await status()), await status())
    const before = disk()
    for (const bad of ["Bob's notes", 'a/b', '..', 'x..y', '.hidden', 'rules.acl', '  ']) {
      await quiet(); await page.evaluate(() => document.querySelector('.fl-newfolder').click()); await askShown()
      await answer(bad, 'Create'); await settled()
      check(`a bad name is refused: "${bad}"`, /^bad/.test(await status()), await status())
    }
    check('nothing was made by the bad names', JSON.stringify(disk()) === JSON.stringify(before))

    // Upload with the button's picker: text and binary
    await quiet()
    await give('pick', [{ name: 'alice-note.txt', text: 'Hello from Alice', type: 'text/plain' }, { name: 'bed-a.png', bytes: PNG, type: 'image/png' }])
    await settled()
    check('upload two files: saved as they are', file('alice-note.txt').toString() === 'Hello from Alice' && Buffer.compare(file('bed-a.png'), Buffer.from(PNG)) === 0, await status())
    check('upload: listed with sizes', await page.evaluate(() => document.querySelector('.fl-row[data-name="bed-a.png"] .fl-size').textContent === '79 B'))
    await quiet(); await give('pick', [{ name: 'my plan.txt', text: 'plan', type: 'text/plain' }]); await settled()
    check('a file name with a space is saved with a dash, and it says so', file('my-plan.txt').toString() === 'plan' && /saved as “my-plan\.txt”/.test(await status()), await status())
    // Drag and drop onto the list
    await quiet(); await give('drop', [{ name: 'carol.md', text: '# Carol\n', type: '' }]); await settled()
    check('drop a file on the list: saved', existsSync(path.join(WORKDIR, 'carol.md')) && file('carol.md').toString() === '# Carol\n', await status())
    await quiet(); await give('drop', [{ name: '.acl', text: 'x' }]); await settled()
    check('an upload named .acl is refused', /bad :: Skipped “.acl”/.test(await status()) && !existsSync(path.join(WORKDIR, '.acl')), await status())
    // The same name again: asked first; keep, then replace
    await quiet(); await give('pick', [{ name: 'alice-note.txt', text: 'Second version', type: 'text/plain' }])
    const asked = await askShown()
    check('an existing name: it asks before replacing', /already exists here\. Replace it/.test(asked), asked)
    await shot('ask-replace-1300')
    await answer(null, 'Keep the old one'); await settled()
    check('keep the old one: unchanged', file('alice-note.txt').toString() === 'Hello from Alice', await status())
    await quiet(); await give('pick', [{ name: 'alice-note.txt', text: 'Second version', type: 'text/plain' }]); await askShown()
    await answer(null, 'Replace'); await settled()
    check('replace: the pod file is the new one', file('alice-note.txt').toString() === 'Second version', await status())

    // Rename a file
    await quiet(); await rowButton('alice-note.txt', '.fl-rename')
    check('rename says it is not atomic', /not atomic/.test(await page.evaluate(() => document.querySelector('.fl-renamer p').textContent)))
    await page.evaluate(() => { const r = document.querySelector('.fl-renamer'); r.querySelector('input').value = 'carol.md'; r.querySelector('.fl-yes').click() }); await settled()
    check('rename onto an existing name is refused', /bad :: .*never replaces/.test(await status()) && file('carol.md').toString() === '# Carol\n', await status())
    await quiet(); await rowButton('alice-note.txt', '.fl-rename')
    const r0 = disk()
    await page.evaluate(() => { const r = document.querySelector('.fl-renamer'); r.querySelector('input').value = 'alice-final.txt'; r.querySelector('.fl-yes').click() }); await settled()
    const r1 = diff(r0, disk())
    check('rename: the new name has the same content, the old one is gone, nothing else changed', file('alice-final.txt').toString() === 'Second version' && r1.gone.join() === 'alice-note.txt' && r1.added.join() === 'alice-final.txt', JSON.stringify(r1) + ' ' + await status())
    check('a folder has no rename', await page.evaluate(() => !document.querySelector(`.fl-row[data-name="bobs-notes"] .fl-rename`)))

    // Delete: a non-empty folder is refused and nothing changes
    writeFileSync(path.join(WORKDIR, "bobs-notes", 'keep.txt'), 'Do not lose this.\n')
    await quiet(); await rowButton("bobs-notes", '.fl-delete')
    const d0 = disk()
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-yes').click()); await settled()
    check('delete a folder that is not empty: refused, nothing removed', /bad :: Not deleted: .*not empty.*keep\.txt/.test(await status()) && JSON.stringify(disk()) === JSON.stringify(d0), await status())
    // Delete a file: first click only asks, naming it; Cancel keeps it; the second click removes exactly it
    await quiet(); await rowButton('carol.md', '.fl-delete')
    const confirmText = await page.evaluate(() => [...document.querySelectorAll('.fl-confirm p, .fl-confirm .fl-yes')].map(e => e.textContent).join(' | '))
    check('the first click only asks, and names the item', /Delete “carol\.md”\?/.test(confirmText) && /Delete “carol\.md”$/.test(confirmText) && JSON.stringify(disk()) === JSON.stringify(d0), confirmText)
    await shot('confirm-1300')
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-no').click())
    check('cancel: the question goes, nothing removed', await page.evaluate(() => !document.querySelector('.fl-confirm')) && JSON.stringify(disk()) === JSON.stringify(d0))
    await rowButton('carol.md', '.fl-delete')
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-yes').click()); await settled()
    const d1 = diff(d0, disk())
    check('delete a file: exactly that one item is gone', d1.gone.join() === 'carol.md' && !d1.added.length, JSON.stringify(d1) + ' ' + await status())
    check('delete a file: it leaves the list', !(await rows()).includes('carol.md'))
    // Delete an empty folder
    await quiet(); await page.evaluate(() => document.querySelector('.fl-newfolder').click()); await askShown()
    await answer('spare', 'Create'); await settled()
    const e0 = disk()
    await quiet(); await rowButton('spare', '.fl-delete')
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-yes').click()); await settled()
    const e1 = diff(e0, disk())
    check('delete an empty folder: exactly that folder is gone', e1.gone.join() === 'spare/' && !e1.added.length, JSON.stringify(e1) + ' ' + await status())

    // A name with a space made by something else: the server lists it unescaped; the pane still reads it and can delete it
    writeFileSync(path.join(WORKDIR, "Carol's list.txt"), 'eggs\n')
    await quiet(); await page.evaluate(() => document.querySelector('.fl-refresh').click())
    await page.waitFor(() => !!document.querySelector('.fl-row[data-name="Carol\'s list.txt"]'), { timeout: 20000 }).catch(() => {})
    check('a folder whose listing will not parse is still read', (await rows()).includes("Carol's list.txt") && /JSON listing/.test(await page.evaluate(() => document.querySelector('.fl-foot').textContent)), (await rows()).join(' '))
    const c0 = disk()
    await rowButton("Carol's list.txt", '.fl-delete')
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-yes').click()); await settled()
    const c1 = diff(c0, disk())
    check('… and its odd-named file can be deleted, alone', c1.gone.join() === "Carol's list.txt" && !c1.added.length, JSON.stringify(c1) + ' ' + await status())

    // A reload reads back what is on the pod
    await page.goto(address(WORK))
    await page.waitFor(() => document.querySelectorAll('.fl-row').length === 4, { timeout: 40000 })
    check('after a reload it lists what is on the pod', (await rows()).join(' ') === "bobs-notes/ alice-final.txt bed-a.png my-plan.txt", (await rows()).join(' '))

    // "New …": the panes that can make things
    await page.waitFor(() => !document.querySelector('.fl-write').hidden, { timeout: 20000 })
    await page.evaluate(() => document.querySelector('.fl-new').click())
    const makers = await page.evaluate(() => [...document.querySelectorAll('.fl-menu .fl-make')].map(b => b.dataset.pane + '=' + b.textContent))
    const registry = await page.evaluate(() => window.panes.list.filter(p => p.mintNew && !['chat', 'folder', 'dokieli'].includes(String(p.name).toLowerCase())).map(p => p.name))
    const nouns = makers.map(m => m.split('=')[1].toLowerCase())
    check('New … lists the panes that can make things: no chat, no dokieli, one entry per kind of thing', makers.every(m => registry.includes(m.split('=')[0])) && new Set(nouns).size === nouns.length && makers.length >= 5 && !makers.some(m => /^(chat|dokieli)=/i.test(m)) && makers.some(m => m.startsWith('pad=')), makers.join(', '))
    await shot('new-menu-1300')
    await page.evaluate(() => document.querySelector('.fl-make[data-pane="pad"]').click()); await askShown()
    await quiet(); await answer('../escape', 'Create'); await settled()
    check('New … refuses a bad name', /^bad/.test(await status()) && !existsSync(path.join(DEST, 'escape')))
    await page.evaluate(() => document.querySelector('.fl-new').click())
    await page.evaluate(() => document.querySelector('.fl-make[data-pane="pad"]').click()); await askShown()
    await answer('Shopping-list', 'Create')
    await page.waitFor(() => /Shopping-list\/index\.ttl/.test(decodeURIComponent(location.search)) || !document.querySelector('.fl.folder-lab-pane'), { timeout: 40000 }).catch(() => {})
    await sleep(1500)
    check('New … Notepad: the pad pane made its file in a new folder', existsSync(path.join(WORKDIR, 'Shopping-list', 'index.ttl')), disk().join(' '))
    const where = await page.evaluate(() => decodeURIComponent(location.href))
    check('… and the browser opened what it made', /Shopping-list\/index\.ttl#this/.test(where), where.slice(-80))

    // Logged in, but not allowed to write: no write tools
    await page.goto(address(BASE + 'locked/'))
    await page.waitFor(() => document.querySelectorAll('.fl-row').length === 1, { timeout: 40000 })
    await sleep(2500)
    check('a folder the user may only read: listed, but no write tools', await page.evaluate(() => document.querySelector('.fl-write').hidden && !document.querySelector('.fl-delete')))
    const errors = page.console.filter(l => /exception/.test(l) && /folder-pane|fl-/.test(l))
    check('no errors from the pane', !errors.length, errors.join(' | ').slice(0, 300))
  } else {
    await page.waitFor(() => document.querySelectorAll('.fl-row').length >= 2, { timeout: 20000 })
    await narrow(page) // a true 400 px page: CDP device metrics (design/viewport.mjs)
    await sleep(400)
    await page.evaluate(() => document.querySelector('.fl-row:not(.fl-isdir) .fl-rename').click())
    await page.evaluate(() => [...document.querySelectorAll('.fl-row')].pop().querySelector('.fl-delete').click())
    await page.evaluate(() => document.querySelector('.fl-new').click())
    await sleep(500)
    const m4 = await measure(page)
    check('true 400 px: with the New menu and a delete question open, no sideways scroll', await page.evaluate(() => !!document.querySelector('.fl-confirm') && !document.querySelector('.fl-newmenu').hidden) && !m4.sideways, JSON.stringify(m4))
    await shot('write-400')
    await page.evaluate(() => document.querySelector('.fl-confirm .fl-no').click())
  }
  const mEnd = await measure(page)
  check((width === 400 ? 'true ' : '') + width + ' px: no sideways scroll', !mEnd.sideways, JSON.stringify(mEnd))
  await shot('write-' + width + '-end')
  await finish()
} catch (error) { await finish(error) }

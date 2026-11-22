// Logged in, on the book club document: Table is offered but not opened first; the rows, headers and
// cells; sorting, filtering, the type menu, more columns, Copy as CSV (and its fallback); links open in
// the data browser; a reload reads back the same; and nothing is ever written.
import { open, sleep, config, LAB } from '../../lib/lib.mjs'
import { PANE, PORT, DATA, choose, views, WATCH, READ, diskHash } from './helpers.mjs'

const DOC = DATA + 'library.ttl'
const before = diskHash('library.ttl')
const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: true, resource: DOC })
const read = () => page.evaluate(READ)
const clickHead = (name) => page.evaluate((n) => [...document.querySelectorAll('.tbl thead th')].find(th => th.textContent.replace(/[▲▼]/g, '').trim() === n).querySelector('button').click(), name)
const typeFilter = async (text) => {
  await page.evaluate((t) => { const f = document.querySelector('.tbl-filter'); f.focus(); f.value = ''; f.dispatchEvent(new Event('input')) }, '')
  if (text) await page.type(text)
  await sleep(150)
}
const col = (seen, name) => seen.heads.indexOf(name)

try {
  // Offered, not chosen first.
  const menu = await views(page)
  check('Table is in the view menu', menu.includes('Table'), menu.join(' | '))
  await sleep(1500)
  check('it does not take focus: another view opens first', await page.evaluate(() => !document.querySelector('.tbl')))

  await page.evaluate(WATCH)
  await choose(page, 'Table')
  await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length === 12, { timeout: 20000 })
  let seen = await read()
  check('it opens on the books, the most common type', seen.title === 'Book' && seen.count === '12 of 12' && /^12 things in library\.ttl/.test(seen.meta), seen.title + ' · ' + seen.count + ' · ' + seen.meta)
  check('readable headers, most-used first, capped at 8 + name', seen.heads.join('|') === 'Name|Author|Date published|Number of pages|Genre|In language|Publisher|Aggregate rating|Book format', seen.heads.join('|'))
  check('sorted by name to begin with', seen.names[0] === 'A Map of Small Rooms' && seen.names[11] === 'Zero Gravity Gardens' && seen.sorted.join() === 'Name:ascending', seen.names[0] + ' … ' + seen.names[11])
  const facts = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tbl tbody tr')].find(tr => tr.cells[0].textContent === 'Bridges of Salt')
    const heads = [...document.querySelectorAll('.tbl thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim())
    const cell = (h) => row.cells[heads.indexOf(h)]
    return {
      pages: cell('Number of pages').textContent,
      pagesAlign: getComputedStyle(cell('Number of pages')).textAlign,
      date: cell('Date published').textContent,
      genre: cell('Genre').textContent,
      author: cell('Author').querySelector('a')?.getAttribute('href'),
      authorRel: cell('Author').querySelector('a')?.rel,
      name: row.cells[0].querySelector('a')?.getAttribute('href'),
      format: cell('Book format').textContent
    }
  })
  check('numbers formatted and right-aligned', facts.pages === (1024).toLocaleString() && facts.pagesAlign === 'right', facts.pages + ' ' + facts.pagesAlign)
  check('dates formatted', facts.date === new Date(Date.UTC(2021, 8, 15)).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }), facts.date)
  check('several values joined', facts.genre === 'History, Travel', facts.genre)
  check('things are links, with names', /library\.ttl#bob$/.test(facts.author) && facts.authorRel === 'noopener' && /library\.ttl#b2$/.test(facts.name), facts.author)
  check('a vocabulary term reads as words', facts.format === 'Hardcover', facts.format)

  // Sorting.
  await clickHead('Number of pages')
  seen = await read()
  check('sort a number column ascending', seen.rows[0][col(seen, 'Number of pages')] === '9' && seen.rows[11][col(seen, 'Number of pages')] === (1200).toLocaleString() && seen.sorted.join() === 'Number of pages:ascending', seen.rows.map(r => r[col(seen, 'Number of pages')]).join(' '))
  await clickHead('Number of pages')
  seen = await read()
  check('then descending', seen.names[0] === 'Iron and Willow' && seen.names[1] === 'Bridges of Salt' && seen.names[11] === 'Zero Gravity Gardens' && seen.sorted.join() === 'Number of pages:descending', seen.names.slice(0, 2).join(', '))
  await clickHead('Date published')
  seen = await read()
  check('dates sort as dates', seen.names[0] === 'Le Jardin du Nord' && seen.names[11] === 'Iron and Willow', seen.names[0] + ' … ' + seen.names[11])

  // Filtering.
  await typeFilter('poetry')
  seen = await read()
  check('the filter narrows rows as you type', seen.count === '3 of 12' && seen.names.slice().sort().join('|') === 'A Map of Small Rooms|Paper Lanterns|Small Hours', seen.count + ' ' + seen.names.join('|'))
  await typeFilter('harbour HISTORY')
  seen = await read()
  check('every word must match, any case', seen.count === '2 of 12' && seen.names.sort().join('|') === 'Bridges of Salt|Iron and Willow', seen.count)
  await typeFilter('nothing like this')
  seen = await read()
  check('no match says so', seen.count === '0 of 12' && /No rows match/.test(seen.rows[0][0]), seen.rows[0] && seen.rows[0][0])
  await typeFilter('')
  check('clearing the filter brings them back', (await read()).count === '12 of 12')

  // More columns, with a label from the data, and empties last both ways.
  await page.evaluate(() => document.querySelector('.tbl-cols').click())
  seen = await read()
  check('show all columns', seen.heads.length === 12 && seen.heads.includes('Read on') && seen.heads.includes('ISBN') && seen.heads.includes('Same as'), seen.heads.slice(9).join('|'))
  await clickHead('Read on')
  seen = await read()
  const readOn = seen.rows.map(r => r[col(seen, 'Read on')])
  check('a header from rdfs:label; dateTimes sort; empty last', seen.names[0] === 'The Quiet Orchard' && readOn.slice(-3).every(v => v === '') && readOn[0] !== '', seen.names[0])
  await clickHead('Read on')
  seen = await read()
  check('descending keeps empties last', seen.names[0] === 'Iron and Willow' && seen.rows.slice(-3).every(r => r[col(seen, 'Read on')] === ''), seen.names[0])
  await shot('table-1300-all-columns')
  const box = await page.evaluate(() => { const s = document.querySelector('.tbl-scroll'); return { inner: s.scrollWidth > s.clientWidth, page: document.documentElement.scrollWidth > innerWidth } })
  check('a wide table scrolls in its own box, not the page', !box.page, JSON.stringify(box))
  await page.evaluate(() => document.querySelector('.tbl-cols').click())
  check('and fewer again', (await read()).heads.length === 9)

  // Copy as CSV: the real clipboard, then refused.
  check('hiding the sorted column goes back to sorting by name', (await read()).sorted.join() === 'Name:ascending')
  await typeFilter('travel')
  const origin = new URL(DOC).origin
  await page.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {})
  await page.evaluate(() => document.querySelector('.tbl-copy').click())
  await page.waitFor(() => document.querySelector('.tbl-status').textContent, { timeout: 5000 })
  seen = await read()
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message))
  const lines = clip.trim().split(/\r\n/)
  check('Copy as CSV puts the filtered rows on the clipboard', seen.status === 'Copied 3 rows as CSV.' && lines.length === 4, seen.status + ' / ' + lines.length + ' lines')
  check('CSV has every column, a URI, raw values and quoting', /^Name,URI,Author,Date published,Number of pages,Genre,.*Read on.*,Same as$/.test(lines[0]) &&
    lines[1].startsWith('Bridges of Salt,' + DOC + '#b2,' + DOC + '#bob,2021-09-15,1024,History; Travel,') &&
    lines.some(l => l.startsWith('Notes from the Delta,' + DOC + '#b5,"')) === false && lines.some(l => l.includes(DOC + '#alice; ' + DOC + '#carol')), lines.slice(0, 2).join(' / '))
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('refused')) })
  await page.evaluate(() => document.querySelector('.tbl-copy').click())
  await sleep(300)
  const fallback = await page.evaluate(() => { const t = document.querySelector('.tbl-csv'); return { status: document.querySelector('.tbl-status').textContent, visible: !!t && t.offsetHeight > 50, text: t && t.value, selected: t && t.selectionEnd - t.selectionStart } })
  check('a refused clipboard shows the CSV to copy by hand, selected', /did not allow copying/.test(fallback.status) && fallback.visible && fallback.text === clip.replace(/\r\n/g, '\n') && fallback.selected === fallback.text.length, fallback.status)
  await shot('table-1300-fallback')
  await typeFilter('')

  // The type menu.
  const chips = await page.evaluate(() => [...document.querySelectorAll('.tbl-types .tbl-chip')].map(c => c.textContent + (c.getAttribute('aria-pressed') === 'true' ? '*' : '')))
  check('the types are chips, the shown one pressed', chips.join('|') === 'Book · 12*|Person · 3', chips.join('|'))
  await page.evaluate(() => document.querySelector('.tbl-types .tbl-chip[data-index="1"]').click())
  seen = await read()
  check('the type chips switch to the people', seen.title === 'Person' && seen.count === '3 of 3' && seen.names.join('|') === 'Alice Example|Bob Example|Carol Example', seen.names.join('|'))
  const people = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.tbl thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim())
    const carol = [...document.querySelectorAll('.tbl tbody tr')][2]
    const c = (h) => carol.cells[heads.indexOf(h)]
    return { heads, knows: c('Knows').textContent, email: c('Email').querySelector('a').getAttribute('href'), emailText: c('Email').textContent, tel: c('Telephone').querySelector('a').getAttribute('href'), csvGone: !document.querySelector('.tbl-csv') }
  })
  check('people: links joined, mailto and tel kept', people.knows === 'Alice Example, Bob Example' && people.email === 'mailto:carol@example.net' && people.emailText === 'carol@example.net' && people.tel === 'tel:+15550100', JSON.stringify(people))
  await shot('table-1300-people')

  const writes = await page.evaluate(() => window.__writes)
  check('the pane wrote nothing (no PUT/POST/PATCH/DELETE, no updater)', Array.isArray(writes) && writes.length === 0, JSON.stringify(writes))

  // A link opens in the data browser, in place.
  await page.evaluate(() => [...document.querySelectorAll('.tbl tbody tr')][0].cells[0].querySelector('a').click())
  await sleep(2500)
  await shot('table-1300-opened')
  const moved = await page.evaluate(() => ({ table: !!document.querySelector('.tbl'), url: location.href, field: document.getElementById('uriField').value }))
  check('a name opens that thing in the data browser', !moved.table && /library\.ttl#alice$/.test(moved.field) && /library\.ttl%23alice$/.test(moved.url), moved.field)

  // Back on the document after a reload: the same.
  await page.goto(address(DOC))
  await choose(page, 'Table')
  await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length === 12, { timeout: 20000 })
  seen = await read()
  check('a reload reads back the same', seen.title === 'Book' && seen.count === '12 of 12' && seen.names[0] === 'A Map of Small Rooms' && seen.heads.length === 9)
  await shot('table-1300')

  check('the pod file is unchanged', diskHash('library.ttl') === before)

  // Logged in, inside the suite shell (shell.mjs covers the shell logged out): the shell knows who is logged in,
  // and the table and a row's details work the same.
  await page.goto(`${config.browser}?pane=${encodeURIComponent(LAB + 'shell/suite-shell-pane.js')}&uri=${encodeURIComponent(DOC)}`)
  const loggedIn = await page.waitFor(() => document.querySelector('.suite-shell-pane')?.dataset.loggedIn === 'yes', { timeout: 45000 }).catch(() => false)
  check('in the shell, logged in: the shell says so', !!loggedIn)
  await page.waitFor(() => !!document.querySelector('.sh-content > *'), { timeout: 45000 })
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .table-pane'))) {
    await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="table"]'), { timeout: 20000 })
    await page.evaluate(() => { document.querySelector('.sh-views-btn').click(); document.querySelector('.sh-views [data-pane="table"]').click() })
  }
  await page.waitFor(() => document.querySelectorAll('.sh-content .tbl tbody tr').length === 12, { timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr')].find(tr => tr.cells[0].textContent === 'Iron and Willow').querySelector('td.tbl-num').click())
  const det = await page.waitFor(() => document.querySelector('.sh-detcol:not([hidden]) .tbl-details-title')?.textContent === 'Iron and Willow', { timeout: 8000 }).catch(() => false)
  check('in the shell, logged in: the table, and a row\'s details', !!det)
  await shot('shell-loggedin-1300')
} catch (error) { await finish(error) }
await finish()

// The table inside the suite shell (shell/suite-shell-pane.js), logged out (the sample is public): picked from the
// shell's "Other views" menu; the shell's (i) button shows the table's own details; a row (not its links) opens
// that thing's properties in the shell's details column, marked until the column closes; the shell's header search
// filters the rows; nothing written; no sideways scroll at 1300 px and a true 400 px (design/viewport.mjs).
//   node tests/shell.mjs
import { open, config, LAB, sleep } from '../../lib/lib.mjs'
import { PORT, DATA, WATCH, READ, narrow, measure } from './helpers.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const DOC = DATA + 'library.ttl'
const inShell = (uri) => `${config.browser}?pane=${encodeURIComponent(SHELL)}&uri=${encodeURIComponent(uri)}`

const { page, check, finish, shot } = await open({ pane: SHELL, port: PORT, dir: import.meta.dirname, login: false, fresh: true, resource: DOC })
const showTable = async () => {
  await page.waitFor(() => !!document.querySelector('.sh-content > *'), { timeout: 45000 })
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .table-pane'))) {
    await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="table"]'), { timeout: 20000 })
    await page.evaluate(() => { document.querySelector('.sh-views-btn').click(); document.querySelector('.sh-views [data-pane="table"]').click() })
  }
  await page.waitFor(() => document.querySelectorAll('.sh-content .tbl tbody tr').length === 12, { timeout: 30000 })
}
try {
  await page.goto(inShell(DOC))
  await showTable()
  await page.evaluate(WATCH)
  let seen = await page.evaluate(READ)
  check('in the shell: the books, in the content column', seen.title === 'Book' && seen.count === '12 of 12', seen.count)
  const frame = await page.evaluate(() => ({ nav: !!document.querySelector('.sh-navcol')?.children.length, info: !document.querySelector('.sh-details-btn').hidden, blue: getComputedStyle(document.querySelector('.sh-content .tbl-root')).getPropertyValue('--sui-primary-element').trim() }))
  check('no navigation column; the (i) button is there; the shell\'s tokens apply', !frame.nav && frame.info && frame.blue === '#00679e', JSON.stringify(frame))
  const look = await page.evaluate(() => {
    const th = document.querySelector('.sh-content .tbl thead th')
    const td = document.querySelector('.sh-content .tbl tbody td')
    return { sticky: getComputedStyle(th).position, th: Math.round(th.getBoundingClientRect().height), td: Math.round(td.getBoundingClientRect().height), scroll: getComputedStyle(document.querySelector('.sh-content .tbl-scroll')).overflowX }
  })
  check('a clean table: sticky header, 44 px rows, scrolling inside its own box', look.sticky === 'sticky' && look.th === 44 && look.td === 44 && look.scroll === 'auto', JSON.stringify(look))

  // The (i) button: the table itself.
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  const about = await page.waitFor(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .tbl-side[data-of=table]'); return d && d.querySelector('.tbl-details-title').textContent === 'Book' }, { timeout: 8000 }).catch(() => false)
  check('the (i) button shows the table: type, rows, columns, where from', !!about && await page.evaluate(() => /Rows12Columns12/.test(document.querySelector('.sh-detcol .tbl-props').textContent.replace(/\s/g, '')) && document.querySelector('.sh-detcol .tbl-props').textContent.includes('library.ttl')))

  // A row: its thing in the details column, every property (hidden columns too).
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr')].find(tr => tr.cells[0].textContent === 'Bridges of Salt').querySelector('td.tbl-num').click())
  const det = await page.waitFor(() => { const d = document.querySelector('.sh-detcol:not([hidden]) .tbl-side[data-of=row]'); return d && d.querySelector('.tbl-details-title').textContent === 'Bridges of Salt' }, { timeout: 8000 }).catch(() => false)
  seen = await page.evaluate(() => {
    const dl = document.querySelector('.sh-detcol .tbl-props')
    const keys = [...dl.querySelectorAll('dt')].map(d => d.textContent)
    const val = (k) => dl.querySelectorAll('dd')[keys.indexOf(k)]
    return { keys, genre: val('Genre')?.textContent, author: val('Author')?.querySelector('a')?.getAttribute('href'), isbn: val('ISBN')?.textContent, marked: [...document.querySelectorAll('.sh-content .tbl tbody tr[aria-selected=true]')].map(tr => tr.cells[0].textContent) }
  })
  check('a row opens its thing in the details column, the row marked', !!det && seen.marked.join() === 'Bridges of Salt', JSON.stringify(seen.marked))
  check('details: every property, links kept, hidden columns too', seen.genre === 'History, Travel' && /library\.ttl#bob$/.test(seen.author || '') && seen.isbn === '978-0-00-000002-8', JSON.stringify(seen))
  await shot('shell-1300-details')
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  check('closing the column clears the marked row', await page.evaluate(() => !document.querySelector('.sh-content .tbl tbody tr[aria-selected]')))

  // Re-sorted while the details are open, then closed: the redrawn row is cleared too.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr')].find(tr => tr.cells[0].textContent === 'Bridges of Salt').querySelector('td.tbl-num').click())
  await page.waitFor(() => !!document.querySelector('.sh-content .tbl tbody tr[aria-selected=true]'), { timeout: 8000 })
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl thead th button')].find(b => b.textContent.trim() === 'Name').click())
  const still = await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr[aria-selected=true]')].map(tr => tr.cells[0].textContent).join())
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)
  check('re-sorted with the details open: the mark follows the row, and closing clears it', still === 'Bridges of Salt' && await page.evaluate(() => !document.querySelector('.sh-content .tbl tbody tr[aria-selected]')), still)
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl thead th button')].find(b => b.textContent.trim() === 'Name').click())

  // From the keyboard: a row is focusable; Enter opens its details.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr')].find(tr => tr.cells[0].textContent === 'Small Hours').focus())
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  const byKey = await page.waitFor(() => document.querySelector('.sh-detcol:not([hidden]) .tbl-details-title')?.textContent === 'Small Hours', { timeout: 8000 }).catch(() => false)
  check('keyboard: a focused row opens its details with Enter', !!byKey && await page.evaluate(() => document.querySelector('.sh-content .tbl tbody tr[aria-selected=true]')?.cells[0].textContent === 'Small Hours'))
  await page.evaluate(() => document.querySelector('.sh-details-close').click())
  await sleep(300)

  // The header search filters the rows.
  await page.evaluate(() => { const i = document.querySelector('input[type=search][aria-label=Search]'); i.value = 'poetry'; i.dispatchEvent(new Event('input', { bubbles: true })) })
  const filtered = await page.waitFor(() => document.querySelector('.sh-content .tbl-count')?.textContent === '3 of 12', { timeout: 5000 }).catch(() => false)
  check('the shell\'s search filters the rows (and fills the filter box)', !!filtered && await page.evaluate(() => document.querySelector('.sh-content .tbl-filter').value === 'poetry'))
  await page.evaluate(() => { const i = document.querySelector('input[type=search][aria-label=Search]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.waitFor(() => document.querySelector('.sh-content .tbl-count')?.textContent === '12 of 12', { timeout: 5000 })

  // All columns: the table scrolls in its box, never the page.
  await page.evaluate(() => document.querySelector('.sh-content .tbl-cols').click())
  let m = await measure(page)
  check('in the shell, 1300 px, all columns: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-1300')

  await narrow(page)
  m = await measure(page)
  check('in the shell, true 400 px: no sideways scroll, cards', !m.sideways && m.innerWidth === 400 && await page.evaluate(() => getComputedStyle(document.querySelector('.sh-content .tbl thead')).display === 'none'), JSON.stringify(m))
  await shot('shell-true400')
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .tbl tbody tr')][0].querySelector('td:not(.tbl-name)').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol:not([hidden]) .tbl-side[data-of=row]'), { timeout: 8000 })
  m = await measure(page)
  check('true 400 px, details open: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-true400-details')

  check('nothing written', (await page.evaluate(() => window.__writes)).length === 0)
} catch (error) { await finish(error) }
await finish()

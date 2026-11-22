// The sample, read without logging in, at 1300 and 400 px: the same table, cards on a phone,
// sorting from the menu there, and never a sideways page scroll.
import { open } from '../../lib/lib.mjs'
import { PANE, PORT, DATA, choose, READ, narrow, measure } from './helpers.mjs'

const DOC = DATA + 'library.ttl'
for (const width of [1300, 400]) {
  const { page, check, finish, shot } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, width, login: false, fresh: true, resource: DOC })
  try {
    if (width === 400) await narrow(page)
    await choose(page, 'Table')
    await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length === 12, { timeout: 20000 })
    let seen = await page.evaluate(READ)
    check(width + ' px: logged out, the same table', seen.title === 'Book' && seen.count === '12 of 12' && seen.names[0] === 'A Map of Small Rooms', seen.count)
    const m = await measure(page)
    check(width + ' px' + (width === 400 ? ' (true 400: design/viewport.mjs)' : '') + ': no sideways scroll', !seen.wide && !m.sideways && m.innerWidth === width, JSON.stringify(m))
    const look = await page.evaluate(() => {
      const row = document.querySelector('.tbl tbody tr')
      const thead = document.querySelector('.tbl thead')
      const sortbar = document.querySelector('.tbl-sortbar')
      const pages = [...row.cells].find(td => td.dataset.label === 'Number of pages')
      return {
        cards: getComputedStyle(row).display === 'block' && getComputedStyle(thead).display === 'none',
        sortbar: getComputedStyle(sortbar).display !== 'none',
        label: getComputedStyle(pages, '::before').content,
        rowFits: row.getBoundingClientRect().right <= innerWidth,
        cellsFit: [...document.querySelectorAll('.tbl td')].every(td => td.getBoundingClientRect().right <= document.querySelector('.tbl-scroll').getBoundingClientRect().right + 0.5),
        scrolls: (() => { const s = document.querySelector('.tbl-scroll'); return s.scrollWidth > s.clientWidth + 1 })()
      }
    })
    if (width === 400) {
      check('400 px: one card per thing, labelled, no headers', look.cards && look.label === '"Number of pages"' && look.rowFits && look.cellsFit, JSON.stringify(look))
      check('400 px: sorting is a menu', look.sortbar)
      await page.evaluate(() => { const s = document.querySelector('.tbl-sortby'); s.value = [...s.options].find(o => o.textContent === 'Number of pages').value; s.dispatchEvent(new Event('change')) })
      await page.evaluate(() => document.querySelector('.tbl-sortdir').click())
      seen = await page.evaluate(READ)
      const dir = await page.evaluate(() => document.querySelector('.tbl-sortdir').textContent)
      check('400 px: sort by pages, descending', seen.names[0] === 'Iron and Willow' && seen.names[11] === 'Zero Gravity Gardens' && dir === 'Descending', seen.names[0] + ' ' + dir)
      await page.evaluate(() => document.querySelector('.tbl-cols').click())
      check('400 px: all columns, still no sideways scroll', !(await page.evaluate(READ)).wide && !(await measure(page)).sideways)
    } else {
      check('1300 px: a real table, no sort menu', !look.cards && !look.sortbar, JSON.stringify(look))
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot('sample-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

// Reading, logged out: the sample garden folder at 1300 and 400 px. Order, sizes, dates, sorting,
// the filter, hidden files, the empty state, opening a folder, a private folder, and no write tools.
//   node tests/read.mjs 1300   (or 400)
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { BASE } from './setup.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'folder/folder-pane.js'
const GARDEN = BASE + 'garden/'

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.fl-row')].map(r => r.dataset.name + (r.classList.contains('fl-isdir') ? '/' : '')))
const ready = (page, uri) => page.waitFor((u) => { const r = document.querySelector('.fl.folder-lab-pane'); return r && r.isConnected && document.querySelector('.fl-head') && [...document.querySelectorAll('.fl-crumbs .fl-here')].length && location.href.includes(encodeURIComponent(u)) }, { timeout: 40000, args: [uri] })

const width = +(process.argv[2] || 1300)
{
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9511, dir: import.meta.dirname, width, login: false, fresh: true, resource: GARDEN })
  try {
    await page.waitFor(() => document.querySelectorAll('.fl-row').length > 0, { timeout: 40000 })
    await sleep(1500)
    const W = width + ' px: '
    check(W + 'the Files pane opens on the folder', await page.evaluate(() => !!document.querySelector('.fl.folder-lab-pane')))
    const names = await rows(page)
    check(W + 'folders first, then files, by name; the .acl is hidden', JSON.stringify(names) === JSON.stringify(['empty/', 'photos/', 'plans/', 'alice-seeds.csv', 'bob-watering.md', 'budget.json', 'carol-beds.ttl', 'layout.svg']), names.join(' '))
    const crumbs = await page.evaluate(() => [...document.querySelectorAll('.fl-crumbs a, .fl-crumbs .fl-here')].map(a => a.textContent))
    check(W + 'breadcrumbs lead up to the folder, the last one plain', crumbs.slice(-3).join('/') === 'suite-data/folder/garden' && await page.evaluate(() => !document.querySelector('.fl-crumbs .fl-here').closest('a')), crumbs.join(' › '))
    const md = await page.evaluate(() => { const r = document.querySelector('.fl-row[data-name="bob-watering.md"]'); return { size: r.querySelector('.fl-size').textContent, date: r.querySelector('.fl-date').textContent, meta: r.querySelector('.fl-meta').textContent, href: r.querySelector('a').href, kind: r.querySelector('.fl-row-icon').dataset.kind } })
    check(W + 'a file shows its size and when it changed', md.size === '68 B' && /\d/.test(md.date) && /68 B · /.test(md.meta), JSON.stringify(md))
    check(W + 'each name is a real link', md.href === GARDEN + 'bob-watering.md')
    const icons = await page.evaluate(() => new Set([...document.querySelectorAll('.fl-row .fl-row-icon')].map(s => s.dataset.kind + ' ' + s.firstChild.style.getPropertyValue('--fl-i'))).size)
    check(W + 'icons differ by kind', icons >= 5, icons + ' kinds')
    check(W + 'logged out: no write tools', await page.evaluate(() => document.querySelector('.fl-write').hidden && !document.querySelector('.fl-delete, .fl-rename')))
    check(W + 'the foot counts what is here and what is hidden', /3 folders, 5 files · 1 hidden/.test(await page.evaluate(() => document.querySelector('.fl-foot').textContent)))
    if (width === 400) {
      // A true 400 px page (the 400 px window gives about 500 px): CDP device metrics, design/viewport.mjs.
      await narrow(page)
      await sleep(400)
      const cols = await page.evaluate(() => { const r = document.querySelector('.fl-row[data-name="bob-watering.md"]'); const shown = (e) => getComputedStyle(e).display !== 'none'; return { meta: shown(r.querySelector('.fl-meta')), size: shown(r.querySelector('.fl-size')), date: shown(r.querySelector('.fl-date')) } })
      check('true 400 px: rows collapse to the name with size and date under it', cols.meta && !cols.size && !cols.date, JSON.stringify(cols))
      // Details under a row, alone, at 400 px.
      await page.evaluate(() => document.querySelector('.fl-row[data-name="bob-watering.md"] .fl-row-main').click())
      await page.waitFor(() => !!document.querySelector('.fl-inline-details .fl-details-title'), { timeout: 8000 })
      const m = await measure(page)
      check('true 400 px, details open: no sideways scroll', !m.sideways, JSON.stringify(m))
      await shot('read-400-details')
      await page.evaluate(() => document.querySelector('.fl-inline-details .fl-details-close').click())
    }
    const m = await measure(page)
    check(W + 'no sideways scroll', !m.sideways, JSON.stringify(m))
    await shot('read-' + width)

    if (width === 1300) {
      await page.evaluate(() => document.querySelector('.fl-head [data-sort=size]').click())
      const bySize = await rows(page)
      check('sort by size: biggest first, folders still first', bySize.slice(0, 3).join(' ') === 'empty/ photos/ plans/' && bySize.slice(3).join(' ') === 'layout.svg carol-beds.ttl budget.json alice-seeds.csv bob-watering.md', bySize.join(' '))
      await page.evaluate(() => document.querySelector('.fl-head [data-sort=size]').click())
      check('again: smallest first', (await rows(page))[3] === 'bob-watering.md')
      await page.evaluate(() => document.querySelector('.fl-head [data-sort=date]').click())
      check('sort by date works', (await rows(page)).length === 8)
      await page.evaluate(() => document.querySelector('.fl-head [data-sort=name]').click())
      await page.evaluate(() => { const f = document.querySelector('.fl-filter'); f.value = 'BEDS'; f.dispatchEvent(new Event('input')) })
      check('filter by name, any case', (await rows(page)).join(' ') === 'carol-beds.ttl', (await rows(page)).join(' '))
      await page.evaluate(() => { const f = document.querySelector('.fl-filter'); f.value = 'zzz'; f.dispatchEvent(new Event('input')) })
      check('a filter that matches nothing says so', /Nothing here matches “zzz”/.test(await page.evaluate(() => document.querySelector('.fl-empty').textContent)))
      await page.evaluate(() => { const f = document.querySelector('.fl-filter'); f.value = ''; f.dispatchEvent(new Event('input')) })
      await page.evaluate(() => document.querySelector('.fl-hidden').click())
      check('show hidden: the folder\'s .acl appears', (await rows(page)).includes('.acl'))
      await page.evaluate(() => document.querySelector('.fl-hidden').click())

      // Details, alone: a click on the row (not its name) opens them under the row; Info, then Sharing.
      await page.evaluate(() => document.querySelector('.fl-row[data-name="bob-watering.md"] .fl-size').click())
      await page.waitFor(() => !!document.querySelector('.fl-inline-details .fl-details-title'), { timeout: 8000 })
      const det = await page.evaluate(() => { const d = document.querySelector('.fl-inline-details'); return { title: d.querySelector('.fl-details-title').textContent, sub: d.querySelector('.fl-details-sub').textContent, props: [...d.querySelectorAll('.fl-props dt')].map(t => t.textContent + '=' + t.nextElementSibling.textContent).join('; '), prev: d.previousElementSibling.dataset.name, selected: d.previousElementSibling.getAttribute('aria-selected'), tabs: [...d.querySelectorAll('.fl-tab')].map(t => t.textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')).join() } })
      check('alone: a row click opens its details under it (name, size, kind, address)', det.title === 'bob-watering.md' && det.prev === 'bob-watering.md' && det.selected === 'true' && /Size=68 B/.test(det.props) && /Kind=Text/.test(det.props) && /Address=http/.test(det.props) && det.tabs === 'Info*,Sharing', JSON.stringify(det))
      await page.evaluate(() => document.querySelector('.fl-inline-details .fl-tab-sharing').click())
      const shr = await page.waitFor(() => !!document.querySelector('.fl-inline-details .fl-panel-sharing:not([hidden]) .sharing-lab-pane'), { timeout: 20000 }).catch(() => false)
      check('alone: the Sharing tab shows the Sharing pane for that file', !!shr, await page.evaluate(() => document.querySelector('.fl-inline-details .fl-panel-sharing').innerText.slice(0, 120)))
      await shot('details-alone-1300')
      await page.evaluate(() => document.querySelector('.fl-inline-details .fl-details-close').click())
      check('closing the details removes them and unmarks the row', await page.evaluate(() => !document.querySelector('.fl-inline-details') && !document.querySelector('.fl-row[aria-selected="true"]')))
      await page.evaluate(() => document.querySelector('.fl-row[data-name="layout.svg"] .fl-show-details').click())
      const prev = await page.waitFor(() => { const i = document.querySelector('.fl-inline-details .fl-preview'); return i && !i.hidden && i.naturalWidth > 0 }, { timeout: 10000 }).catch(() => false)
      check('the actions menu has Details; an image shows a preview', !!prev)
      await page.evaluate(() => document.querySelector('.fl-inline-details .fl-details-close').click())

      // Click a folder: it opens in the data browser, in this pane.
      await page.evaluate(() => document.querySelector('.fl-row[data-name="plans"] a').click())
      await page.waitFor(() => document.querySelector('.fl-crumbs .fl-here')?.textContent === 'plans' && document.querySelectorAll('.fl-row').length === 2, { timeout: 20000 })
      check('clicking a folder opens it in place', (await rows(page)).join(' ') === 'autumn.md spring.md')
      await page.evaluate(() => [...document.querySelectorAll('.fl-crumbs a')].find(a => a.textContent === 'garden').click())
      await page.waitFor(() => document.querySelector('.fl-crumbs .fl-here')?.textContent === 'garden' && document.querySelectorAll('.fl-row').length === 8, { timeout: 20000 })
      check('a breadcrumb goes back up', true)

      await page.goto(address(GARDEN + 'empty/'))
      await page.waitFor(() => document.querySelector('.fl-empty'), { timeout: 40000 })
      await sleep(800)
      check('an empty folder says so, and offers no upload when logged out', (await page.evaluate(() => document.querySelector('.fl-empty').textContent)) === 'This folder is empty.')
      await shot('empty-1300')

      await page.goto(address(BASE + 'locked/'))
      // The browser itself answers a 401 before any pane draws; if the pane draws, it must say to log in.
      await sleep(6000)
      const said = await page.evaluate(() => document.querySelector('.fl-error')?.textContent || (!document.querySelector('.fl-row') && !document.querySelector('.fl.folder-lab-pane') ? 'the browser answered (access denied) and no pane drew' : 'LISTED'))
      check('a private folder, logged out: nothing listed', /private\. Log in|access denied/.test(said), said)
      check('it does not open on a file', await page.evaluate(() => window.panes.byName('folder-lab').label({ uri: 'http://x.example/a.txt' }) === null && window.panes.byName('folder-lab').label({ uri: 'http://x.example/a/' }) === 'Files'))
      const errors = page.console.filter(l => /exception/.test(l) && /fl-|folder-pane/.test(l))
      check('no errors from the pane', !errors.length, errors.join(' | ').slice(0, 300))
    }
  } catch (error) { await finish(error) }
  await finish()
}

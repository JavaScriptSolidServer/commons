// Where it should and should not be offered, hostile text, odd links, a class as the subject.
// Logged out: nothing here needs a login.
import { open, sleep, config } from '../../lib/lib.mjs'
import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, DATA, choose, views, READ, WATCH } from './helpers.mjs'

const { page, check, finish, shot, address } = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: false, fresh: true, resource: DATA + 'few.ttl' })
try {
  let menu = await views(page)
  check('two things of a type: no Table', !menu.includes('Table') && menu.length > 1, menu.join(' | '))

  await page.goto(address(DATA + 'library.ttl#b1'))
  menu = await views(page)
  check('one thing in a document: no Table', !menu.includes('Table'), menu.join(' | '))

  // Hostile and odd values.
  await page.goto(address(DATA + 'odd.ttl'))
  await page.evaluate(WATCH)
  await choose(page, 'Table')
  await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length === 3, { timeout: 20000 })
  const odd = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.tbl thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim())
    const rows = [...document.querySelectorAll('.tbl tbody tr')]
    const byTitle = (t) => rows.find(r => r.cells[0].textContent === t)
    const t1 = byTitle('<img src=x onerror=window.__pwned=1>')
    return {
      heads,
      names: rows.map(r => r.cells[0].textContent),
      img: !!document.querySelector('.tbl img'),
      pwned: !!window.__pwned,
      jsLink: t1 && [...t1.cells[heads.indexOf('Link')].querySelectorAll('a')].map(a => a.getAttribute('href')),
      jsText: t1 && t1.cells[heads.indexOf('Link')].textContent,
      owner: t1 && t1.cells[heads.indexOf('Owner')].textContent,
      urn: byTitle('=SUM(A1:A2)') && byTitle('=SUM(A1:A2)').cells[heads.indexOf('Link')].querySelector('a'),
      done: byTitle('Plain, with "quotes"').cells[heads.indexOf('Done')].textContent,
      neg: byTitle('=SUM(A1:A2)') && byTitle('=SUM(A1:A2)').cells[heads.indexOf('Priority')].textContent
    }
  })
  check('a title is used as the name column', odd.heads[0] === 'Title', odd.heads.join('|'))
  check('hostile text stays text', !odd.img && !odd.pwned && odd.names.includes('<img src=x onerror=window.__pwned=1>'))
  check('a javascript: link is not a link', odd.jsLink && odd.jsLink.length === 0 && /alert\(1\)/.test(odd.jsText), JSON.stringify(odd.jsLink) + ' ' + odd.jsText)
  check('a urn is text, not a link', odd.urn === null)
  check('a blank node shows its values', odd.owner === 'Nick: al', odd.owner)
  check('a boolean reads true', odd.done === 'true', odd.done)
  check('negative numbers format', odd.neg === (-1).toLocaleString(), odd.neg)
  await page.evaluate(() => { navigator.clipboard.writeText = (t) => { window.__csv = t; return Promise.resolve() } })
  await page.evaluate(() => document.querySelector('.tbl-copy').click())
  await sleep(300)
  const csv = (await page.evaluate(() => window.__csv)).split('\r\n')
  check('CSV: formulas defused, quotes escaped, negative numbers kept', csv.some(l => l.startsWith("'=SUM(A1:A2),")) && csv.some(l => l.startsWith('"Plain, with ""quotes""",')) && csv.some(l => /,-1,/.test(l)) && csv.some(l => /,true$/.test(l)), csv.join(' / '))
  await shot('edge-odd')
  check('still nothing written', (await page.evaluate(() => window.__writes)).length === 0)

  // Numbers and dates that careless formatting gets wrong (tests/data/numbers.ttl, copied to the pod here).
  copyFileSync(path.join(import.meta.dirname, 'data', 'numbers.ttl'), path.join(config.podDir, 'public', 'suite-data', 'table', 'numbers.ttl'))
  await page.goto(address(DATA + 'numbers.ttl'))
  await choose(page, 'Table')
  await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length === 4, { timeout: 20000 })
  const nums = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.tbl thead th')].map(th => th.textContent.trim())
    const row = (n) => [...document.querySelectorAll('.tbl tbody tr')].find(r => r.cells[0].textContent === n)
    const cell = (n, h) => row(n).cells[heads.indexOf(h)].textContent
    return { big: cell('Big', 'Count'), bad: cell('Bad', 'Day'), good: cell('Good', 'Day'), early: cell('Early', 'Day'), badTime: cell('Bad', 'At') }
  })
  check('a 20-digit integer is shown exactly', nums.big === (12345678901234567890n).toLocaleString(), nums.big)
  check('an impossible date is shown as written', nums.bad === '2023-02-30' && nums.badTime === '2023-02-30T10:00:00Z' && nums.good === new Date(Date.UTC(2023, 1, 28)).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }), JSON.stringify(nums))
  check('a date in the year 90 stays in the year 90', /\b90\b/.test(nums.early) && !/1990/.test(nums.early), nums.early)

  // A class as the subject (the classInstance / tableOfClass case): its members, from the store.
  await page.goto(address(DATA + 'library.ttl'))
  await views(page)
  const cls = await page.evaluate(async (pane) => {
    const store = globalThis.SolidLogic.store
    const mod = await import(pane)
    const book = store.sym('http://schema.org/Book')
    const label = mod.default.label(book, { session: { store } })
    const focus = mod.default.shouldGetFocus(book)
    const host = document.createElement('div')
    host.id = 'class-host'
    host.appendChild(mod.default.render(book, { dom: document, session: { store } }))
    document.getElementById('OutlineView').prepend(host)
    return { label, focus, labelOther: mod.default.label(store.sym('http://schema.org/Nothing'), { session: { store } }) }
  }, PANE)
  const seen = await page.evaluate(READ)
  check('a class with members is offered, without focus', cls.label === 'Table' && cls.focus === false && cls.labelOther === null, JSON.stringify(cls))
  check('a class: one row per member', seen.title === 'Book' && seen.count === '12 of 12' && /in the loaded data/.test(seen.meta), seen.meta)
  await shot('edge-class')

  // A folder: its files are rows (sizes and dates), the folder itself is not.
  await page.goto(address(DATA))
  await choose(page, 'Table')
  await page.waitFor(() => document.querySelectorAll('.tbl tbody tr').length > 0, { timeout: 20000 })
  const folder = await page.evaluate(READ)
  check('a folder of 3+ files: a table of the files', folder.title === 'Resource' && folder.names.includes('library.ttl') && !folder.names.some(n => n === 'table') && folder.heads.includes('Modified'), folder.names.join('|') + ' / ' + folder.heads.join('|'))
  await shot('edge-folder')
} catch (error) { await finish(error) }
await finish()

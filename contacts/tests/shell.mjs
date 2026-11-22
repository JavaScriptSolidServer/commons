// The pane inside the suite shell, logged in: the groups in the navigation column (with counts and New contact),
// the list and the card in the content, the header search, a contact added from the navigation (a toast, and the
// pod file), then the same at a true 400 px: the drawer, list then card, and the way back.
// Works on a copy of the sample book under suite-data/contacts/, removed after (KEEP=1 keeps it).
//   node tests/shell.mjs
import { open, LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { mkdirSync, cpSync, rmSync } from 'node:fs'
import path from 'node:path'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const RUN = Date.now().toString(36)
const BOOK_URL = POD + 'public/suite-data/contacts/shell-' + RUN + '/'
const BOOK_DIR = path.join(config.podDir, 'public', 'suite-data', 'contacts', 'shell-' + RUN)
const BOOK = BOOK_URL + 'index.ttl#this'
const here = import.meta.dirname
mkdirSync(BOOK_DIR, { recursive: true })
cpSync(path.join(here, '..', 'samples', 'book'), BOOK_DIR, { recursive: true })
const served = async (address) => { const r = await fetch(address, { headers: { Accept: 'text/turtle' } }); return r.ok ? await r.text() : 'HTTP ' + r.status }

const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9516, dir: here, login: true, resource: BOOK })
const look = () => page.evaluate(() => {
  const r = document.querySelector('.sh.suite-shell-pane')
  const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().width > 0 && getComputedStyle(n).display !== 'none'
  return {
    app: r.dataset.app,
    content: !!r.querySelector('.sh-content .ctc.contacts-pane'),
    nav: vis(r.querySelector('.sh-navcol')),
    navItems: [...r.querySelectorAll('.sh-navcol .ctc-nav-item')].map(b => b.querySelector('.ctc-nav-label') ? b.querySelector('.ctc-nav-label').textContent + ':' + ((b.querySelector('.ctc-nav-count') || {}).textContent || '') : b.textContent),
    current: (r.querySelector('.sh-navcol .ctc-nav-item[aria-current="page"] .ctc-nav-label') || {}).textContent || '',
    newContact: (r.querySelector('.sh-navcol .ctc-nav-new.ctc-btn-primary') || {}).textContent || '',
    chips: !!r.querySelector('.sh-content .ctc-chips'),
    topActions: r.querySelectorAll('.sh-content .ctc-actions button').length,
    rows: [...r.querySelectorAll('.sh-content .ctc-row-title')].map(n => n.textContent),
    card: (r.querySelector('.sh-content .ctc-person .ctc-name') || {}).textContent || '',
    listShown: vis(r.querySelector('.ctc-side')),
    cardShown: vis(r.querySelector('.ctc-main')),
    back: vis(r.querySelector('.ctc-back')),
    details: vis(r.querySelector('.sh-detcol')),
    detailsBtn: vis(r.querySelector('.sh-details-btn')),
    navToggle: vis(r.querySelector('.sh-nav-toggle'))
  }
})
const click = (sel, text) => page.evaluate((s, t) => { const n = [...document.querySelectorAll(s)].find(e => !t || e.textContent.trim() === t); if (!n) return false; n.click(); return true }, sel, text || '')
const navTo = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('.sh-navcol .ctc-nav-item')].find(x => (x.querySelector('.ctc-nav-label') || {}).textContent === l); if (b) b.click(); return !!b }, label)
const rowsAre = (names) => page.waitFor((n) => [...document.querySelectorAll('.sh-content .ctc-row-title')].map(x => x.textContent).join(',') === n, { timeout: 8000, args: [names] }).then(() => true, () => false)
const fits = async (what) => { const m = await measure(page); check(`no sideways scroll at ${m.innerWidth} px: ${what}`, !m.sideways, m.scrollWidth + ' ' + m.poking.join(' ')) }

try {
  await page.waitFor(() => document.querySelectorAll('.sh-navcol .ctc-nav-item').length === 4 && document.querySelectorAll('.sh-content .ctc-row').length === 3 && !!document.querySelector('.sh-navcol .ctc-add'), { timeout: 40000 })
  await sleep(500)
  let s = await look()
  check('the shell opens the book in the Contacts app, drawn by this pane', s.app === 'contacts' && s.content, s.app)
  check('navigation: New contact on top, All contacts and each group with counts, New group', s.newContact === 'New contact' && s.navItems.join(',') === 'All contacts:3,Friends:2,Work:1,New group', s.newContact + ' | ' + s.navItems.join(','))
  check('All contacts is the current item', s.current === 'All contacts', s.current)
  check('in the shell: no group chips and no top buttons in the content (they are in the navigation)', !s.chips && s.topActions === 0)
  check('the list, sorted by name', s.rows.join(',') === 'Alice Example,Bob Builder,Carol Danvers', s.rows.join(','))
  check('no details column or (i) button: the card is the content', !s.details && !s.detailsBtn)

  await navTo('Friends')
  check('a group in the navigation filters the list (Carol by her WebID)', await rowsAre('Alice Example,Carol Danvers'))
  check('the group is marked current', (await look()).current === 'Friends')
  await navTo('All contacts')
  check('All contacts shows everyone again', await rowsAre('Alice Example,Bob Builder,Carol Danvers'))

  await page.evaluate(() => { const i = document.querySelector('.sh-header-search input'); i.value = 'example works'; i.dispatchEvent(new Event('input', { bubbles: true })) })
  check('the header search filters the list (by organisation)', await rowsAre('Bob Builder'))
  check('and fills the list\'s own search box', await page.evaluate(() => document.querySelector('.ctc-search input').value === 'example works'))
  await page.evaluate(() => { const i = document.querySelector('.sh-header-search input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })
  check('clearing it shows everyone', await rowsAre('Alice Example,Bob Builder,Carol Danvers'))

  await click('.sh-content .ctc-row', 'Bob BuilderSite manager · Example Works Ltd')
  await page.waitFor(() => !!document.querySelector('.sh-content .ctc-person'), { timeout: 8000 })
  s = await look()
  check('a row opens the card beside the list, with the row marked', s.card === 'Bob Builder' && s.listShown && s.cardShown && !s.back && await page.evaluate(() => document.querySelector('.ctc-row[aria-current="true"] .ctc-row-title').textContent === 'Bob Builder'), JSON.stringify(s))
  check('the card has a big avatar (his photo) and his links', await page.evaluate(() => !!document.querySelector('.ctc-person img.ctc-avatar.ctc-avatar-lg') && !!document.querySelector('.ctc-person a[href="mailto:bob@example.com"]')))
  await fits('book with a card open')
  await shot('shell-card-1300')

  // New contact from the navigation column.
  await click('.sh-navcol .ctc-add')
  await page.waitFor(() => !!document.querySelector('.sh-content form.ctc-form'), { timeout: 8000 })
  await shot('shell-add-1300')
  await page.evaluate(() => { const f = document.querySelector('form.ctc-form'); f.querySelector('[name=name]').value = 'Dave Example'; f.querySelector('[name=email]').value = 'dave@example.org'; f.requestSubmit() })
  const toast = await page.waitFor(() => [...document.querySelectorAll('.sh-toast')].some(t => /Dave Example was added/.test(t.textContent)), { timeout: 30000 }).then(() => true, () => false)
  check('adding shows a success toast, not a line in the content', toast && await page.evaluate(() => !!document.querySelector('.sh-toast-success') && document.querySelector('.ctc-msg').hidden))
  check('people.ttl lists Dave on the pod', /Dave Example/.test(await served(BOOK_URL + 'people.ttl')))
  check('the navigation count follows', await page.waitFor(() => [...document.querySelectorAll('.sh-navcol .ctc-nav-count')].map(c => c.textContent)[0] === '4', { timeout: 10000 }).then(() => true, () => false))
  check('Dave is shown and selected', (await look()).card === 'Dave Example')

  // ---- a true 400 px page ----
  await narrow(page) // then a fresh load, as a phone would open it: the shell closes its drawer when it mounts
  await page.goto(address(BOOK))
  await page.waitFor(() => document.querySelectorAll('.sh-content .ctc-row').length === 4 && !!document.querySelector('.sh-navcol .ctc-add'), { timeout: 40000 })
  await sleep(500)
  s = await look()
  check('400 px: the navigation is a closed drawer with a toggle', !s.nav && s.navToggle)
  check('400 px: the list shows first, no card beside it', s.listShown && !s.cardShown)
  await fits('the list')
  await shot('shell-list-400')
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .ctc-row')].find(r => /Dave Example/.test(r.textContent)).click())
  await page.waitFor(() => !!document.querySelector('.sh-content .ctc-person'), { timeout: 8000 })
  s = await look()
  check('400 px: the card replaces the list, with a way back', s.card === 'Dave Example' && s.cardShown && !s.listShown && s.back, JSON.stringify(s))
  await fits('a card')
  await shot('shell-card-400')
  await click('.ctc-back')
  s = await look()
  check('400 px: back shows the list', s.listShown && !s.cardShown)
  await click('.sh-nav-toggle')
  await page.waitFor(() => !document.querySelector('.sh-navcol').hidden, { timeout: 5000 })
  await shot('shell-nav-400')
  await navTo('Work')
  check('400 px: a group in the drawer filters the list and closes the drawer', await rowsAre('Bob Builder') && await page.waitFor(() => document.querySelector('.sh-navcol').hidden, { timeout: 5000 }).then(() => true, () => false))
  await click('.sh-content .ctc-row')
  await page.waitFor(() => !!document.querySelector('.sh-content .ctc-person'), { timeout: 8000 })
  s = await look()
  check('400 px: then a person, list hidden', s.card === 'Bob Builder' && !s.listShown)
  await fits('a card from a group')
} catch (error) {
  if (!process.env.KEEP) rmSync(BOOK_DIR, { recursive: true, force: true })
  await finish(error)
}
if (process.env.KEEP) console.log('kept: ' + BOOK_URL); else rmSync(BOOK_DIR, { recursive: true, force: true })
await finish()

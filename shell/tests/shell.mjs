// The shell on the test pod, logged in as `me`: header, launcher, avatar menu, the nav/details contract (demo pane),
// the content-only fallback (Notes), other views, search, and that it writes nothing.
//   node tests/shell.mjs        logs in, everything at 1300 px
//   node tests/shell.mjs 400    reuses that login; a true 400 px page (CDP device metrics, design/viewport.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const width = +(process.argv[2] || 1300)
const SHELL = LAB + 'shell/suite-shell-pane.js'
const BASE = POD + 'public/suite-data/shell/'
const SHELF = BASE + 'shelf/shelf.ttl'
const NOTE = BASE + 'notes/welcome.md'
const ME = POD + 'profile/card.jsonld#me'
const TASK_LIST = LAB + 'tasks/samples/lists/garden/index.ttl#this' // a wf:Tracker of cal:Vtodo (read only)
const TRACKER = LAB + 'issues/samples/shed/index.ttl#this' // an ordinary wf:Tracker (read only)
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9501, dir: import.meta.dirname, login: width === 1300, resource: SHELF })

const watched = () => ['profile/card.jsonld', ...readdirSync(path.join(config.podDir, 'settings')).map(f => 'settings/' + f), 'public/suite-data/shell/shelf/shelf.ttl']
  .map(f => f + ':' + createHash('sha1').update(readFileSync(path.join(config.podDir, f))).digest('hex')).join('\n')
const before = watched()

const ready = (uri) => page.waitFor((u) => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && new URL(location.href).searchParams.get('uri') === u && r.querySelector('.sh-bar-title').textContent.replace(/\/$/, '') === u.replace(/\/$/, '') }, { timeout: 40000, args: [uri] }).then(() => true, () => false)
const go = async (uri) => { await page.goto(address(uri)); const ok = await ready(uri); await sleep(1200); return ok }
const click = (sel, text) => page.evaluate((s, t) => { const n = [...document.querySelectorAll(s)].find(e => !t || e.textContent.trim() === t || e.getAttribute('aria-label') === t || e.dataset.app === t || e.dataset.action === t); if (!n) return false; n.click(); return true }, sel, text || '')
const state = () => page.evaluate(() => {
  const r = document.querySelector('.sh.suite-shell-pane')
  const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().width > 0
  const rect = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)] }
  return {
    app: r.dataset.app, appName: r.querySelector('.sh-header-app').textContent, loggedIn: r.dataset.loggedIn,
    nav: vis(r.querySelector('.sh-navcol')), navItems: [...r.querySelectorAll('.sh-navcol .dm-nav-item')].map(b => b.textContent),
    navToggle: vis(r.querySelector('.sh-nav-toggle')), navRect: rect(r.querySelector('.sh-navcol')),
    details: vis(r.querySelector('.sh-detcol')), detailsTitle: (r.querySelector('.sh-detcol .dm-details-title') || {}).textContent || '', detRect: rect(r.querySelector('.sh-detcol')),
    detailsBtn: vis(r.querySelector('.sh-details-btn')), viewsBtn: vis(r.querySelector('.sh-views-btn')),
    title: (r.querySelector('.dm-heading') || {}).textContent || '', rows: [...r.querySelectorAll('.dm-row')].map(x => x.querySelector('.dm-row-title').textContent),
    selected: [...r.querySelectorAll('.dm-row[aria-selected="true"]')].length,
    contentPane: (r.querySelector('.sh-content > *') || {}).className || '',
    launcherOpen: vis(r.querySelector('.sh-launcher')), launcherRect: rect(r.querySelector('.sh-launcher')),
    accountOpen: vis(r.querySelector('.sh-account')), accountRect: rect(r.querySelector('.sh-account')),
    top: Math.round(r.getBoundingClientRect().top), browserBar: Math.round(document.querySelector('.browse-bar').getBoundingClientRect().height)
  }
})
const noSideways = async (what) => { const m = await measure(page); check(`no sideways scroll at ${m.innerWidth} px: ${what}`, !m.sideways, `scrollWidth ${m.scrollWidth}${m.poking.length ? '; past the edge: ' + m.poking.join(' ') : ''}`) }

try {
  if (width !== 1300) await narrow(page, width)
  const tag = width === 1300 ? '1300' : String(width)

  // ---- the frame, on the demo shelf (navigation + details)
  // A reused session (the 400 run) is restored after the first render: the shell must follow it.
  await page.goto(address(SHELF))
  check('the shell opens first and draws the demo pane inside its frame', await ready(SHELF))
  const firstSeen = await page.evaluate(() => document.querySelector('.sh.suite-shell-pane').dataset.loggedIn)
  const t0 = Date.now()
  const restored = await page.waitFor(() => document.querySelector('.sh.suite-shell-pane[data-ready]')?.dataset.loggedIn === 'yes', { timeout: 30000 }).then(() => true, () => false)
  check('the shell shows the person once the browser has the session', restored, `first render: logged in = ${firstSeen}; logged in after ${Date.now() - t0} ms`)
  await sleep(1200)
  let s = await state()
  check('the frame starts right under the browser\'s own bar', s.top === s.browserBar, `${s.top} vs ${s.browserBar}`)
  check('the content is the demo pane', /suite-shell-demo-pane/.test(s.contentPane), s.contentPane)
  check('the header: launcher, search box, avatar', await page.evaluate(() => !!document.querySelector('.sh-launch-btn') && !!document.querySelector('.sh-header-search input') && !!document.querySelector('.sh-account-btn .sh-avatar')))
  check('content: all six books', s.rows.length === 6 && s.title === 'Alice\'s reading shelf', s.title + ': ' + s.rows.join(', '))
  check('the details button is offered (the pane has renderDetails)', s.detailsBtn)
  if (width === 1300) {
    check('navigation column shown, from renderNavigation', s.nav && s.navItems.join('|') === 'All books6|Garden2|Kitchen2|Novels3', s.navItems.join('|'))
    await shot('shelf-' + tag)
    // Narrowing the window past the drawer breakpoint closes the column, so the first press of the toggle opens it.
    await narrow(page, 800)
    await sleep(300)
    s = await state()
    const navAttr = await page.evaluate(() => document.querySelector('.sh.suite-shell-pane').dataset.nav)
    check('narrowing below 900 px closes the drawer', !s.nav && navAttr === 'closed' && s.navToggle, navAttr)
    await click('.sh-nav-toggle')
    await sleep(300)
    check('...and the first press of the toggle opens it', (await state()).nav)
    await wide(page)
    await sleep(300)
    check('widening again shows the column beside the content', (await state()).nav && await page.evaluate(() => document.querySelector('.sh.suite-shell-pane').dataset.nav === 'open'))
  } else {
    check('narrow: the navigation is a closed drawer with a toggle', !s.nav && s.navToggle)
    await shot('shelf-' + tag)
    await click('.sh-nav-toggle')
    await sleep(300)
    s = await state()
    check('narrow: the toggle opens the drawer over the content', s.nav && s.navRect[0] === 0 && s.navRect[2] <= width - 56, s.navRect.join(','))
    await shot('shelf-nav-' + tag)
  }
  await click('.sh-navcol .dm-nav-item', 'Garden2')
  await sleep(400)
  s = await state()
  check('a navigation item changes the content in place (shared context.suite.state)', s.title === 'Garden' && s.rows.join('|') === 'Soil First|The Quiet Orchard', s.title + ': ' + s.rows.join('|'))
  check('the chosen item is marked current', await page.evaluate(() => document.querySelector('.sh-navcol [aria-current="page"]').textContent === 'Garden2'))
  if (width !== 1300) check('narrow: following a navigation item closes the drawer', !s.nav)
  await click('.dm-row')
  await sleep(400)
  s = await state()
  check('a row opens the details column with renderDetails(book)', s.details && s.detailsTitle === 'Soil First' && s.selected === 1, s.detailsTitle)
  if (width === 1300) check('wide: details is a column beside the content', s.detRect[1] <= 1300 && s.detRect[2] >= 300, s.detRect.join(','))
  else check('narrow: details covers the page width', s.detRect[0] === 0 && s.detRect[2] === width, s.detRect.join(','))
  await shot('shelf-details-' + tag)
  await noSideways('shelf with details open')
  await click('.sh-details-close')
  await sleep(300)
  s = await state()
  check('closing the details clears the selection (onClose)', !s.details && s.selected === 0)
  await click('.sh-details-btn')
  await sleep(300)
  s = await state()
  check('the details button shows the shelf itself', s.details && s.detailsTitle === 'Alice\'s reading shelf', s.detailsTitle)
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await sleep(300)
  check('Escape closes the details', !(await state()).details)
  // Escape belongs to a pane's own modal or menu first (DESIGN.md: the shell acts last, and not when handled).
  await click('.sh-details-btn')
  await sleep(300)
  const esc = await page.evaluate(async () => {
    const content = document.querySelector('.sh-content')
    const press = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    const open = () => document.querySelector('.sh.suite-shell-pane').dataset.details === 'open'
    const out = []
    const modal = content.appendChild(document.createElement('div'))
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true')
    const inside = modal.appendChild(document.createElement('button')); inside.textContent = 'x'; inside.focus()
    press(inside); out.push(open())
    const row = content.querySelector('.dm-row')
    press(row); out.push(open()) // a visible pane modal is open, even with the focus elsewhere
    modal.remove()
    const own = (e) => { if (e.key === 'Escape') e.preventDefault() }
    content.addEventListener('keydown', own)
    press(row); out.push(open())
    content.removeEventListener('keydown', own)
    press(row); out.push(open())
    return out.join(' ')
  })
  check('Escape inside a pane\'s modal, or with one open, leaves the details open', esc.startsWith('true true'), esc)
  check('Escape a pane handled (preventDefault) leaves the details open; an unhandled one closes them', esc === 'true true true false', esc)

  // ---- other views of the same thing
  await click('.sh-views-btn')
  await sleep(300)
  const views = await page.evaluate(() => [...document.querySelectorAll('.sh-views .sh-menu-item')].map(b => b.dataset.pane))
  check('"Other views" lists the other panes that can show it', views.includes('suite-shell-demo') && views.includes('source-lab'), views.join(' '))
  await click('.sh-views .sh-menu-item[data-pane="source-lab"]')
  await sleep(1500)
  s = await state()
  check('picking one shows it in the same frame, content only (no nav, no details)', /source-pane/.test(s.contentPane) && !s.nav && !s.navToggle && !s.detailsBtn, s.contentPane)

  // ---- Notes: the suite's own copy (with navigation), even though the tool index registers the published one
  check('a note opens in the shell', await go(NOTE))
  await sleep(800)
  s = await state()
  const notesNav = await page.evaluate(() => document.querySelector('.sh-navcol').textContent.replace(/\s+/g, ' ').trim())
  const which = await page.evaluate(() => { const reg = panes.byName('notes-reader'); return { registered: !!reg && typeof reg.renderNavigation === 'function', published: (performance.getEntriesByType('resource').some(e => /solid-panes\.github\.io\/notes\/notes-pane\.js/.test(e.name))) } })
  check('Notes: the suite\'s own module draws it, with its navigation', /notes/.test(s.contentPane) && s.app === 'notes' && (width === 1300 ? s.nav : s.navToggle) && notesNav.length > 0, `nav: ${notesNav.slice(0, 80)}; registry's notes-reader has nav: ${which.registered}; published copy loaded: ${which.published}`)
  check('the note itself is shown', await page.evaluate(() => /Welcome to the suite/.test(document.querySelector('.sh-content').textContent)))
  await shot('notes-' + tag)
  await noSideways('a note')

  // ---- content-only fallback: a pane with neither renderNavigation nor renderDetails (Data, from Other views)
  await click('.sh-views-btn')
  await sleep(300)
  await click('.sh-views .sh-menu-item[data-pane="data-lab"]')
  await sleep(1500)
  s = await state()
  check('content-only fallback: Data draws the content; no nav column or toggle, no details button', /data-pane/.test(s.contentPane) && !s.nav && !s.navToggle && !s.detailsBtn, s.contentPane)
  await click('.sh-views-btn')
  await click('.sh-views .sh-menu-item[data-pane="notes-reader"]')
  await sleep(800)

  // ---- launcher
  await click('.sh-launch-btn')
  await sleep(300)
  s = await state()
  const tiles = await page.evaluate(() => ({ apps: [...document.querySelectorAll('.sh-launcher [data-app]')].map(b => b.dataset.app), tools: [...document.querySelectorAll('.sh-launcher .sh-tools .sh-launcher-tile')].map(b => b.textContent), current: (document.querySelector('.sh-launcher [aria-current="page"]') || {}).dataset?.app, umai: (document.querySelector('.sh-launcher a[data-tool-app]') || {}).rel }))
  check('launcher opens and lists the suite\'s apps', s.launcherOpen && tiles.apps.join(' ') === 'dashboard files activity photos contacts tasks boards notes pads polls meetings', tiles.apps.join(' '))
  check('launcher lists the tool index too: its panes and its app (no PodOS HTML tool, no second Notes)', tiles.tools.join('|') === 'Meetings calendar|Umai viewer' && tiles.umai === 'noopener noreferrer', tiles.tools.join('|'))
  check('the current app is marked in the launcher', tiles.current === 'notes', tiles.current)
  check('the launcher fits the page', s.launcherRect[0] >= 0 && s.launcherRect[1] <= width, s.launcherRect.join(','))
  await shot('launcher-' + tag)
  await noSideways('launcher open')
  await click('.sh-launcher [data-app]', 'files')
  check('Files opens on the pod\'s root folder', await ready(POD))
  await sleep(1500)
  s = await state()
  check('...drawn by the suite\'s Files pane inside the shell', /folder-lab-pane/.test(s.contentPane) && s.app === 'files', s.contentPane)
  await shot('files-' + tag)
  await noSideways('Files')
  // A pane's own in-place link (GotoSubject without naming a pane) stays in the shell.
  await page.evaluate((u) => panes.getOutliner(document).GotoSubject(SolidLogic.store.sym(u), true, undefined, true, undefined), BASE + 'notes/')
  check('a pane\'s own navigation stays inside the shell', await ready(BASE + 'notes/'))
  await click('.sh-launch-btn')
  await click('.sh-launcher [data-app]', 'contacts')
  // The test pod's private type index registers the demo address book (private/suite-demo/), so Contacts opens it.
  check('an app opens what the type index registers for it', await ready(POD + 'private/suite-demo/contacts/index.ttl#this'))
  await sleep(1500)
  s = await state()
  check('...in the suite\'s Contacts pane', /contacts-pane/.test(s.contentPane) && s.app === 'contacts', s.contentPane)
  await shot('contacts-' + tag)

  // ---- avatar menu
  await click('.sh-account-btn')
  await sleep(300)
  s = await state()
  const menu = await page.evaluate(() => ({ who: document.querySelector('.sh-account .sh-who span').textContent, items: [...document.querySelectorAll('.sh-account .sh-menu-item')].map(b => b.textContent) }))
  check('the avatar menu: who, then Profile, Settings, Log out', s.accountOpen && menu.who === 'http://127.0.0.1:8732/me/profile/card.jsonld#me' && menu.items.join('|') === 'Profile|Settings|Log out', menu.who + ' ' + menu.items.join('|'))
  check('the avatar menu fits the page', s.accountRect[0] >= 0 && s.accountRect[1] <= width, s.accountRect.join(','))
  await shot('account-' + tag)
  await click('.sh-account .sh-menu-item', 'settings')
  check('Settings opens on the person', await ready(ME))
  await sleep(1500)
  s = await state()
  check('...with the suite\'s Settings pane', /settings-pane/.test(s.contentPane) && s.app === 'settings', s.contentPane)
  await shot('settings-' + tag)
  await click('.sh-account-btn')
  await click('.sh-account .sh-menu-item', 'profile')
  await sleep(1500)
  s = await state()
  check('Profile opens the profile editor on the same person', /profile-edit-pane/.test(s.contentPane) && s.app === 'profile', s.contentPane)
  await page.evaluate(() => document.body.click())

  // ---- which app a thing opens in: by SUITE_APPS order, not load order
  check('the pod root opens in Dashboard (before Files and Activity)', await go(POD) && (await state()).app === 'dashboard', (await state()).app)
  await page.reload()
  check('...again after a reload', await ready(POD) && (await sleep(800), (await state()).app === 'dashboard'), (await state()).app)
  check('a task list opens in Tasks', await go(TASK_LIST) && (await state()).app === 'tasks', (await state()).app + ' ' + (await state()).contentPane)
  check('an ordinary tracker opens in Boards', await go(TRACKER) && (await state()).app === 'boards', (await state()).app + ' ' + (await state()).contentPane)
  await click('.sh-launch-btn')
  await click('.sh-launcher [data-app]', 'activity')
  check('Activity opens on the pod root', await ready(POD) && (await sleep(1000), (await state()).app === 'activity'), (await state()).contentPane)

  // ---- a toast raised just before suite.go() is still there after the navigation
  await page.evaluate((u) => { const api = document.querySelector('.sh.suite-shell-pane').suiteApi; api.toast('Moved to the shelf', { kind: 'success' }); api.go(u) }, SHELF)
  check('a toast survives suite.go()', await ready(SHELF) && await page.evaluate(() => [...document.querySelectorAll('.sh-toast')].some(t => t.textContent === 'Moved to the shelf')))

  // ---- search box: as-you-type event; Enter opens the search page with the words kept
  await go(SHELF)
  const heard = await page.evaluate(async () => {
    const got = []
    document.addEventListener('suite-search', (e) => got.push(e.detail.query + ':' + e.detail.submit))
    const input = document.querySelector('.sh-header-search input')
    input.value = 'soup'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 400))
    input.closest('form').requestSubmit()
    return got.join(' ')
  })
  check('search: typing and Enter raise suite-search', heard === 'soup:false soup:true', heard)
  const page2 = await page.waitFor(() => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && !!r.querySelector('.sh-content .suite-search-pane') && r.querySelector('.sh-header-search input').value === 'soup' && new URL(location.href).searchParams.get('uri') }, { timeout: 30000 }).catch(() => '')
  check('search: Enter opens the search page on the pod root, the words kept in the box, no stale toast', page2 === POD && await page.evaluate(() => !document.querySelector('.sh-toast') || ![...document.querySelectorAll('.sh-toast')].some(t => /later version|not loaded/.test(t.textContent))), String(page2))
  await shot('search-' + tag)
  await page.evaluate((u) => { const i = document.querySelector('.sh-header-search input'); i.value = u; i.closest('form').requestSubmit() }, NOTE)
  check('search: an address opens it, in the shell', await ready(NOTE))

  await page.evaluate(() => window.scrollTo(0, 0))
  check('read-only: the profile, settings and the shelf file are unchanged', watched() === before)
  await finish()
} catch (error) { await finish(error) }

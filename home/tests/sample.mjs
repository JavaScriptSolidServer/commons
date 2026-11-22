// The two sample pods, read without logging in: Alice's (full) and Bob's (nearly empty), opened on
// each WebID with the home pane chosen, at 1300 and 400 px. Then the test pod's root logged out:
// the home pane does not claim it. Needs setup.mjs to have put the samples on the pod.
import { open, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'home/home-pane.js'
const BASE = POD + 'public/suite-data/home/'
const ALICE = BASE + 'alice/profile/card.ttl#me'
const BOB = BASE + 'bob/profile/card.ttl#me'
const CAROL = BASE + 'carol/profile/card.ttl#me' // a messy type index (review #1, #6)
const DAVE = BASE + 'dave/profile/card.ttl#me' // nothing readable (review #5)

const seen = (page) => page.evaluate(() => {
  const r = document.querySelector('.hom.home-pane')
  const texts = (sel) => [...r.querySelectorAll(sel)].map(n => n.textContent)
  const img = r.querySelector('.hom-face img')
  return {
    eyebrow: r.querySelector('.hom-eyebrow').textContent,
    name: r.querySelector('.hom-name').textContent,
    face: r.querySelector('.hom-face').textContent,
    photo: !!img && img.complete && img.naturalWidth > 0,
    pod: r.querySelector('.hom-pod') && r.querySelector('.hom-pod').textContent,
    things: (r.querySelector('.hom-things .hom-h h3') || {}).textContent || '',
    types: [...r.querySelectorAll('.hom-types a.hom-row')].map(t => t.querySelector('.hom-row-title').textContent + '|' + (t.querySelector('.hom-tag') ? 'private' : '') + '|' + new URL(t.href).searchParams.get('uri')),
    folders: texts('.hom-folders .hom-row-title'),
    tools: [...r.querySelectorAll('.hom-toolgrid .hom-row')].map(t => t.querySelector('.hom-row-title').textContent + '|' + t.querySelector('.hom-row-sub').textContent),
    off: texts('.hom-off').join(''),
    empty: texts('.hom-tools .hom-empty').join(''),
    emptyLink: (r.querySelector('.hom-tools .hom-empty a') || {}).href || '',
    manage: r.querySelector('.hom-manage') && new URL(r.querySelector('.hom-manage').href).searchParams.get('uri'),
    recent: [...r.querySelectorAll('.hom-recent li')].map(li => li.querySelector('.hom-row-title').textContent + '|' + li.querySelector('.hom-row-sub').textContent),
    shown: [...r.querySelectorAll('.hom-section')].filter(s => !s.hidden).map(s => s.className.split(' ')[1]).join(' '),
    links: [...r.querySelectorAll('a[href]')].every(a => /^https?:/.test(a.href) && a.rel === 'noopener'),
    wide: document.documentElement.scrollWidth > innerWidth
  }
})
// The pane is a tab on someone else's WebID (the profile opens first), so choose it, as a click on its tab would.
const showHome = async (page, uri) => {
  await page.waitFor(() => !!(window.panes && window.panes.byName('pod-home') && window.SolidLogic), { timeout: 40000 })
  await sleep(1500)
  const first = await page.evaluate(() => !!document.querySelector('.hom.home-pane'))
  await page.evaluate((u) => window.panes.getOutliner(document).GotoSubject(SolidLogic.store.sym(u), true, window.panes.byName('pod-home'), true, undefined), uri)
  await page.waitFor(() => !!document.querySelector('.hom.home-pane[data-ready]'), { timeout: 40000 })
  await sleep(800)
  return first
}

for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9525, dir: import.meta.dirname, width, login: false, fresh: true, resource: ALICE })
  try {
    if (width === 400) await narrow(page) // a true 400 px page, not the helper's ~500 px window
    const first = await showHome(page, ALICE)
    check(width + ' px: on someone else\'s WebID it is a tab, not the first view', !first)
    const a = await seen(page)
    check(width + ' px: Alice: name, photo, read-only, her pod', a.name === 'Alice Example' && a.photo && /read-only/i.test(a.eyebrow) && a.pod === BASE + 'alice/', `${a.name} ${a.photo} ${a.eyebrow} ${a.pod}`)
    const kinds = a.types.map(t => t.split('|')[0])
    check(width + ' px: a tile per registration, from the Turtle and the JSON-LD type index, with friendly names', kinds.join(',') === 'Address book,Bookmarks,Chat,Meeting,Notes,Plant collection,Poll,Tracker', kinds.join(','))
    check(width + ' px: the private ones are marked, and tiles open the instance', a.types.filter(t => t.includes('|private|')).length === 4 && a.types[0].endsWith('|' + BASE + 'alice/contacts/index.ttl#this') && a.types.find(t => t.startsWith('Notes')).endsWith('|' + BASE + 'alice/notes/'), a.types.join(' ; '))
    check(width + ' px: the top-level folders', a.folders.join(',') === 'bookmarks,chat,contacts,garden,notes,photos,polls,profile,settings,work', a.folders.join(','))
    const w = await page.evaluate(() => {
      const r = document.querySelector('.hom.home-pane')
      const box = (e) => e.getBoundingClientRect()
      const g = box(r.querySelector('.hom-greeting'))
      const inner = box(r.querySelector('.hom-inner'))
      return {
        cards: [...r.querySelectorAll('.hom-widget')].map(c => (c.querySelector('.hom-widget-head .hom-icon') ? '' : 'no icon:') + c.querySelector('.hom-widget-head h3').textContent).join(','),
        centred: Math.abs((g.left + g.right) / 2 - (inner.left + inner.right) / 2) < 3,
        shown: [...r.querySelectorAll('.hom-folders li')].filter(li => !li.hidden).length,
        more: (r.querySelector('.hom-folderbox .hom-more') || {}).textContent || ''
      }
    })
    check(width + ' px: a centred greeting, then a widget card per section, each with an icon and a title', w.centred && w.cards === 'Things in this pod,Folders,Panes and apps,Recently changed', JSON.stringify(w))
    check(width + ' px: a widget shows six rows and a "Show all" button', w.shown === 6 && w.more === 'Show all 10', JSON.stringify(w))
    await page.evaluate(() => document.querySelector('.hom-folderbox .hom-more').click())
    const all = await page.evaluate(() => [...document.querySelectorAll('.hom-folders li')].filter(li => !li.hidden).length + ' ' + document.querySelector('.hom-folderbox .hom-more').textContent)
    check(width + ' px: "Show all" shows the rest in place', all === '10 Show fewer', all)
    await page.evaluate(() => document.querySelector('.hom-folderbox .hom-more').click())
    check(width + ' px: panes and apps that are on; the one off is counted; the HTML tool is left out', a.tools.join(',') === 'Notes reader|Pane,Poll|Pane,Umai viewer|App' && a.off === '1 more is switched off.', a.tools.join(',') + ' / ' + a.off)
    check(width + ' px: manage opens her tool index (a JSON-LD file)', a.manage === BASE + 'alice/settings/tools.jsonld', a.manage)
    check(width + ' px: recently changed, newest first', a.recent.slice(0, 4).join(',') === 'shopping.md|in notes/,dinner/|in polls/,tomatoes.md|in garden/,tracker.ttl|in work/' && a.recent.length === 6, a.recent.join(','))
    check(width + ' px: every link is http(s) with rel=noopener', a.links)
    // Review #3: the time of a recent change is in the subline where the row meta is hidden (under 520 px).
    const when = await page.evaluate(() => { const li = document.querySelector('.hom-recent li'); const v = (e) => getComputedStyle(e).display !== 'none'; return [v(li.querySelector('.hom-row-meta')), v(li.querySelector('.hom-when-sub')), li.querySelector('.hom-when-sub').textContent === li.querySelector('time').textContent].join(' ') })
    check(width + ' px: recently changed shows its time (review #3)', when === (width === 400 ? 'false true true' : 'true false true'), when)
    const ma = await measure(page)
    check(width + ' px: no sideways scroll', !a.wide && !ma.sideways && ma.innerWidth === width, JSON.stringify(ma))
    await shot('alice-' + width)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot('alice-' + width + '-end')

    await page.goto(address(BOB))
    await showHome(page, BOB)
    const b = await seen(page)
    check(width + ' px: Bob, nearly empty: his initial, no kinds, two folders', b.name === 'Bob Example' && b.face === 'BE' && b.types.length === 0 && b.folders.join(',') === 'profile,settings', `${b.name} ${b.face} ${b.types.length} ${b.folders}`)
    check(width + ' px: Bob has no tool index: one line and a link to the Tools app', /^No tool index yet/.test(b.empty) && b.emptyLink === 'https://solid-apps.github.io/tools/' && b.tools.length === 0 && !b.manage, b.empty + ' ' + b.emptyLink)
    check(width + ' px: Bob: recently changed has his two files', b.recent.length === 2, b.recent.join(','))
    const mb = await measure(page)
    check(width + ' px: no sideways scroll for Bob', !b.wide && !mb.sideways, JSON.stringify(mb))
    await shot('bob-' + width)

    // Review #1 and #6: badly encoded addresses (%E0) do not blank the page; a javascript: instance gets no row.
    await page.goto(address(CAROL))
    await showHome(page, CAROL)
    const c = await seen(page)
    const err = await page.evaluate(() => document.querySelector('.hom-status').textContent)
    check(width + ' px: Carol: a badly encoded class and instance are shown raw, the rest still draws (review #1)', !err && c.types.map(t => t.split('|')[0]).join(',') === 'Bookmarks,Notes,Plant%e0' && c.types.some(t => t.endsWith('bad%E0.ttl')) && c.folders.join(',') === 'bookmarks,profile,settings', err + ' / ' + c.types.join(' ; ') + ' / ' + c.folders)
    check(width + ' px: Carol: the javascript: instance has no row (review #6)', !c.types.some(t => /javascript|Shed/.test(t)) && c.links, c.types.join(' ; '))
    await shot('carol-' + width)

    // Review #5: nothing readable at all: an empty state, not a blank page.
    await page.goto(address(DAVE))
    await showHome(page, DAVE)
    const d = await page.evaluate(() => { const n = document.querySelector('.hom-nothing'); return [document.querySelectorAll('.hom-widget').length, n ? n.textContent : 'none'].join(' ') })
    check(width + ' px: Dave: nothing readable, so an empty state that says to log in (review #5)', d === '0 Nothing to show here yetLog in to see more of this pod.', d)
    await shot('dave-' + width)

    if (width === 1300) {
      // Logged out on the test pod's root: the folder view, and the pane does not offer itself.
      await page.goto(address(POD))
      await page.waitFor(() => !!(window.panes && window.panes.byName('pod-home') && window.SolidLogic), { timeout: 40000 })
      await sleep(4000)
      const out = await page.evaluate((pod) => [!!document.querySelector('.hom.home-pane'), String(window.panes.byName('pod-home').label(SolidLogic.store.sym(pod), { session: { store: SolidLogic.store } }))].join(' '), POD)
      check('logged out: the root folder is left to the folder view; the pane does not claim it', out === 'false null', out)
      await shot('logged-out-root')
    }
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

// The pane inside the suite shell (shell/suite-shell-pane.js), logged in afresh (so it runs alone too).
// 1. The test user's own profile, opened the way a person does: the avatar menu, "Profile". READ ONLY there (the
//    real profile's hash is compared before and after). Its cards are in the shell's left column and jump to place.
// 2. Alice's copy in the shell: a field saved, said with the shell's toast, and on the pod.
// 3. No sideways scroll at 1300 px and a true 400 px (design/viewport.mjs), with the navigation drawer open too.
//   node tests/shell.mjs       (runs alone)
import { open, LAB, POD } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { PORT, ME, freshCopy, facts, has, sleep, realProfileHash } from './common.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const REAL = POD + 'profile/card.jsonld#me'
const PARTS = 'Profile picture*,About you,Email addresses,Phone numbers,Skills,Languages,Accounts elsewhere,People I know,Resume'
const realBefore = realProfileHash()
freshCopy()
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: PORT, dir: import.meta.dirname, login: true, resource: REAL })
const drawn = () => page.waitFor(() => !!document.querySelector('.sh-content .pfe.profile-edit-pane [data-part=basics] [name=name]'), { timeout: 40000 }).catch(() => false)

try {
  // 1. From the avatar menu.
  const menu = await page.waitFor(() => !!document.querySelector('.sh-account-btn') && !!document.querySelector('.sh-account [data-action="profile"]'), { timeout: 45000 }).catch(() => false)
  check('the shell\'s avatar menu offers Profile', !!menu)
  await page.evaluate(() => document.querySelector('.sh-account-btn').click())
  await sleep(300)
  await page.evaluate(() => document.querySelector('.sh-account [data-action="profile"]').click())
  check('the profile editor opens in the shell\'s content, on the person\'s own WebID', !!await drawn() && await page.evaluate((u) => document.querySelector('.sh-bar-title').textContent === u && document.querySelector('.sh-content .pfe').dataset.person === u, REAL))
  const nav = await page.waitFor(() => { const items = [...document.querySelectorAll('.sh-navcol .pfe-shell-nav .pfe-nav-item')]; return items.length ? items.map(b => b.textContent + (b.getAttribute('aria-current') === 'page' ? '*' : '')).join(',') : false }, { timeout: 10000 }).catch(() => '')
  check('its cards are in the shell\'s left column, in page order, the first marked', nav === PARTS, nav)
  check('the page order matches: the profile picture first', await page.evaluate(() => [...document.querySelectorAll('.sh-content .pfe-grid > [data-part]')].map(c => c.dataset.part).join(',')) === 'photo,basics,emails,phones,skills,languages,accounts,friends,resume')
  const look = await page.evaluate(() => { const b = document.querySelector('.sh-navcol .pfe-nav-item'); const cs = getComputedStyle(b); const a = document.querySelector('.sh-content [data-part=photo] .pfe-photo').getBoundingClientRect(); return { h: b.getBoundingClientRect().height, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, avatar: Math.round(a.width) } })
  check('the sheet\'s look: 44 px nav items, 8 px radius, current in pale blue; a large avatar at the top', look.h >= 44 && look.radius === '8px' && look.bg === 'rgb(227, 239, 246)' && look.avatar === 96, JSON.stringify(look))
  await shot('shell-own-1300')
  await page.evaluate(() => document.querySelector('.sh-navcol .pfe-nav-item[data-part="languages"]').click())
  await sleep(500)
  const jumped = await page.evaluate(() => {
    const main = document.querySelector('.sh-main')
    const top = document.querySelector('.sh-content [data-part=languages]').getBoundingClientRect().top - main.getBoundingClientRect().top
    return { top: Math.round(top), scrolled: main.scrollTop, bottom: main.scrollTop + main.clientHeight >= main.scrollHeight - 2, current: document.querySelector('.sh-navcol [aria-current="page"]').dataset.part }
  })
  check('Languages in the navigation scrolls to that card and marks it', jumped.current === 'languages' && jumped.scrolled > 0 && (jumped.top < 200 || jumped.bottom), JSON.stringify(jumped))
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)

  // 2. Alice's copy: a save, said with a toast.
  await page.goto(address(ME))
  await page.waitFor(() => !!document.querySelector('.sh-content > *:not(.sh-loading)'), { timeout: 45000 }).catch(() => false)
  await sleep(1500)
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .pfe.profile-edit-pane'))) {
    const picked = await page.waitFor(() => { const b = document.querySelector('.sh-views [data-pane="profile-edit-lab"]'); if (b) b.click(); return !!b }, { timeout: 30000 }).catch(() => false)
    check('on Alice\'s WebID the shell offers Edit profile among the views', !!picked)
  }
  check('Alice\'s profile opens in the shell', !!await drawn() && await page.evaluate((u) => document.querySelector('.sh-content .pfe').dataset.person === u, ME))
  await page.evaluate(() => { const i = document.querySelector('.sh-content .pfe [name=nick]'); i.value = 'ali'; document.querySelector('.sh-content .pfe [data-part=basics] form').requestSubmit() })
  const toast = await page.waitFor(() => { const t = [...document.querySelectorAll('.sh-toasts .sh-toast-success')].map(t => t.textContent).join(' | '); return /1 saved/.test(t) ? t : false }, { timeout: 30000 }).catch(() => '')
  const stored = await facts(page)
  check('a save in the shell is on the pod and said with one toast from the shell', toast === '1 saved' && has(stored, ME, 'http://xmlns.com/foaf/0.1/nick', 'ali'), toast)
  check('the field shows what was saved', await page.evaluate(() => document.querySelector('.sh-content .pfe [name=nick]').value === 'ali'))
  await shot('shell-alice-1300')

  // 3. A true 400 px.
  await narrow(page)
  await sleep(500)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => { const t = document.querySelector('.sh-nav-toggle'); if (t && !t.hidden && document.querySelector('.sh-navcol').hidden) t.click() })
  await sleep(400)
  const drawer = await page.evaluate(() => !document.querySelector('.sh-navcol').hidden && document.querySelectorAll('.sh-navcol .pfe-nav-item').length === 9)
  m = await measure(page)
  check('true 400 px: the cards in the shell\'s drawer, no sideways scroll', drawer && !m.sideways, JSON.stringify(m))
  await shot('shell-400-nav')
  await page.evaluate(() => document.querySelector('.sh-navcol .pfe-nav-item[data-part="skills"]').click())
  await sleep(500)
  check('true 400 px: picking a card closes the drawer and shows that card', await page.evaluate(() => document.querySelector('.sh-navcol').hidden && Math.abs(document.querySelector('.sh-content [data-part=skills]').getBoundingClientRect().top - document.querySelector('.sh-main').getBoundingClientRect().top) < 120))
  await shot('shell-400-skills')
  check('the real profile is unchanged', realProfileHash() === realBefore)
  await finish()
} catch (error) { await finish(error) }

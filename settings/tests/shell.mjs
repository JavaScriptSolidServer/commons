// The pane inside the suite shell (shell/suite-shell-pane.js), logged in afresh (so it runs alone too).
// 1. The test user's own settings, opened the way a person does: the avatar menu, "Settings". READ ONLY there
//    (the real profile and preferences file are compared on disk before and after). The sections are in the
//    shell's left column and jump to their part of the page.
// 2. Alice's settings in the shell: a switch saves to her preferences file and says so with the shell's toast.
// 3. No sideways scroll at 1300 px and a true 400 px (design/viewport.mjs), with the navigation drawer open too.
//   node tests/shell.mjs       (runs alone)
import { open, config, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PORT, REAL, ALICE, DATA_DIR, freshAlice } from './common.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
freshAlice()
const files = ['profile/card.jsonld', 'settings/prefs.jsonld'].map(f => path.join(config.podDir, f))
const before = files.map(f => readFileSync(f, 'utf8'))
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: PORT, dir: import.meta.dirname, login: true, resource: REAL })
const ready = () => page.waitFor(() => { const s = document.querySelector('.sh-content .set.settings-pane .set-say'); return !!document.querySelector('.sh-content .set-overview .set-item') && s && !/Checking/.test(s.textContent) }, { timeout: 40000 }).catch(() => false)

try {
  // 1. From the avatar menu.
  const menu = await page.waitFor(() => { const b = document.querySelector('.sh-account-btn'); if (!b) return false; if (!document.querySelector('.sh-account [data-action="settings"]')) return false; return true }, { timeout: 45000 }).catch(() => false)
  check('the shell\'s avatar menu offers Settings', !!menu)
  await page.evaluate(() => { document.querySelector('.sh-account-btn').click() })
  await sleep(300)
  await page.evaluate(() => document.querySelector('.sh-account [data-action="settings"]').click())
  check('Settings opens in the shell\'s content, on the person\'s own WebID', !!await ready() && await page.evaluate((u) => document.querySelector('.sh-content .set-title').textContent.startsWith('Settings') && document.querySelector('.sh-bar-title').textContent === u, REAL))
  check('the shell marks the Settings app', await page.evaluate(() => !!document.querySelector('[data-app="settings"]')))
  const nav = await page.waitFor(() => { const items = [...document.querySelectorAll('.sh-navcol .set-shell-nav .set-nav-item')]; return items.length ? items.map(b => b.textContent + (b.getAttribute('aria-current') === 'page' ? '*' : '')).join(',') : false }, { timeout: 10000 }).catch(() => '')
  check('its sections are in the shell\'s left column, the first marked', nav === 'Your pod*,Trusted apps,Preferences', nav)
  check('alone-only parts are not drawn inside the shell (no second navigation in the content)', await page.evaluate(() => !document.querySelector('.sh-content .set-nav-item')))
  const navLook = await page.evaluate(() => { const b = document.querySelector('.sh-navcol .set-nav-item'); const cs = getComputedStyle(b); return { h: b.getBoundingClientRect().height, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor } })
  check('the navigation items follow the sheet (44 px, 8 px radius, current in pale blue)', navLook.h >= 44 && navLook.radius === '8px' && navLook.bg === 'rgb(227, 239, 246)', JSON.stringify(navLook))
  await shot('shell-own-1300')
  await page.evaluate(() => document.querySelector('.sh-navcol .set-nav-item[data-section="prefs"]').click())
  await sleep(500)
  const jumped = await page.evaluate(() => {
    const target = document.querySelector('.sh-content .set-prefs').getBoundingClientRect()
    const box = document.querySelector('.sh-main').getBoundingClientRect()
    const main = document.querySelector('.sh-main')
    return { top: Math.round(target.top - box.top), bottom: main.scrollTop + main.clientHeight >= main.scrollHeight - 2, current: document.querySelector('.sh-navcol [aria-current="page"]').dataset.section, scrolled: document.querySelector('.sh-main').scrollTop }
  })
  check('Preferences in the navigation scrolls to that section and marks it', jumped.current === 'prefs' && jumped.scrolled > 0 && (jumped.top < 200 || jumped.bottom), JSON.stringify(jumped))
  check('1300 px in the shell: no sideways scroll', !(await measure(page)).sideways)
  check('the real profile and preferences files are unchanged', files.every((f, i) => readFileSync(f, 'utf8') === before[i]))

  // 2. Alice's settings in the shell: a write, said with the shell's toast.
  await page.goto(address(ALICE))
  await page.waitFor(() => !!document.querySelector('.sh-content > *:not(.sh-loading)'), { timeout: 45000 }).catch(() => false)
  await sleep(1500)
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .set.settings-pane'))) {
    const picked = await page.waitFor(() => { const b = document.querySelector('.sh-views [data-pane="settings-lab"]'); if (b) b.click(); return !!b }, { timeout: 30000 }).catch(() => false)
    check('on Alice\'s WebID the shell offers Settings among the views', !!picked)
  }
  check('Alice\'s settings open in the shell', !!await ready() && await page.evaluate(() => document.querySelector('.sh-content .set-title').textContent === 'Settings · Alice Example'))
  await page.evaluate(() => document.querySelector('.sh-content .set-switch-row[data-role=Developer] .set-switch input').click())
  const toast = await page.waitFor(() => { const t = document.querySelector('.sh-toasts .sh-toast-success'); return t ? t.textContent : false }, { timeout: 30000 }).catch(() => '')
  const prefs = readFileSync(path.join(DATA_DIR, 'alice', 'prefs.ttl'), 'utf8')
  check('a switch in the shell saves to her preferences file and says so with a toast', /Developer is on/.test(toast) && /Developer/.test(prefs), toast)
  check('and the switch shows it, not busy', await page.waitFor(() => { const i = document.querySelector('.sh-content .set-switch-row[data-role=Developer] .set-switch input'); return i && i.checked && !i.disabled }, { timeout: 10000 }).catch(() => false))
  await shot('shell-alice-1300')

  // 3. A true 400 px.
  await narrow(page)
  await sleep(500)
  let m = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m.sideways && !m.poking.length, JSON.stringify(m))
  await shot('shell-400')
  await page.evaluate(() => { const t = document.querySelector('.sh-nav-toggle'); if (t && !t.hidden && document.querySelector('.sh-navcol').hidden) t.click() })
  await sleep(400)
  const drawer = await page.evaluate(() => !document.querySelector('.sh-navcol').hidden && document.querySelectorAll('.sh-navcol .set-nav-item').length === 3)
  m = await measure(page)
  check('true 400 px: the sections in the shell\'s drawer, no sideways scroll', drawer && !m.sideways, JSON.stringify(m))
  await shot('shell-400-nav')
  await page.evaluate(() => document.querySelector('.sh-navcol .set-nav-item[data-section="trusted"]').click())
  await sleep(500)
  check('true 400 px: picking a section closes the drawer and shows that section', await page.evaluate(() => document.querySelector('.sh-navcol').hidden && document.querySelector('.sh-content .set-trusted').getBoundingClientRect().top < 300))
  await shot('shell-400-trusted')
  await finish()
} catch (error) { await finish(error) }

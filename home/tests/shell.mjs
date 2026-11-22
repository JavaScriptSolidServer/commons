// The Dashboard inside the suite shell (shell/suite-shell-pane.js lists it as the 'dashboard' app, start: root),
// reusing the login home.mjs left: the Dashboard button in the shell's header opens it on the pod's root, in the content column, content only (no
// navigation column, no details button), with its greeting and widget cards; a row opens its thing in the shell;
// no sideways scroll at 1300 px and a true 400 px.
//   node tests/shell.mjs       (after home.mjs)
import { open, LAB, POD } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9526, dir: import.meta.dirname, login: false, resource: POD })
const ready = () => page.waitFor(() => !!document.querySelector('.sh-content .hom.home-pane[data-ready]'), { timeout: 45000 }).catch(() => false)
try {
  await page.goto(address(POD))
  // At the root address the shell may show Files (both apps start at the root): open the Dashboard as a person would.
  await page.waitFor(() => !!document.querySelector('.sh-header-apps [data-app="dashboard"]') && !!document.querySelector('.sh-content > *'), { timeout: 45000 })
  const first = await page.evaluate(() => document.querySelector('.sh-header-apps [aria-current="page"]') ? document.querySelector('.sh-header-apps [aria-current="page"]').dataset.app : '')
  console.log('note: at the root address the shell first shows: ' + (first || 'nothing'))
  await page.evaluate(() => document.querySelector('.sh-header-apps [data-app="dashboard"]').click())
  check('in the shell, the Dashboard opens on the pod root, in the content column', !!await ready())
  const s = await page.evaluate(() => {
    const r = document.querySelector('.sh-content .hom.home-pane')
    const nav = document.querySelector('.sh-navcol')
    const info = document.querySelector('.sh-details-btn')
    const visible = (e) => !!e && !e.hidden && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'
    return {
      greeting: r.querySelector('.hom-greeting').textContent,
      cards: [...r.querySelectorAll('.hom-widget')].map(c => c.querySelector('h3').textContent).join(','),
      nav: visible(nav),
      info: visible(info),
      current: (document.querySelector('.sh-header-apps [aria-current="page"]') || { dataset: {} }).dataset.app || ''
    }
  })
  check('the greeting names the person', /^Good (morning|afternoon|evening|night), me$/.test(s.greeting), s.greeting)
  check('widget cards: your things (the registered demo data), folders, panes and apps, recently changed', s.cards === 'Your things,Folders,Your panes and apps,Recently changed', s.cards)
  check('content only: no navigation column, no details button; Dashboard is the current app', !s.nav && !s.info && s.current === 'dashboard', JSON.stringify(s))
  const m1 = await measure(page)
  check('1300 px in the shell: no sideways scroll', !m1.sideways, JSON.stringify(m1))
  await shot('shell-1300')

  await narrow(page)
  await page.waitFor(() => innerWidth === 400, { timeout: 5000 })
  const m2 = await measure(page)
  check('true 400 px in the shell: no sideways scroll', !m2.sideways && m2.innerWidth === 400, JSON.stringify(m2))
  await shot('shell-400')

  // A folder row opens the folder, and the shell stays.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .hom-folders a.hom-row')].find(a => a.textContent.startsWith('public')).click())
  const went = await page.waitFor(() => new URL(location.href).searchParams.get('uri') && new URL(location.href).searchParams.get('uri').endsWith('/public/') && !document.querySelector('.sh-content .hom.home-pane') && !!document.querySelector('.sh.suite-shell-pane .sh-content'), { timeout: 20000 }).catch(() => false)
  check('a folder row opens the folder inside the shell', !!went)
  await finish()
} catch (error) { await finish(error) }

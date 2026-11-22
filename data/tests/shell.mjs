// The data pane inside the suite shell (shell/suite-shell-pane.js), and alone, at 1300 px and a true 400 px
// (design/viewport.mjs: CDP device metrics, so innerWidth is really 400). Reuses the login data.mjs left, and
// waits for the shell to say it is logged in before its checks.
// The shell loads data-lab itself (SUITE_APPS, viewer: true); it is picked from the shell's "Other views" menu.
//   node tests/shell.mjs      (after data.mjs)
import { open, config, LAB, POD } from '../../lib/lib.mjs'
import { narrow, wide, measure } from '../../design/viewport.mjs'
import { view } from './helpers.mjs'

const SHELL = LAB + 'shell/suite-shell-pane.js'
const BASE = POD + 'public/suite-data/data/'
const DOC = BASE + 'people.ttl'
const inShell = (uri) => `${config.browser}?pane=${encodeURIComponent(SHELL)}&uri=${encodeURIComponent(uri)}`

const { page, check, finish, shot } = await open({ pane: LAB + 'data/data-pane.js', port: 9533, dir: import.meta.dirname, login: false, resource: DOC })
try {
  // Alone, at a true 400 px: Alice and the document.
  await page.waitFor(() => !!document.querySelector('#OutlineView .paneDiv'), { timeout: 30000 })
  await view(page, DOC + '#alice')
  await narrow(page)
  let m = await measure(page)
  check('alone, true 400 px, Alice: no sideways scroll', !m.sideways && m.innerWidth === 400, JSON.stringify(m))
  await page.evaluate(() => scrollTo(0, 0))
  await shot('alone-true400-alice')
  await view(page, DOC)
  m = await measure(page)
  check('alone, true 400 px, the document: no sideways scroll', !m.sideways, JSON.stringify(m))
  const look = await page.evaluate(() => {
    const row = document.querySelector('.data-pane .dat-thing')
    return { h: row.getBoundingClientRect().height, meta: getComputedStyle(row.querySelector('.dat-row-meta')).display, chips: getComputedStyle(document.querySelector('.dat-types')).display }
  })
  check('alone, true 400 px: things are list rows (56 px+), the count dropped; type chips in a row', look.h >= 56 && look.meta === 'none' && look.chips === 'flex', JSON.stringify(look))
  await page.evaluate(() => document.querySelector('.data-pane [data-part=things]').scrollIntoView())
  await shot('alone-true400-document')
  await wide(page)

  // In the shell, logged in (the session data.mjs left): wait until the shell knows who it is.
  await page.goto(inShell(DOC))
  const loggedIn = await page.waitFor(() => document.querySelector('.suite-shell-pane')?.dataset.loggedIn === 'yes', { timeout: 45000 }).catch(() => false)
  check('in the shell: logged in', !!loggedIn)
  await page.waitFor(() => !!document.querySelector('.sh-content > *'), { timeout: 45000 })
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .data-pane'))) {
    await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="data-lab"]'), { timeout: 20000 })
    await page.evaluate(() => { document.querySelector('.sh-views-btn').click(); document.querySelector('.sh-views [data-pane="data-lab"]').click() })
  }
  await page.waitFor(() => document.querySelector('.sh-content .data-pane')?.dataset.state === 'ready', { timeout: 30000 })
  let seen = await page.evaluate(() => ({
    title: document.querySelector('.sh-content .dat-title').textContent,
    things: document.querySelectorAll('.sh-content .dat-thing').length,
    nav: !!document.querySelector('.sh-navcol')?.children.length,
    detailsBtn: !document.querySelector('.sh-details-btn')?.hidden
  }))
  check('in the shell: the document with Data, in the content column', seen.title === 'The Example Walking Club' && seen.things === 16, JSON.stringify(seen))
  check('in the shell: content only (no navigation column, no details button)', !seen.nav && !seen.detailsBtn, JSON.stringify(seen))
  check('in the shell: the tokens are the shell\'s (same blue)', await page.evaluate(() => getComputedStyle(document.querySelector('.sh-content .dat-root')).getPropertyValue('--sui-primary-element').trim() === '#00679e'))
  m = await measure(page)
  check('in the shell, 1300 px: no sideways scroll', !m.sideways, JSON.stringify(m))
  await shot('shell-1300')
  // A thing's row opens it, in the shell.
  await page.evaluate(() => [...document.querySelectorAll('.sh-content .dat-thing')].find(r => /Alice Example/.test(r.textContent)).querySelector('.dat-row-meta').click())
  await page.waitFor(() => /people\.ttl#alice$/.test(document.querySelector('.sh-bar-title, .sh-title')?.textContent || new URLSearchParams(location.search).get('uri') || ''), { timeout: 20000 }).catch(() => {})
  seen = await page.evaluate(() => ({ uri: new URLSearchParams(location.search).get('uri'), shell: !!document.querySelector('.suite-shell-pane') }))
  check('in the shell: a row opens its thing and stays in the shell', /people\.ttl#alice$/.test(seen.uri || '') && seen.shell, JSON.stringify(seen))

  await page.goto(inShell(DOC))
  await page.waitFor(() => !!document.querySelector('.sh-content > *'), { timeout: 45000 })
  if (!await page.evaluate(() => !!document.querySelector('.sh-content .data-pane'))) {
    await page.waitFor(() => !!document.querySelector('.sh-views [data-pane="data-lab"]'), { timeout: 20000 })
    await page.evaluate(() => { document.querySelector('.sh-views-btn').click(); document.querySelector('.sh-views [data-pane="data-lab"]').click() })
  }
  await page.waitFor(() => document.querySelector('.sh-content .data-pane')?.dataset.state === 'ready', { timeout: 30000 })
  await narrow(page)
  m = await measure(page)
  check('in the shell, true 400 px: no sideways scroll', !m.sideways && m.innerWidth === 400, JSON.stringify(m))
  await shot('shell-true400')
} catch (error) { await finish(error) }
await finish()

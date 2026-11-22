// The notepad inside the suite shell, logged in as me (reusing the session pad.mjs left): the Pads app draws it,
// content plus a details column (participants), no navigation. Typing saves in the shell too. Then a true 400 px
// (CDP device metrics, design/viewport.mjs). Data: suite-data/pad/shell/index.ttl, a copy of the sample, rebuilt.
//   node tests/shell.mjs
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(config.podDir, 'public', 'suite-data', 'pad', 'shell')
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
writeFileSync(path.join(DIR, 'index.ttl'), readFileSync(path.join(import.meta.dirname, '..', 'samples', 'meeting-notes.ttl')))
const PAD = POD + 'public/suite-data/pad/shell/index.ttl#this'
const disk = () => readFileSync(path.join(DIR, 'index.ttl'), 'utf8')
const SHELL = LAB + 'shell/suite-shell-pane.js'
const { page, check, finish, shot, address } = await open({ pane: SHELL, port: 9521, dir: import.meta.dirname, login: false, resource: PAD })

const ready = () => page.waitFor((u) => { const r = document.querySelector('.sh.suite-shell-pane[data-ready]'); return !!r && r.querySelector('.sh-bar-title').textContent === u && document.querySelectorAll('.sh-content .npd-line textarea').length === 8 }, { timeout: 40000, args: [PAD] }).then(() => true, () => false)
const state = () => page.evaluate(() => {
  const r = document.querySelector('.sh.suite-shell-pane')
  const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().width > 0
  return {
    app: r.dataset.app,
    inside: !!r.querySelector('.sh-content .npd.pad-pane'),
    nav: vis(r.querySelector('.sh-navcol')), navToggle: vis(r.querySelector('.sh-nav-toggle')),
    detailsBtn: vis(r.querySelector('.sh-details-btn')), details: vis(r.querySelector('.sh-detcol')),
    detailsTitle: (r.querySelector('.sh-detcol .npd-details-title') || {}).textContent || '',
    participants: [...r.querySelectorAll('.sh-detcol .npd-plist .npd-row')].map(x => x.querySelector('.npd-row-title').textContent + ':' + x.querySelector('.npd-row-sub').textContent),
    props: [...r.querySelectorAll('.sh-detcol .npd-props dt')].map(x => x.textContent),
    legendShown: vis(r.querySelector('.npd-legend')),
    avatars: [...r.querySelectorAll('.npd-people .npd-avatar')].map(a => a.textContent + '@' + getComputedStyle(a).backgroundColor)
  }
})
const closeDetails = () => page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

try {
  check('the shell opens the pad in the Pads app', await ready())
  await sleep(800)
  let s = await state()
  check('the content is the notepad, in the Pads app', s.inside && s.app === 'pads', s.app)
  check('no navigation column (the pane has none)', !s.nav && !s.navToggle)
  check('the details button is offered (the pane has renderDetails)', s.detailsBtn)
  check('in the shell the legend is not repeated in the content', !s.legendShown)
  check('the toolbar shows who took part as avatars in their colours', s.avatars.length === 3 && /246, 214, 228/.test(s.avatars[0]), s.avatars.join(' '))
  let m = await measure(page)
  check('no sideways scroll at 1300 px in the shell', !m.sideways, m.poking.join(' '))
  await shot('shell-1300')

  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol .npd-plist'), { timeout: 10000 })
  await sleep(300)
  s = await state()
  check('(i) opens the details: the pad\'s title and its participants with their line counts', s.details && s.detailsTitle === 'Garden club, planning notes' && s.participants.join('|') === 'Alice:3 lines|Bob:2 lines|Carol:3 lines', s.detailsTitle + ' / ' + s.participants.join('|'))
  check('the details say who made it and when', s.props.join(',') === 'Made by,Made,File', s.props.join(','))
  await shot('shell-details-1300')
  await closeDetails()
  await page.waitFor(() => { const d = document.querySelector('.sh-detcol'); return !d || d.hidden || d.getBoundingClientRect().width === 0 }, { timeout: 5000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('.npd-people').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol .npd-plist'), { timeout: 10000 }).then(() => true, () => false)
  s = await state()
  check('the avatars open the same details', s.details && s.participants.length === 3)

  // Typing saves in the shell as it does alone.
  await page.evaluate(() => { const f = document.querySelectorAll('.npd-line textarea')[3]; f.focus() })
  await page.type('Tea after planting')
  await page.evaluate(() => document.activeElement.blur())
  await page.waitFor(() => !document.querySelector('.npd-pending') && /^(Saved|Not saved)/.test(document.querySelector('.npd-status').textContent), { timeout: 20000 })
  const said = await page.evaluate(() => document.querySelector('.npd-status').textContent)
  const end = Date.now() + 10000; while (Date.now() < end && !/Tea after planting/.test(disk())) await sleep(250)
  check('in the shell a line typed and left is saved, and the status line says Saved', said === 'Saved' && /Tea after planting/.test(disk()), said)
  check('"Saved" is a quiet status line: no box around it (the data browser styles every role=status)', await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.npd-status')); return st.backgroundColor === 'rgba(0, 0, 0, 0)' && st.paddingLeft === '0px' && st.borderTopWidth === '0px' }))
  await shot('shell-saved-1300')

  await narrow(page, 400)
  await page.goto(address(PAD))
  check('the shell opens the pad again at a true 400 px', await ready())
  await sleep(800)
  m = await measure(page)
  check('no sideways scroll at 400 px in the shell', m.innerWidth === 400 && !m.sideways, m.poking.join(' '))
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.npd-line textarea')].map(f => ({ h: f.getBoundingClientRect().height, fits: f.scrollWidth <= f.clientWidth, v: f.value })))
  check('every line is at least a 44 px target', boxes.every(x => x.h >= 44), boxes.map(x => Math.round(x.h)).join(','))
  const long = boxes.find(x => /water butt/.test(x.v))
  check('a long line wraps at 400 px: its box grows to show it all', !!long && long.h > 60 && long.fits, long && Math.round(long.h) + ' px')
  await shot('shell-400')
  await page.evaluate(() => document.querySelector('.sh-details-btn').click())
  await page.waitFor(() => !!document.querySelector('.sh-detcol .npd-plist'), { timeout: 10000 })
  await sleep(400)
  m = await measure(page)
  check('details at 400 px: shown, no sideways scroll', (await state()).details && !m.sideways, m.poking.join(' '))
  await shot('shell-details-400')
  check('no page errors', !page.console.some(l => /^exception:/.test(l) && /pad-pane|npd-/.test(l)), page.console.filter(l => /^exception/.test(l)).join(' | ').slice(0, 200))
  rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { await finish(error) }

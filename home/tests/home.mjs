// The home pane on the test pod, as its owner: the root folder opens on it; what it shows is the
// pod's own folders, tool index and recent changes; its links open in the data browser; a reload
// reads back the same; nothing on the pod changes.
//   node tests/home.mjs        logs in, runs everything at 1300 px
//   node tests/home.mjs 400    reuses that login; the layout at a true 400 px (design/viewport.mjs)
import { open, config, LAB, POD, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
const width = +(process.argv[2] || 1300)
const PANE = LAB + 'home/home-pane.js'
const ME = POD + 'profile/card.jsonld#me'
const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9525, dir: import.meta.dirname, width, login: width === 1300, resource: POD })

// Everything the pane reads on the pod, hashed, to show it writes nothing.
const watched = () => {
  const files = ['profile/card.jsonld', ...readdirSync(path.join(config.podDir, 'settings')).map(f => 'settings/' + f)]
  return files.map(f => f + ':' + createHash('sha1').update(readFileSync(path.join(config.podDir, f))).digest('hex')).join('\n')
}
const before = watched()
const ready = () => page.waitFor(() => !!document.querySelector('.hom.home-pane[data-ready]'), { timeout: 40000 }).catch(() => false)
const seen = () => page.evaluate(() => {
  const r = document.querySelector('.hom.home-pane')
  const texts = (sel) => [...r.querySelectorAll(sel)].map(n => n.textContent)
  return {
    eyebrow: r.querySelector('.hom-eyebrow').textContent,
    name: r.querySelector('.hom-name').textContent,
    webid: r.querySelector('.hom-webid') && r.querySelector('.hom-webid').textContent,
    folders: texts('.hom-folders .hom-row-title'),
    types: texts('.hom-types .hom-row-title'),
    tools: texts('.hom-toolgrid .hom-row').map(t => t),
    manage: r.querySelector('.hom-manage') && r.querySelector('.hom-manage').getAttribute('href'),
    recent: [...r.querySelectorAll('.hom-recent time')].map(t => t.getAttribute('datetime')),
    hidden: [...r.querySelectorAll('.hom-section')].map(s => s.className.split(' ')[1] + '=' + s.hidden).join(' '),
    wide: document.documentElement.scrollWidth > innerWidth
  }
})
try {
  if (width === 400) await narrow(page)
  await page.goto(address(POD))
  check('the root folder opens on the home pane for its owner', !!await ready())
  await sleep(1000)
  let s = await seen()
  check('the greeting names the person and their WebID', /^Good (morning|afternoon|evening|night)$/i.test(s.eyebrow) && s.name === 'me' && s.webid === ME, `${s.eyebrow} | ${s.name} | ${s.webid}`)
  check('the top-level folders are tiles', ['inbox', 'private', 'profile', 'public', 'settings'].every(f => s.folders.includes(f)), s.folders.join(', '))
  check('the test pod has no type registrations, so no kinds are shown', s.types.length === 0, s.types.join(', '))
  if (width === 1300) {
    check('the tool index: the panes that are on and the app, not the PodOS HTML tool', s.tools.length === 3 && /Meetings calendar/.test(s.tools[0]) && /Notes reader/.test(s.tools[1]) && /Umai viewer.*App/.test(s.tools[2]) && !s.tools.some(t => /Recipe pane/.test(t)), s.tools.join(' ; '))
    check('one link to manage them: the tool index, in the data browser', !!s.manage && new URL(s.manage).searchParams.get('uri') === POD + 'settings/tool-index.ttl', s.manage)
    check('recently changed: up to six, newest first', s.recent.length > 0 && s.recent.length <= 6 && s.recent.every((d, i) => i === 0 || d <= s.recent[i - 1]), s.recent.join(' '))
    // A second person's view cannot be tested (one test user); a non-root folder is left alone.
    const labels = await page.evaluate((v) => { const [pod, me] = JSON.parse(v); const st = SolidLogic.store; const p = window.panes.byName('pod-home'); const ctx = { session: { store: st } }; return [p.label(st.sym(pod), ctx), p.label(st.sym(pod + 'public/'), ctx), p.shouldGetFocus(st.sym(pod + 'public/')), p.label(st.sym(me), ctx), p.shouldGetFocus(st.sym(me))].map(String).join(' ') }, JSON.stringify([POD, ME]))
    check('it claims the root and the own WebID, and not another folder', labels === 'Home null false Home true', labels)
    // Review #2: on a path-based server the server's root is not this person's pod (their pim:storage is /me/).
    const server = await page.evaluate((u) => { const st = SolidLogic.store; const p = window.panes.byName('pod-home'); return [p.label(st.sym(u), { session: { store: st } }), p.shouldGetFocus(st.sym(u))].map(String).join(' ') }, new URL(POD).origin + '/')
    check('the server root is not claimed as my pod (review #2)', server === 'null false', server)
    // Review #4: a failure is said as an error (role=alert, error colour); the status line has no box of the browser's.
    const failed = await page.evaluate((me) => new Promise((resolve) => {
      const st = SolidLogic.store
      const broken = Object.create(st)
      broken.each = () => { throw new Error('test failure') }
      const node = window.panes.byName('pod-home').render(st.sym(me), { dom: document, session: { store: broken } })
      document.body.appendChild(node)
      const t0 = Date.now()
      const wait = () => {
        if (!node.dataset.ready && Date.now() - t0 < 15000) return setTimeout(wait, 100)
        const s = node.querySelector('.hom-status')
        const out = [s.getAttribute('role'), s.classList.contains('hom-status-error'), /^Could not read the pod: test failure$/.test(s.textContent), getComputedStyle(s).backgroundColor].join(' ')
        node.remove()
        resolve(out)
      }
      wait()
    }), ME)
    check('a failure shows as an error: role=alert, error style, no green box (review #4)', failed === 'alert true true rgba(0, 0, 0, 0)', failed)
    // A folder tile opens that folder in the data browser, in place.
    await page.evaluate(() => [...document.querySelectorAll('.hom-folders a.hom-row')].find(a => a.textContent.startsWith('public')).click())
    await page.waitFor(() => new URL(location.href).searchParams.get('uri') && new URL(location.href).searchParams.get('uri').endsWith('/public/') && !document.querySelector('.hom.home-pane'), { timeout: 20000 }).catch(() => {})
    const now = await page.evaluate(() => [new URL(location.href).searchParams.get('uri'), !!document.querySelector('.hom.home-pane')].join(' '))
    check('a folder tile opens the folder in the data browser, which shows its usual view', now === POD + 'public/ false', now)
    await page.goto(address(ME))
    check('the own WebID opens on the home pane too', !!await ready())
    await page.goto(address(POD))
    await ready(); await sleep(1000)
    const again = await seen()
    check('after a reload it reads back the same', again.folders.join() === s.folders.join() && again.tools.join() === s.tools.join() && again.name === s.name, again.folders.join())
    s = again
  }
  const m = await measure(page)
  check('no sideways scroll at ' + (width === 400 ? 'a true ' : '') + width + ' px', !s.wide && !m.sideways && m.innerWidth === width, JSON.stringify(m))
  await shot('home-' + width)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await shot('home-' + width + '-end')
  check('read-only: the profile and every settings file are unchanged', watched() === before)
  await finish()
} catch (error) { await finish(error) }

// The pane mounted by a host in a 360 px box, as the Files app's details sidebar does it: import() the module and
// call render(subject, context) with the host's own context, with and without context.suite. Reuses the login
// sharing.mjs left. One save (everyone can view, then back) inside suite-data/sharing/ only; reset after.
//   node tests/narrow.mjs
import './free-ports.mjs'
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { reset, disk, BASE, DIR } from './setup.mjs'

const PANE = LAB + 'sharing/sharing-pane.js'
const TEAM = BASE + 'team/'
const NOTE = BASE + 'note.ttl'
reset()
const { page, check, finish, shot } = await open({ pane: PANE, port: 9527, dir: import.meta.dirname, login: false, resource: TEAM })

// Mount the pane in a fixed 360 px column on the right (like a details sidebar), replacing any earlier mount.
// The box listens for 'suite-sharing-change' (README "For hosts") and records each event's detail in window.__events.
//   how: 'plain' = { dom, session }; 'suite' = the same plus a stand-in context.suite (slot: 'details') that records toasts;
//        'bare' = {} (no dom, no session: the pane must find document and SolidLogic.store itself)
const mount = (uri, how) => page.evaluate(async (v) => {
  const [paneUrl, uri, how] = JSON.parse(v)
  const { default: pane } = await import(paneUrl)
  document.getElementById('shr-host')?.remove()
  const box = document.createElement('aside')
  box.id = 'shr-host'
  box.style.cssText = 'position: fixed; top: 0; right: 0; bottom: 0; width: 360px; overflow: auto; z-index: 1000; background: #fff; border-left: 1px solid #e1e5ea'
  document.body.appendChild(box)
  window.__toasts = []
  window.__events = []
  box.addEventListener('suite-sharing-change', (e) => window.__events.push(JSON.stringify(e.detail)))
  const context = how === 'bare' ? {} : { dom: document, session: { store: window.SolidLogic.store, logic: window.SolidLogic } }
  if (how === 'suite') context.suite = { version: 1, state: {}, toast: (text, o) => window.__toasts.push((o && o.kind || 'info') + ': ' + text), go () {}, showDetails () { return null }, closeDetails () {}, refreshNavigation () {}, slot: 'details' }
  box.appendChild(pane.render(window.$rdf.sym(uri), context))
  return true
}, JSON.stringify([PANE, uri, how]))
const ready = () => page.waitFor(() => { const r = document.querySelector('#shr-host .shr'); return !!r && r.dataset.state && !['busy', 'loading'].includes(r.dataset.state) }, { timeout: 70000 })
// Everything inside the box stays inside it: nothing wider, no sideways scroll in the box.
const fits = () => page.evaluate(() => {
  const box = document.getElementById('shr-host')
  const b = box.getBoundingClientRect()
  const root = box.querySelector('.shr')
  const out = [...root.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && !e.closest('[hidden]') && (r.right > b.right + 1 || r.left < b.left - 1) }).slice(0, 5).map(e => e.tagName + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '') + (e.parentNode.className ? '<' + e.parentNode.className : '') + '@' + Math.round(e.getBoundingClientRect().right))
  return { width: Math.round(root.getBoundingClientRect().width), sideways: box.scrollWidth > box.clientWidth, out }
})
const inBox = (fn, arg) => page.evaluate(fn, arg)

try {
  await page.waitFor(() => !!(window.SolidLogic && window.$rdf && window.SolidLogic.authn && window.SolidLogic.authn.currentUser()), { timeout: 40000 })

  // 1. Without context.suite: a folder with its own rules.
  await mount(TEAM, 'plain')
  await ready()
  await sleep(800) // names from profiles, in the background
  let f = await fits()
  check('alone (no slot): the pane has its own Sharing heading', await inBox(() => !!document.querySelector('#shr-host .shr-top .shr-heading')))
  check('360 px box, no context.suite: the pane draws the folder\'s rules', await inBox(() => document.querySelector('#shr-host .shr').dataset.state === 'own' && document.querySelectorAll('#shr-host .shr-people > .shr-row').length === 4))
  check('360 px box: the pane takes the box\'s width, nothing pokes out, no sideways scroll', f.width >= 340 && f.width <= 360 && !f.sideways && !f.out.length, f.width + ' px ' + f.out.join(' '))
  const layout = await inBox(() => {
    const row = [...document.querySelectorAll('#shr-host .shr-people > .shr-row')].find(r => /bob/.test(r.dataset.key))
    const name = row.querySelector('.shr-name').getBoundingClientRect()
    const select = row.querySelector('select').getBoundingClientRect()
    const more = row.querySelector('.shr-more').getBoundingClientRect()
    const input = document.querySelector('#shr-host .shr-add input').getBoundingClientRect()
    const add = document.querySelector('#shr-host .shr-add button').getBoundingClientRect()
    return { under: select.top >= name.bottom - 1 && select.left >= name.left - 1, more: more.right <= row.getBoundingClientRect().right + 1 && more.height >= 44, inputWide: input.width > 280, addBelow: add.top >= input.bottom - 1, nameWidth: Math.round(name.width) }
  })
  check('narrow: the permission dropdown sits under the name, the ⋯ button stays on the row (44 px)', layout.under && layout.more, JSON.stringify(layout))
  check('narrow: "add a person" box takes the full width, level and Add under it', layout.inputWide && layout.addBelow, JSON.stringify(layout))
  await shot('narrow-360-folder')

  // The ⋯ menu: opens inside the box, has Remove access, Escape closes it.
  await inBox(() => [...document.querySelectorAll('#shr-host .shr-people > .shr-row')].find(r => /bob/.test(r.dataset.key)).querySelector('.shr-more').click())
  const menu = await inBox(() => {
    const pop = document.querySelector('#shr-host .shr-row-menu:not([hidden])')
    if (!pop) return null
    const b = document.getElementById('shr-host').getBoundingClientRect(); const r = pop.getBoundingClientRect()
    return { items: [...pop.querySelectorAll('.shr-menu-item')].map(i => i.textContent.trim()), inside: r.left >= b.left - 1 && r.right <= b.right + 1, expanded: pop.parentNode.querySelector('.shr-more').getAttribute('aria-expanded') }
  })
  check('narrow: the ⋯ menu opens inside the box with Open profile and Remove access', !!menu && menu.items.join() === 'Open profile,Remove access' && menu.inside && menu.expanded === 'true', JSON.stringify(menu))
  await shot('narrow-360-menu')
  await page.evaluate(() => document.querySelector('#shr-host .shr-row-menu:not([hidden]) .shr-menu-item').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  check('narrow: Escape closes the menu', await inBox(() => !document.querySelector('#shr-host .shr-row-menu:not([hidden])')))
  await inBox(() => [...document.querySelectorAll('#shr-host .shr-people > .shr-row')].find(r => /bob/.test(r.dataset.key)).querySelector('.shr-more').click())
  await inBox(() => document.body.click())
  check('narrow: a click elsewhere closes it too', await inBox(() => !document.querySelector('#shr-host .shr-row-menu:not([hidden])')))

  // 2. With context.suite: a save says so with the host's toast as well as in place.
  await mount(TEAM, 'suite')
  await ready()
  check('slot "details": no heading of its own, no outer padding', await inBox(() => { const r = document.querySelector('#shr-host .shr'); return !r.querySelector('.shr-top') && r.classList.contains('shr-embedded') && getComputedStyle(r).paddingLeft === '0px' }))
  const events = () => inBox(() => window.__events.slice())
  const pickPublic = (level) => inBox((l) => { const s = document.querySelector('#shr-host .shr-row[data-key^="public"] select'); s.value = l; s.dispatchEvent(new Event('change')) }, level)
  const button = (text) => inBox((t) => [...document.querySelectorAll('#shr-host .shr button')].find(b => b.textContent.trim() === t).click(), text)
  // Cancel: nothing written, no event.
  await pickPublic('view'); await button('Review and save'); await button('Cancel'); await button('Undo changes')
  await sleep(300)
  check('host event: none on cancel', (await events()).length === 0, (await events()).join(' | '))
  // A failed save (someone changed the rules meanwhile: 412): no event.
  await pickPublic('view'); await button('Review and save')
  writeFileSync(path.join(DIR, 'team', '.acl'), disk('team/.acl') + '\n')
  await inBox(() => document.querySelector('#shr-host .shr-confirm').click())
  await sleep(300)
  await ready()
  check('host event: none when the save fails (412, nothing written)', (await events()).length === 0 && /shr-bad/.test(await inBox(() => document.querySelector('#shr-host .shr-status').className)) && !/foaf\/0\.1\/Agent/.test(disk('team/.acl')), (await events()).join(' | '))
  check('the failed save said so with an error toast', /^error: Not saved/.test(await inBox(() => window.__toasts.join(' | '))))
  await inBox(() => { window.__toasts = [] })
  await inBox(() => { const s = document.querySelector('#shr-host .shr-row[data-key^="public"] select'); s.value = 'view'; s.dispatchEvent(new Event('change')) })
  await inBox(() => [...document.querySelectorAll('#shr-host .shr button')].find(b => b.textContent.trim() === 'Review and save').click())
  f = await fits()
  check('narrow, with context.suite: the review fits the box', /Everyone can now view, in this folder and everything inside/.test(await inBox(() => document.querySelector('#shr-host .shr-review').textContent)) && !f.sideways && !f.out.length, f.out.join(' '))
  await inBox(() => document.querySelector('#shr-host .shr-review').scrollIntoView({ block: 'end' }))
  await shot('narrow-360-review')
  await inBox(() => document.querySelector('#shr-host .shr-confirm').click())
  await sleep(300)
  await ready()
  const toasts = await page.waitFor(() => window.__toasts.length > 0, { timeout: 10000 }).then(() => inBox(() => window.__toasts.join(' | '))).catch(() => '')
  check('with context.suite: saved, and the host\'s toast says so', /^success: Saved/.test(toasts) && /shr-good/.test(await inBox(() => document.querySelector('#shr-host .shr-status').className)), toasts)
  check('with context.suite: the pod file now gives everyone Read', /xmlns\.com\/foaf\/0\.1\/Agent/.test(disk('team/.acl') || ''))
  const saved = await events()
  check('host event: one suite-sharing-change after the save, with the folder and its rules file', saved.length === 1 && saved[0] === JSON.stringify({ uri: TEAM, acl: TEAM + '.acl' }), saved.join(' | '))
  reset()

  // 3. A bare context ({}): the pane finds document and the store itself; an inherited file shows chips.
  await mount(NOTE, 'bare')
  await ready()
  f = await fits()
  const bare = await inBox(() => { const r = document.querySelector('#shr-host .shr'); return { state: r.dataset.state, chips: [...r.querySelectorAll('.shr-level .shr-chip')].map(c => c.textContent), own: !!r.querySelector('.shr-own button') } })
  check('bare context in 360 px: an inherited file, its owner as a chip, the button to give it its own rules; fits', bare.state === 'inherited' && bare.chips.join() === 'Owner' && bare.own && !f.sideways && !f.out.length, JSON.stringify(bare) + ' ' + f.out.join(' '))
  await shot('narrow-360-inherited')
  await inBox(() => document.querySelector('#shr-host .shr-own button').click())
  await inBox(() => document.querySelector('#shr-host .shr-confirm').click())
  await sleep(300)
  await ready()
  let ev = await inBox(() => window.__events.slice())
  check('host event: "give it its own rules" sends one, with the new rules file', ev.length === 1 && ev[0] === JSON.stringify({ uri: NOTE, acl: NOTE + '.acl' }) && disk('note.ttl.acl') !== null, ev.join(' | '))
  await inBox(() => [...document.querySelectorAll('#shr-host .shr button')].find(b => b.textContent.trim() === 'Go back to inherited rules').click())
  await page.waitFor(() => !!document.querySelector('#shr-host .shr-confirm'), { timeout: 15000 })
  await inBox(() => document.querySelector('#shr-host .shr-confirm').click())
  await sleep(300)
  await ready()
  ev = await inBox(() => window.__events.slice())
  check('host event: "go back to inherited rules" sends one, with acl null (deleted)', ev.length === 2 && ev[1] === JSON.stringify({ uri: NOTE, acl: null }) && disk('note.ttl.acl') === null, ev.join(' | '))
  reset()
  await finish()
} catch (error) { reset(); await finish(error) }

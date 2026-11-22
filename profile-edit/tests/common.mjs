// Shared by the tests: the test copy of Alice's profile on the pod, and ways to show it with a pane.
import { LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { mkdirSync, copyFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const PANE = LAB + 'profile-edit/profile-edit-pane.js'
// The view pane's source, read here: tests/ is owner-only on the pod (tests/.acl), and a page's import() sends no
// login, so the page gets the code as text and imports it from a blob: address.
export const VIEW_PANE = readFileSync(path.join(import.meta.dirname, 'view/profile-pane.js'), 'utf8')
export const PORT = 9530
export const FOLDER = path.join(config.podDir, 'public/suite-data/profile-edit/alice/profile')
export const ME = POD + 'public/suite-data/profile-edit/alice/profile/card.jsonld#me'
export const DOC = ME.split('#')[0]
export const CAROL_FOLDER = path.join(config.podDir, 'public/suite-data/profile-edit/carol/profile')
export const CAROL = POD + 'public/suite-data/profile-edit/carol/profile/card.ttl#me'
const SAMPLE = path.join(import.meta.dirname, '../samples/alice/profile/card.jsonld')
const CAROL_SAMPLE = path.join(import.meta.dirname, '../samples/carol/profile/card.ttl')
const REAL = path.join(config.podDir, 'profile/card.jsonld')

// A fresh copy of the sample: the only profile these tests ever change.
export function freshCopy () {
  rmSync(FOLDER, { recursive: true, force: true })
  mkdirSync(FOLDER, { recursive: true })
  copyFileSync(SAMPLE, path.join(FOLDER, 'card.jsonld'))
  rmSync(CAROL_FOLDER, { recursive: true, force: true })
  mkdirSync(CAROL_FOLDER, { recursive: true })
  copyFileSync(CAROL_SAMPLE, path.join(CAROL_FOLDER, 'card.ttl'))
}
export const disk = () => readFileSync(path.join(FOLDER, 'card.jsonld'), 'utf8')
export const files = () => readdirSync(FOLDER)
export const realProfileHash = () => createHash('sha256').update(readFileSync(REAL)).digest('hex')

// The profile as stored on the pod, as data: one line per statement, "subject predicate object" with full
// IRIs (read fresh from the server and parsed with the page's rdflib, not from the page's store).
export async function facts (page, doc = DOC) {
  return page.evaluate(async (doc) => {
    const response = await fetch(doc, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
    const g = window.$rdf.graph()
    window.$rdf.parse(await response.text(), g, doc, 'text/turtle')
    const term = (t) => t.termType === 'BlankNode' ? '_:b' : t.termType === 'Collection' ? '( ' + t.elements.map(term).join(' ') + ' )' : t.value
    return g.statements.map(s => term(s.subject) + ' ' + term(s.predicate) + ' ' + term(s.object)).join('\n')
  }, doc)
}
export const has = (text, s, p, o) => text.split('\n').some(line => line === [s, p, o].join(' '))

// Picks "Edit profile" in the "More options" menu of the open resource, as a person would.
export async function menuEdit (page) {
  const deep = `const deep = (pick) => { const out = []; const walk = (n) => { for (const e of n.querySelectorAll('*')) { if (pick(e)) out.push(e); if (e.shadowRoot) walk(e.shadowRoot) } }; walk(document.body); return out }`
  const opened = await page.evaluate(`(() => { ${deep}; const b = deep(e => e.tagName === 'SOLID-UI-BUTTON' && /More options/.test(e.textContent + e.title))[0]; if (!b) return false; (b.shadowRoot && b.shadowRoot.querySelector('button') || b).click(); return true })()`)
  if (!opened) return false
  await sleep(700)
  return page.evaluate(`(() => { ${deep}; const items = deep(e => e.tagName === 'SOLID-UI-MENU-ITEM' && e.textContent.trim() === 'Edit profile'); if (items.length !== 1) return false; const inner = items[0].shadowRoot && items[0].shadowRoot.querySelector('[role=menuitem], button, a, div'); (inner || items[0]).click(); return true })()`)
}

// Shows the person with a pane by name, as choosing it in the menu does, and waits until it is drawn.
export async function show (page, paneName, rootSelector, uri = ME) {
  await page.evaluate((args) => {
    const [u, name, sel] = JSON.parse(args)
    for (const old of document.querySelectorAll(sel)) old.classList.add('was-here')
    window.panes.getOutliner(document).GotoSubject(window.$rdf.sym(u), true, window.panes.byName(name), true)
  }, JSON.stringify([uri, paneName, rootSelector]))
  await page.waitFor((sel, u) => { const r = document.querySelector(sel + ':not(.was-here)'); return !!r && (!r.dataset.person || r.dataset.person === u) }, { timeout: 30000, args: [rootSelector, uri] })
  await sleep(800)
  const roots = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map(r => (r.dataset.person || '') + (r.classList.contains('was-here') ? ' (old)' : '')), rootSelector)
  if (roots.length > 1) console.log('     roots: ' + roots.join(' | '))
  await page.evaluate((sel) => { for (const old of document.querySelectorAll(sel)) if (old.classList.contains('was-here')) old.remove() }, rootSelector)
}

export { sleep }

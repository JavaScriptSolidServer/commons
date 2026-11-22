// Puts the samples on the test pod, straight onto its disk, at suite-data/notes/. Run first by run.mjs.
// Writes only inside the pod's suite-data/notes/ folder:
//   journal/              the samples (samples/journal/), readable by anyone
//   journal/private.md    one more note only the test user may read (its own .acl)
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, POD, LAB } from '../../lib/lib.mjs'

export const DEST = path.join(config.podDir, 'public', 'suite-data', 'notes')
export const BASE = POD + 'public/suite-data/notes/journal/'
export const PANE = LAB + 'notes/notes-pane.js'
export const SHELL = LAB + 'shell/suite-shell-pane.js'
export const PORT = 9519
export const PORT2 = 9520
export const SAMPLES = path.join(import.meta.dirname, '..', 'samples', 'journal')
const ME = POD + 'profile/card.jsonld#me'

// The notes in the folder, in the order the pane lists them (file names, sorted).
export const NOTES = ['2026-11-18-first-entry.md', '2026-11-20-seed-swap.md', 'hostile.md', 'hostile2.md', 'linking.md', 'private.md', 'shopping-list.md', 'welcome.md']

export function setup () {
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })
  cpSync(SAMPLES, path.join(DEST, 'journal'), { recursive: true })
  writeFileSync(path.join(DEST, 'journal', 'private.md'), '# Private\n\nOnly Alice may read this.\n')
  // JSS wants access rules as JSON-LD: the owner only.
  writeFileSync(path.join(DEST, 'journal', 'private.md.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
    '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME }, 'acl:accessTo': { '@id': BASE + 'private.md' }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) }]
  }, null, 2))
}

if (process.argv[1] === import.meta.filename) {
  setup()
  let ok = true
  for (const [u, want] of [[BASE, 200], [BASE + 'welcome.md', 200], [BASE + '2026-11-20-seed-swap.md', 200], [BASE + 'private.md', 401]]) {
    const got = (await fetch(u)).status
    if (got !== want) ok = false
    console.log(`${got === want ? 'PASS' : 'FAIL'} ${u.slice(BASE.length) || 'journal/'} is ${got} without login`)
  }
  process.exit(ok ? 0 : 1)
}

// In the page: the pane has drawn its note (or said why not) and the folder's notes are counted.
export const SETTLED = (count) => {
  const root = document.querySelector('.note.notes-reader-pane')
  if (!root) return false
  const body = root.querySelector('.note-body')
  if (!body || /^Loading/.test(body.textContent)) return false
  const all = root.querySelector('.note-pager .note-all')
  return !count || (!!all && all.textContent === 'All notes (' + count + ')')
}

// In the page: what the pane shows.
export const SEEN = () => {
  const root = document.querySelector('.note.notes-reader-pane')
  if (!root) return null
  const body = root.querySelector('.note-body')
  const pager = (cls) => { const a = root.querySelector('.note-pager .' + cls); return a ? { text: a.textContent, href: a.getAttribute('href'), off: a.classList.contains('note-off'), shown: getComputedStyle(a).visibility !== 'hidden' } : null }
  return {
    date: (body.querySelector('.note-date') || {}).textContent || '',
    title: (body.querySelector('h1') || {}).textContent || '',
    h1s: body.querySelectorAll('h1').length,
    h2: [...body.querySelectorAll('h2')].map(h => h.textContent),
    msg: (body.querySelector('.note-msg') || {}).textContent || '',
    text: body.textContent,
    wikis: [...body.querySelectorAll('a.note-wiki')].map(a => a.textContent + '|' + (a.getAttribute('href') || '') + '|' + (a.classList.contains('missing') ? 'missing' : '')),
    links: [...body.querySelectorAll('a:not(.note-wiki)')].map(a => a.textContent + '|' + a.getAttribute('href') + '|' + (a.getAttribute('rel') || '')),
    table: [...body.querySelectorAll('tr')].map(r => [...r.children].map(c => c.textContent).join(' / ')),
    tasks: [...body.querySelectorAll('li.note-task')].map(li => (li.querySelector('input').checked ? 'x' : ' ') + (li.querySelector('input').disabled ? 'd' : '') + '|' + li.firstChild.nextSibling.textContent.trim() + '|' + li.className),
    nested: body.querySelectorAll('li ul, li ol').length,
    pre: (body.querySelector('pre') || {}).textContent || '',
    quote: (body.querySelector('blockquote') || {}).textContent || '',
    prev: pager('note-prev'), all: pager('note-all'), next: pager('note-next'),
    ownNav: !!root.querySelector('.note-nav-list'),
    scripts: root.querySelectorAll('script, img, iframe, [onclick], [onerror]').length,
    pwned: window.__pwned || null
  }
}

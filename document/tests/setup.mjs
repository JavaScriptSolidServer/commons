// Puts the test files on the pod, straight onto its disk: the samples, plus files made here
// (a file too large to show, a CSV too long to show whole, a private file). Run by the tests.
import { config, POD } from '../../lib/lib.mjs'
import { mkdirSync, copyFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

export const DATA = POD + 'public/suite-data/document/'
export const DIR = path.join(config.podDir, 'public', 'suite-data', 'document')
export const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
export const PANE = config.lab + 'document/document-pane.js'
export const PORT = 9535
export const WEBID = POD + 'profile/card.jsonld#me'
export const PRIVATE_TEXT = 'Only Alice may read this.\n'

export function setup () {
  mkdirSync(DIR, { recursive: true })
  for (const f of readdirSync(SAMPLES)) copyFileSync(path.join(SAMPLES, f), path.join(DIR, f))
  const big = path.join(DIR, 'big.txt')
  if (!existsSync(big) || statSync(big).size < 6e6) writeFileSync(big, ('Bob was here. '.repeat(7) + '\n').repeat(6e6 / 99 | 0))
  const rows = ['n,name,score']
  for (let i = 1; i <= 1200; i++) rows.push(`${i},${['Alice', 'Bob', 'Carol'][i % 3]},${(i * 37) % 100}`)
  writeFileSync(path.join(DIR, 'long.csv'), rows.join('\n') + '\n')
  // Wide CSVs that once froze the tab: two lines of 400,000 commas, and 2,000 rows of 500 columns.
  writeFileSync(path.join(DIR, 'wide.csv'), (','.repeat(400000) + '\n').repeat(2))
  const grid = Array.from({ length: 500 }, (_, i) => 'c' + i).join(',') + '\n' + (Array(500).fill('x').join(',') + '\n').repeat(2000)
  writeFileSync(path.join(DIR, 'grid.csv'), grid)
  writeFileSync(path.join(DIR, 'private.txt'), PRIVATE_TEXT)
  const address = DATA + 'private.txt'
  writeFileSync(path.join(DIR, 'private.txt.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
    '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': WEBID }, 'acl:accessTo': { '@id': address }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) }]
  }, null, 2))
}

// In the page: wait until the pane has finished loading its file; returns what it shows.
export const SETTLED = () => {
  const root = document.querySelector('.doc.document-lab-pane')
  const state = root && root.querySelector('.doc-state')
  if (!state || state.textContent === 'Loading…') return false
  return true
}

export const SEEN = () => {
  const root = document.querySelector('.doc.document-lab-pane')
  if (!root) return null
  const q = (s) => root.querySelector(s)
  const frame = q('iframe')
  const pre = q('pre')
  const object = q('object')
  return {
    name: q('.doc-name').textContent,
    meta: q('.doc-meta').textContent,
    state: q('.doc-state').textContent,
    bad: q('.doc-state').classList.contains('doc-bad'),
    note: [...root.querySelectorAll('.doc-note')].filter(n => !n.hidden).map(n => n.textContent).join(' / '),
    links: [...root.querySelectorAll('.doc-links a')].map(a => a.textContent + '|' + a.getAttribute('href') + '|' + a.rel + '|' + (a.getAttribute('download') || '')),
    frame: frame ? { sandbox: frame.getAttribute('sandbox'), srcdoc: frame.srcdoc, reachable: (() => { try { return !!frame.contentDocument } catch { return false } })(), height: frame.getBoundingClientRect().height } : null,
    pre: pre ? { text: pre.textContent, hidden: pre.hidden } : null,
    object: object ? { type: object.type, data: object.data } : null,
    table: q('table') ? { head: [...root.querySelectorAll('th')].map(t => t.textContent), rows: [...root.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), hidden: q('.doc-tablewrap').hidden } : null,
    scripts: root.querySelectorAll('script, svg').length,
    wide: document.documentElement.scrollWidth > innerWidth,
    title: document.title,
    pwned: window.__pwned || window.top.__pwned || null,
    stored: (() => { try { return localStorage.getItem('pwned') } catch { return 'unreadable' } })()
  }
}

// In the page: draw the pane straight onto the top of the page for an address, wait, and return what it shows.
// Used where the data browser shows no panes at all (a missing or private file).
export const DIRECT = async (uri) => {
  document.querySelectorAll('.direct-test').forEach(b => b.remove())
  const box = document.createElement('div')
  box.className = 'direct-test'
  document.body.prepend(box)
  const root = window.panes.byName('document-lab').render(window.$rdf.sym(uri), { dom: document, session: { store: window.SolidLogic.store } })
  box.appendChild(root)
  for (let i = 0; i < 100 && root.querySelector('.doc-state').textContent === 'Loading…'; i++) await new Promise(resolve => setTimeout(resolve, 100))
  return { state: root.querySelector('.doc-state').textContent, bad: root.querySelector('.doc-state').classList.contains('doc-bad'), shown: !!root.querySelector('pre, iframe, object, img') }
}

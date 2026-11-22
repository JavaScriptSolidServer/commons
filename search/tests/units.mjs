// Pieces that need no browser: where the walk starts (review #2), and the source rules for fixes #3 and #4.
//   node tests/units.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'

const file = path.join(import.meta.dirname, '..', 'search-pane.js')
const pane = (await import(file)).default
const src = readFileSync(file, 'utf8')
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }

// A store with no pim:storage (or the one given), and a WebID whose profile is at `doc`.
const person = (doc, { storage = null, loadFails = false, anyThrows = false } = {}) => ({
  me: { uri: doc + '#me', doc: () => ({ uri: doc }) },
  store: {
    fetcher: { load: async () => { if (loadFails) throw new Error('offline') } },
    sym: (u) => ({ value: u }),
    any: () => { if (anyThrows) throw new Error('broken'); return storage ? { value: storage } : null }
  }
})
const root = async (doc, opts) => { const p = person(doc, opts); try { return await pane._test.podRoot(p.store, p.me) } catch (error) { return 'THREW ' + error.message } }

check('#2 a WebID at the host root, no pim:storage: the host root, not a hang', await root('https://alice.example/') === 'https://alice.example/', await root('https://alice.example/'))
check('#2 a profile one folder down (/profile/card): the host root', await root('https://alice.example/profile/card') === 'https://alice.example/')
check('#2 a pod in a path (/me/profile/card.jsonld): /me/', await root('http://127.0.0.1:8732/me/profile/card.jsonld') === 'http://127.0.0.1:8732/me/')
check('#2 pim:storage wins when given', await root('https://alice.example/', { storage: 'https://alice.example/pod/' }) === 'https://alice.example/pod/')
check('#2 a non-http pim:storage is ignored', await root('https://alice.example/profile/card', { storage: 'javascript:alert(1)' }) === 'https://alice.example/')
check('#2 the profile cannot be loaded: still an answer', await root('https://alice.example/profile/card', { loadFails: true, anyThrows: true }) === 'https://alice.example/')
check('#2 nonsense in, empty answer out (never throws)', await root('not an address') === '', await root('not an address'))
check('#2 an empty root shows a message, not "Searching…" forever', /noRoot \? 'Your pod\\'s top folder could not be found/.test(src))

const code = src.replace(/\/\/[^\n]*/g, '')
check('#3 result links carry rel="noopener" and an http(s)-only href', /const href = httpOnly\(it\.uri\)\s*\n\s*if \(!href\) continue/.test(code) && /'se-row', null, \{[^}]*href, rel: 'noopener'/.test(code))
check('#4 the resize listener is removed with the others', /win\.removeEventListener\('resize', onResize\)/.test(code) && /win\.addEventListener\('resize', onResize\)/.test(code))
check('#5 the visible status line is not a live region; one separate live region', !/'se-status'[^\n]*aria-live/.test(code) && (code.match(/'aria-live'/g) || []).length === 1)
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

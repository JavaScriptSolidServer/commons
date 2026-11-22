// The house rules, checked on the source: one file, no imports, no HTML strings, no writes, safe links.
//   node tests/static.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'

const file = path.join(import.meta.dirname, '..', 'activity-pane.js')
const source = readFileSync(file, 'utf8')
const code = source.replace(/^const CSS = `[\s\S]*?^`$/m, '')
let failures = 0
const check = (name, ok) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }
check('no import or require', !/^\s*import\s|\brequire\(|\bimport\(/m.test(code))
check('no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(code))
check('read-only: no PUT, POST, PATCH or DELETE, no updater', !/['"](PUT|POST|PATCH|DELETE)['"]|updater|\.update\(/.test(code))
check('one CSS string, a two-class root rule, every class act-', (source.match(/^const CSS = `/gm) || []).length === 1 && /\.act\.suite-activity \{/.test(source) && !/^\.(?!act)[a-z]/m.test(source.split('const CSS = `')[1].split('`')[0]))
check('links: http(s) only, rel=noopener', /httpOnly = /.test(code) && /setAttribute\('rel', 'noopener'\)/.test(code))
check('no dark theme', !/prefers-color-scheme/.test(source))
check('the limits are stated where the README says', /const MAX_DEPTH = 4\b/.test(code) && /const MAX_FOLDERS = 60\b/.test(code))
import { spawnSync } from 'node:child_process'
const embed = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', '..', 'design', 'embed.mjs'), file, '--check'], { encoding: 'utf8' })
check('the suite design block is current (design/embed.mjs --check)', embed.status === 0)
const pane = (await import(file)).default
check('default export: name suite-activity, icon (data: URI), label, render, renderNavigation, renderDetails', pane.name === 'suite-activity' && /^data:image\/svg\+xml,/.test(pane.icon) && ['label', 'render', 'renderNavigation', 'renderDetails', 'shouldGetFocus'].every(k => typeof pane[k] === 'function'))
const folder = { termType: 'NamedNode', value: 'https://example.org/pod/', uri: 'https://example.org/pod/' }
const doc = { termType: 'NamedNode', value: 'https://example.org/pod/a.ttl', uri: 'https://example.org/pod/a.ttl' }
check('label: folders only', pane.label(folder) === 'Activity' && pane.label(doc) === null)
check('shouldGetFocus outside a page says no, without throwing', pane.shouldGetFocus(folder) === false)
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

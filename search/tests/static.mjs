// The file itself: one module, no imports, none of the banned DOM calls, the design sheet current, read-only.
//   node tests/static.mjs
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const file = path.join(import.meta.dirname, '..', 'search-pane.js')
const src = readFileSync(file, 'utf8')
const code = src.replace(/\/\/[^\n]*/g, '')
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }

check('parses', spawnSync(process.execPath, ['--check', file]).status === 0)
check('no static imports', !/^\s*import\s/m.test(src))
for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) check('never uses ' + bad, !code.includes(bad))
check('never writes: no PUT, POST, PATCH, DELETE or updater', !/['"](PUT|POST|PATCH|DELETE)['"]|\.updater\b|method\s*:/.test(code))
check('default export with the pane contract', /export default pane/.test(src) && /name: NAME/.test(src) && /const NAME = 'suite-search'/.test(src))
const embed = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', '..', 'design', 'embed.mjs'), file, '--check'], { encoding: 'utf8' })
check('the design sheet block is current (design/embed.mjs --check)', embed.status === 0, (embed.stdout + embed.stderr).trim())
const limits = /const LIMITS = Object\.freeze\(\{ containers: (\d+), depth: (\d+)/.exec(src)
const readme = readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8')
check('the README states the limits the code uses', !!limits && readme.includes(limits[1] + ' folders') && readme.includes(limits[2] + ' levels'), limits && limits.slice(1).join(', '))
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

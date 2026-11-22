// Checks that need no browser: the house rules, read from the source. Runs first.
//   node tests/static.mjs
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const HERE = import.meta.dirname
const FILE = path.join(HERE, '..', 'tasks-pane.js')
const src = readFileSync(FILE, 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') // comments out
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }

check('it parses', spawnSync(process.execPath, ['--check', FILE]).status === 0)
for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) check('no ' + bad, !code.includes(bad))
check('no static imports', !/^\s*import\s/m.test(code) && !/\bimport\(/.test(code))
check('one default export, named suite-tasks, with a data: icon', /export default pane\s*$/.test(src.trim()) && /name: 'suite-tasks'/.test(src) && /icon: svgUri\(/.test(src))
check('all CSS in one const CSS string', (src.match(/const CSS = `/g) || []).length === 1 && !/\.style\.(cssText|setProperty\('(?!--tsk-i))/.test(code))
check('every link is given rel=noopener', (code.match(/\.href = /g) || []).length === (code.match(/\.rel = 'noopener'/g) || []).length)
check('writes go only through the one rewrite path, and PUTs only in rewrite and createList', (code.match(/method: 'PUT'/g) || []).length === 2 && !/updater\.update|method: 'PATCH'|method: 'DELETE'|method: 'POST'/.test(code))
check('no dc/terms predicate is written (JSS stores it as dc/elements)', !/sym\(DCT \+ '[a-z]+'\), lit\(/.test(code) && !/store\.add\([^)]*DCT/.test(code))
const embed = spawnSync(process.execPath, [path.join(HERE, '..', '..', 'design', 'embed.mjs'), FILE, '--check'], { encoding: 'utf8' })
check('the design sheet block is current (design/embed.mjs --check)', embed.status === 0, (embed.stdout + embed.stderr).trim())
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

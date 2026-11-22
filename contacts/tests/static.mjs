// The house rules, checked on the source: one file, no imports, no HTML strings, safe links.
//   node tests/static.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const source = readFileSync(path.join(import.meta.dirname, '..', 'contacts-pane.js'), 'utf8')
let failures = 0
const check = (name, ok) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }
check('no import or require', !/^\s*import\s|\brequire\(|\bimport\(/m.test(source))
check('no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(source))
check('one CSS string, one prefix, a two-class root rule', (source.match(/^const CSS = `/gm) || []).length === 1 && /\.ctc\.contacts-pane \{/.test(source) && !/^\.(?!ctc)[a-z]/m.test(source.split('const CSS = `')[1].split('`')[0]))
check('every link goes through link(), which allows only http(s), mailto and tel, with rel=noopener', /safeHref = \(value\) => \/\^\(https\?:\|mailto:\|tel:\)\/i/.test(source) && /a\.rel = 'noopener'/.test(source) && (source.match(/\.href = /g) || []).length === 1)
check('no dark theme', !/prefers-color-scheme/.test(source))
const embed = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', '..', 'design', 'embed.mjs'), path.join(import.meta.dirname, '..', 'contacts-pane.js'), '--check'], { encoding: 'utf8' })
check('the design sheet block is current (design/embed.mjs --check)', embed.status === 0)
check('the pane gives renderNavigation and search for the shell, and no renderDetails', /\n  renderNavigation \(/.test(source) && /\n  search \(/.test(source) && !/renderDetails \(/.test(source))
check('no dct: predicates written (JSS finding 4; review 8)', !/dct:|purl\.org\/dc\/terms/.test(source))
check('no SPARQL patches: existing files are written whole with If-Match and read back (JSS finding 5; review 1)', !/updater\.update\(/.test(source))
check('every DELETE and PUT is behind the book-folder guard (review 2)', /async function deleteCard \(address\) \{\n      if \(!insideBook\(address\)\) return false/.test(source) && /const outside = docs\.filter\(d => !insideBook\(d\)\)/.test(source) && /if \(!insideBook\(address\)\) throw/.test(source))
const mod = await import(path.join(import.meta.dirname, '..', 'contacts-pane.js'))
const pane = mod.default
check('default export has name, icon (data: URI), label, render, mintClass, mintNew', pane.name === 'contacts' && /^data:image\/svg\+xml,/.test(pane.icon) && typeof pane.label === 'function' && typeof pane.render === 'function' && pane.mintClass.value === 'http://www.w3.org/2006/vcard/ns#AddressBook' && typeof pane.mintNew === 'function')
check('shouldGetFocus with no store says no, without throwing', pane.shouldGetFocus({ termType: 'NamedNode', value: 'https://example.org/x' }) === false)
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

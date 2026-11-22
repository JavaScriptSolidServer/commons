// Puts the sample tree on the test pod at suite-data/search/, straight to disk. Run first by run.mjs.
// Writes only inside the pod's public/suite-data/search/ folder.
//   samples/orchard/  → search/            names with "quince" at the top, a space, an é, nested folders
//   (made here)       → search/deep/       level-1/…/level-10, each with quince-at-level-N.txt (the depth limit)
//   (made here)       → search/many/       box-001 … box-320, quince files in box-005 and box-320 (the folder limit)
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples', 'orchard')
const DEST = path.join(config.podDir, 'public', 'suite-data', 'search')
export const BASE = POD + 'public/suite-data/search/'
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
cpSync(SAMPLES, DEST, { recursive: true })

let at = path.join(DEST, 'deep')
for (let n = 1; n <= 10; n++) {
  at = path.join(at, 'level-' + n)
  mkdirSync(at, { recursive: true })
  writeFileSync(path.join(at, `quince-at-level-${n}.txt`), `A note ${n} folders down.\n`)
}
for (let n = 1; n <= 320; n++) mkdirSync(path.join(DEST, 'many', 'box-' + String(n).padStart(3, '0')), { recursive: true })
writeFileSync(path.join(DEST, 'many', 'box-005', 'quince-in-box-005.txt'), 'Found: box 5 is inside the folder limit.\n')
writeFileSync(path.join(DEST, 'many', 'box-320', 'quince-in-box-320.txt'), 'Box 320 is past the folder limit.\n')

let ok = true
for (const u of [BASE, BASE + 'Quince%20photos/', BASE + 'caf%C3%A9-quince.md', BASE + 'deep/level-1/', BASE + 'many/']) {
  const got = (await fetch(u, { headers: { Accept: 'text/turtle' } })).status
  if (got !== 200) ok = false
  console.log(`${got === 200 ? 'PASS' : 'FAIL'} ${u.slice(BASE.length) || '(folder)'} is ${got} without login`)
}
const listing = await (await fetch(BASE, { headers: { Accept: 'text/turtle' } })).text()
const spaced = listing.includes('Quince%20photos/')
if (!spaced) ok = false
console.log(`${spaced ? 'PASS' : 'FAIL'} the listing names "Quince photos" as Quince%20photos (REPORT 3: fixed in 0.0.231)`)
if (process.argv[1] === import.meta.filename) process.exit(ok ? 0 : 1)

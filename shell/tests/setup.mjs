// Puts the sample data on the test pod at suite-data/shell/, straight to disk. Run first by run.mjs.
// Writes only inside the pod's public/suite-data/shell/ folder.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const DEST = path.join(config.podDir, 'public', 'suite-data', 'shell')
export const BASE = POD + 'public/suite-data/shell/'
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
cpSync(SAMPLES, DEST, { recursive: true })

let ok = true
for (const u of [BASE + 'shelf/shelf.ttl', BASE + 'notes/welcome.md', BASE + 'notes/']) {
  const got = (await fetch(u)).status
  if (got !== 200) ok = false
  console.log(`${got === 200 ? 'PASS' : 'FAIL'} ${u.slice(BASE.length)} is ${got} without login`)
}
if (process.argv[1] === import.meta.filename) process.exit(ok ? 0 : 1)

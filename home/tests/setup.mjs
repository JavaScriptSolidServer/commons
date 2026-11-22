// Puts the two sample pods (Alice: a full one, Bob: a nearly empty one) on the test pod at
// suite-data/home/, straight to disk, and gives every file a fixed time so "Recently changed"
// has a known order. Run first by run.mjs. Writes only inside the pod's suite-data/home/ folder.
import { cpSync, mkdirSync, rmSync, utimesSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const DEST = path.join(config.podDir, 'public', 'suite-data', 'home')
export const BASE = POD + 'public/suite-data/home/'
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
cpSync(SAMPLES, DEST, { recursive: true })

// Newest first in Alice's pod: shopping, the poll, tomatoes, the tracker. Everything else is older.
const times = {
  'alice/notes/shopping.md': '2026-11-20T09:15:00Z',
  'alice/polls/dinner/index.ttl': '2026-11-19T18:40:00Z',
  'alice/garden/tomatoes.md': '2026-11-18T07:05:00Z',
  'alice/work/tracker.ttl': '2026-11-17T12:00:00Z'
}
const OLD = new Date('2026-10-01T10:00:00Z')
const walk = (dir) => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); const rel = path.relative(DEST, p); const when = times[rel] ? new Date(times[rel]) : OLD; utimesSync(p, when, when) } }
walk(DEST)
// Folders take the time of their newest file, as they would on a real disk.
for (const [rel, iso] of Object.entries(times)) { let dir = path.dirname(path.join(DEST, rel)); while (dir.startsWith(path.join(DEST, 'alice', path.sep)) || dir === path.join(DEST, 'alice')) { const t = statSync(dir).mtime; const when = new Date(iso); if (when > t || +t === +OLD) utimesSync(dir, when, when); if (dir === path.join(DEST, 'alice')) break; dir = path.dirname(dir) } }

const status = async (u) => (await fetch(u)).status
let ok = true
for (const u of [BASE + 'alice/profile/card.ttl', BASE + 'alice/settings/tools.jsonld', BASE + 'bob/profile/card.ttl']) {
  const got = await status(u); if (got !== 200) ok = false; console.log(`${got === 200 ? 'PASS' : 'FAIL'} ${u.slice(BASE.length)} is ${got} without login`)
}
if (process.argv[1] === import.meta.filename) process.exit(ok ? 0 : 1)

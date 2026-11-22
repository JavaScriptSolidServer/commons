// Puts the samples on the test pod at suite-data/activity/, straight to disk, and gives every file a time
// relative to now, so the stream has something in each group (Today, Yesterday, This week, ...). Also makes
// alice/private/ owner-only, and builds big/: 70 folders with one note each, to run into the walk's limit.
// Run first by run.mjs. Writes only inside the pod's suite-data/activity/ folder.
import { cpSync, mkdirSync, rmSync, utimesSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

export const DEST = path.join(config.podDir, 'public', 'suite-data', 'activity')
export const BASE = POD + 'public/suite-data/activity/'
const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const MIN = 60000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// Alice's files, newest first: the order the stream must show (too-deep.md is never shown).
export function times (now = Date.now()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const t = +today
  return {
    'archive/2025/old/deep/four/too-deep.md': now - MIN, // five levels down: past the depth limit
    'notes/shopping.md': Math.max(now - 10 * MIN, t + 2 * MIN),
    'polls/dinner/index.ttl': Math.max(now - 40 * MIN, t + MIN),
    'photos/lake.svg': t - 6 * HOUR,
    'contacts/Person/carol/index.ttl': t - 10 * HOUR,
    'photos/bed.png': t - 2 * DAY + 10 * HOUR,
    'boards/garden.ttl': t - 3 * DAY + 10 * HOUR,
    'pads/minutes.ttl': t - 4 * DAY + 10 * HOUR,
    'documents/budget.csv': t - 5 * DAY + 10 * HOUR,
    'meetings/planning/index.ttl': t - 12 * DAY,
    'private/diary.md': t - 13 * DAY,
    'archive/2025/old/deep/kept.md': t - 20 * DAY,
    'contacts/people.ttl': t - 25 * DAY,
    'contacts/groups.ttl': t - 26 * DAY, // mentions a typed group from another file: must stay "groups.ttl"
    'contacts/index.ttl': t - 60 * DAY,
    'data/plants.ttl': t - 61 * DAY,
    'notes/ideas.md': t - 100 * DAY,
    'documents/report.pdf': t - 400 * DAY
  }
}
export const BIG = 70

export function place () {
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })
  cpSync(SAMPLES, DEST, { recursive: true })
  const now = Date.now()
  const alice = path.join(DEST, 'alice')
  for (const [rel, ms] of Object.entries(times(now))) { const d = new Date(ms); utimesSync(path.join(alice, rel), d, d) }
  // Folders keep the time of their newest direct child, as a disk would after the file was made.
  const fold = (dir) => { let newest = 0; for (const n of readdirSync(dir)) { const p = path.join(dir, n); const s = statSync(p); newest = Math.max(newest, s.isDirectory() ? fold(p) : +s.mtime) } if (newest) utimesSync(dir, new Date(newest), new Date(newest)); return newest }
  fold(alice)
  // private/: only the pod's owner can read it.
  const me = POD + 'profile/card.jsonld#me'
  const folder = BASE + 'alice/private/'
  writeFileSync(path.join(alice, 'private', '.acl'), JSON.stringify({
    '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
    '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) }]
  }, null, 2))
  // big/: f00 (newest) to f69 (oldest), one note each.
  for (let i = 0; i < BIG; i++) {
    const dir = path.join(DEST, 'big', 'f' + String(i).padStart(2, '0'))
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'note.md')
    writeFileSync(file, `# Note ${i}\n`)
    const d = new Date(now - (i + 1) * HOUR)
    utimesSync(file, d, d); utimesSync(dir, d, d)
  }
}

if (process.argv[1] === import.meta.filename) {
  place()
  const status = async (u) => (await fetch(u)).status
  let ok = true
  for (const [u, want] of [[BASE + 'alice/', 200], [BASE + 'alice/notes/shopping.md', 200], [BASE + 'alice/private/', 401], [BASE + 'alice/private/diary.md', 401], [BASE + 'big/f00/', 200]]) {
    const got = await status(u); if (got !== want) ok = false
    console.log(`${got === want ? 'PASS' : 'FAIL'} ${u.slice(BASE.length)} is ${got} without login`)
  }
  process.exit(ok ? 0 : 1)
}

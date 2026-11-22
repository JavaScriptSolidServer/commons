// Puts the samples on the test pod, at suite-data/media/, straight to disk, and makes private/ owner-only.
// Run first by run.mjs. Writes only inside the pod's suite-data/media/ folder.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const DEST = path.join(config.podDir, 'public', 'suite-data', 'media')
const BASE = POD + 'public/suite-data/media/'
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
cpSync(SAMPLES, DEST, { recursive: true })
// The private folder: only the pod's owner can read it, and everything in it.
const me = POD + 'profile/card.jsonld#me'
const folder = BASE + 'private/'
writeFileSync(path.join(DEST, 'private', '.acl'), JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) }]
}, null, 2))
// A public folder with one private picture in it (its own access rule), for the fallback to the logged-in fetch.
mkdirSync(path.join(DEST, 'partly'))
cpSync(path.join(SAMPLES, 'gallery', 'alice-lake.png'), path.join(DEST, 'partly', 'open-lake.png'))
cpSync(path.join(SAMPLES, 'private', 'secret-garden.png'), path.join(DEST, 'partly', 'shut-garden.png'))
const shut = BASE + 'partly/shut-garden.png'
writeFileSync(path.join(DEST, 'partly', 'shut-garden.png.acl'), JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': shut }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) }]
}, null, 2))
// A sub-folder inside the playlist folder, for the shell's "Folders" navigation.
mkdirSync(path.join(DEST, 'music', 'live'))
cpSync(path.join(SAMPLES, 'music', '01-morning.wav'), path.join(DEST, 'music', 'live', 'encore.wav'))
// A text-only sub-folder (the shell sends it to Files), and a folder with one picture that cannot be decoded.
mkdirSync(path.join(DEST, 'music', 'notes'))
writeFileSync(path.join(DEST, 'music', 'notes', 'liner.txt'), 'Liner notes for the morning tones.\n')
mkdirSync(path.join(DEST, 'broken'))
writeFileSync(path.join(DEST, 'broken', 'a-broken.png'), 'this is not a picture\n')
cpSync(path.join(SAMPLES, 'gallery', 'forest.png'), path.join(DEST, 'broken', 'b-forest.png'))
const status = async (u) => (await fetch(u)).status
const checks = [[BASE + 'gallery/', 200], [BASE + 'gallery/alice-lake.png', 200], [folder, 401], [folder + 'secret-lake.png', 401], [BASE + 'partly/', 200], [BASE + 'music/live/encore.wav', 200], [BASE + 'partly/open-lake.png', 200], [shut, 401]]
let ok = true
for (const [u, want] of checks) { const got = await status(u); if (got !== want) ok = false; console.log(`${got === want ? 'PASS' : 'FAIL'} ${u.slice(BASE.length) || '/'} is ${got} without login`) }
process.exit(ok ? 0 : 1)

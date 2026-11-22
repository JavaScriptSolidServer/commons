// Puts the samples on the test pod, straight to disk, at suite-data/folder/. Run first by run.mjs.
// Writes only inside the pod's suite-data/folder/ folder:
//   garden/   the samples, plus an empty folder
//   locked/   a folder the test user may read but not write (its own .acl)
//   work/     an empty folder the write tests use
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

export const DEST = path.join(config.podDir, 'public', 'suite-data', 'folder')
export const BASE = POD + 'public/suite-data/folder/'
const me = POD + 'profile/card.jsonld#me'
// JSS wants access rules as JSON-LD. open: owner Read+Write+Control and anyone Read; else owner Read only.
const acl = (folder, open) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#', foaf: 'http://xmlns.com/foaf/0.1/' },
  '@graph': [
    { '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': (open ? ['Read', 'Write', 'Control'] : ['Read']).map(m => ({ '@id': 'acl:' + m })) },
    ...(open ? [{ '@id': '#public', '@type': 'acl:Authorization', 'acl:agentClass': { '@id': 'foaf:Agent' }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': [{ '@id': 'acl:Read' }] }] : [])
  ]
}, null, 2)
if (process.argv[1] === import.meta.filename) {
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })
  cpSync(path.join(import.meta.dirname, '..', 'samples'), DEST, { recursive: true })
  mkdirSync(path.join(DEST, 'garden', 'empty'))
  mkdirSync(path.join(DEST, 'work'))
  // garden/.acl: the same rules it would inherit (owner full, anyone reads), so the listing has a hidden file.
  writeFileSync(path.join(DEST, 'garden', '.acl'), acl(BASE + 'garden/', true))
  mkdirSync(path.join(DEST, 'locked'))
  writeFileSync(path.join(DEST, 'locked', 'readme.txt'), 'You may read this folder but not change it.\n')
  const locked = BASE + 'locked/'
  writeFileSync(path.join(DEST, 'locked', '.acl'), acl(locked, false))
  const checks = [[BASE + 'garden/', 200], [BASE + 'garden/bob-watering.md', 200], [BASE + 'garden/empty/', 200], [BASE + 'work/', 200], [locked, 401]]
  let ok = true
  for (const [u, want] of checks) { const got = (await fetch(u)).status; if (got !== want) ok = false; console.log(`${got === want ? 'PASS' : 'FAIL'} ${u.slice(BASE.length)} is ${got} without login`) }
  process.exit(ok ? 0 : 1)
}

// Test data on the pod, ONLY inside suite-data/sharing/. Rebuilt from scratch on every run.
//   sharing/.acl        the test user only (so nothing here is public to start with)
//   sharing/note.ttl    a file with no rules of its own: it inherits
//   sharing/team/       a folder with the sample rules (Alice, Bob, Carol, a group, an app), plus the test user as owner
import { config } from '../../lib/lib.mjs'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export const DIR = path.join(config.podDir, 'public', 'suite-data', 'sharing')
export const BASE = config.pod + 'public/suite-data/sharing/'
export const ME = config.pod + 'profile/card.jsonld#me'
const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
if (!DIR.endsWith('/suite-data/sharing')) throw new Error('refusing: unexpected data folder ' + DIR)

const owner = (target, defaults = true) => ({
  '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': ME },
  'acl:accessTo': { '@id': target }, ...(defaults ? { 'acl:default': { '@id': target } } : {}),
  'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }]
})
const context = { acl: 'http://www.w3.org/ns/auth/acl#', foaf: 'http://xmlns.com/foaf/0.1/' }

export function reset () {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(path.join(DIR, 'team'), { recursive: true })
  writeFileSync(path.join(DIR, '.acl'), JSON.stringify({ '@context': context, '@graph': [owner(BASE)] }, null, 2))
  writeFileSync(path.join(DIR, 'note.ttl'), '@prefix dc: <http://purl.org/dc/terms/>.\n<#this> dc:title "A note that inherits" .\n')
  const team = JSON.parse(readFileSync(path.join(SAMPLES, 'team.acl.jsonld'), 'utf8'))
  team['@graph'].unshift(owner('./'))
  writeFileSync(path.join(DIR, 'team', '.acl'), JSON.stringify(team, null, 2))
  writeFileSync(path.join(DIR, 'team', 'plan.ttl'), readFileSync(path.join(SAMPLES, 'plan.ttl')))
}
export const disk = (f) => { const p = path.join(DIR, f); return existsSync(p) ? readFileSync(p, 'utf8') : null }

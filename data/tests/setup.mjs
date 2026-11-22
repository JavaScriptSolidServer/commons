// Puts the samples on the test pod at suite-data/data/, straight to disk, and adds what the tests need:
//   big.ttl       made here: 1,500 things, about 6,000 statements, for the caps
//   private/      only the pod's owner can read it (401 logged out)
//   forbidden/    only someone else can read it (403 for the owner too)
// Run first by run.mjs. Writes only inside the pod's suite-data/data/ folder.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, POD } from '../../lib/lib.mjs'

const SAMPLES = path.join(import.meta.dirname, '..', 'samples')
const DEST = path.join(config.podDir, 'public', 'suite-data', 'data')
export const BASE = POD + 'public/suite-data/data/'
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
cpSync(SAMPLES, DEST, { recursive: true })

let big = '@prefix schema: <http://schema.org/> .\n\n'
for (let i = 1; i <= 1500; i++) big += `<#item${i}> a schema:Thing ;\n    schema:name "Item ${i}" ;\n    schema:position ${i} ;\n    schema:isRelatedTo <#item${i === 1 ? 1500 : i - 1}> .\n`
writeFileSync(path.join(DEST, 'big.ttl'), big)
// Values that formatting gets wrong if it is careless: a 20-digit integer, a double too big for a number,
// impossible dates, a date in the year 90, a value of 300,000 characters.
writeFileSync(path.join(DEST, 'odd.ttl'), `@prefix ex: <http://example.org/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#x> ex:name "Odd values" ;
    ex:counter "12345678901234567890"^^xsd:integer ;
    ex:huge "1e400"^^xsd:double ;
    ex:bad "2024-02-30"^^xsd:date ;
    ex:badTime "2023-02-30T10:00:00Z"^^xsd:dateTime ;
    ex:early "0090-05-01"^^xsd:date ;
    ex:long "${'abcdefghij'.repeat(30000)}" .
`)

const acl = (folder, agent) => JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [{ '@id': '#only', '@type': 'acl:Authorization', 'acl:agent': { '@id': agent }, 'acl:accessTo': { '@id': folder }, 'acl:default': { '@id': folder }, 'acl:mode': [{ '@id': 'acl:Read' }] }]
}, null, 2)
const secret = '@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n<#diary> foaf:name "Alice\'s diary" .\n'
for (const [name, agent] of [['private', POD + 'profile/card.jsonld#me'], ['forbidden', 'https://bob.example.com/profile/card#me']]) {
  mkdirSync(path.join(DEST, name), { recursive: true })
  writeFileSync(path.join(DEST, name, 'notes.ttl'), secret)
  writeFileSync(path.join(DEST, name, '.acl'), acl(BASE + name + '/', agent))
}

const checks = [['people.ttl', 200], ['project.jsonld', 200], ['big.ttl', 200], ['private/notes.ttl', 401], ['forbidden/notes.ttl', 401], ['missing.ttl', 404]]
let ok = true
for (const [file, want] of checks) {
  const got = (await fetch(BASE + file)).status
  if (got !== want) ok = false
  console.log(`${got === want ? 'PASS' : 'FAIL'} ${file} is ${got} without login`)
}
process.exit(ok ? 0 : 1)

// Make the second test user "bob" with a pod at /bob/ on the running local JSS, using JSS's own code:
// the same two calls its single-user start-up seed makes for "me" (createPodStructure, then createAccount).
// JSS 0.0.229 has no "account create" command and turns registration off in --single-user mode, so this is
// the way that needs no restart and no change to the server's command line. The running server reads the
// account files from disk on every login, so bob can log in straight away.
//   node make-bob.mjs     (safe to run twice: it stops if bob already exists)
//   JSS_SRC=<installed javascript-solid-server>/src/ overrides where JSS is found (default: the global npm root).
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const config = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'suite-local.json'), 'utf8'))
const JSS = process.env.JSS_SRC || path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'javascript-solid-server', 'src') + '/'
const DATA = path.dirname(config.podDir) // the server's --root: podDir is <root>/me
const BASE = new URL(config.pod).origin
const NAME = 'bob'
process.env.DATA_ROOT = DATA
const { createPodStructure } = await import(JSS + 'handlers/container.js')
const { createAccount, findByUsername } = await import(JSS + 'idp/accounts.js')

const podUri = `${BASE}/${NAME}/`
const webId = `${podUri}profile/card.jsonld#me`
if (await findByUsername(NAME)) { console.log(`${NAME} already has an account; nothing done.`); process.exit(0) }
if (existsSync(path.join(DATA, NAME))) { console.log(`${DATA}/${NAME} exists but has no account; stopping, look first.`); process.exit(1) }

await createPodStructure(NAME, webId, podUri, `${BASE}/`, 0, { provisionKeys: false })
const account = await createAccount({ username: NAME, password: config.password, webId, podName: NAME })
console.log(`made ${account.username}: ${account.webId}`)

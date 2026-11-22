// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
// poll.mjs logs in; shell.mjs reuses that session; sample.mjs starts a clean, logged-out browser.
// All on port 9523. Test data: me/public/suite-data/poll/ (each file removes its own).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const suite = path.join(here, '..', '..')
const steps = [
  ['the design block is current', [path.join(suite, 'design', 'embed.mjs'), path.join(here, '..', 'poll-pane.js'), '--check']],
  ['poll.mjs', [path.join(here, 'poll.mjs')]],
  ['shell.mjs', [path.join(here, 'shell.mjs')]],
  ['sample.mjs', [path.join(here, 'sample.mjs')]],
  ['two-person.mjs (review: me on 9523, bob on 9524)', [path.join(here, 'two-person.mjs')]]
]
for (const [name, args] of steps) {
  console.log(`\n== ${name}`)
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${name} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

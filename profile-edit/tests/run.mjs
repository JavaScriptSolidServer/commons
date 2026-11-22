// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
// edit.mjs logs in; the others reuse that session (loggedout.mjs starts a clean, logged-out browser).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
console.log('== the design block is current')
const sheet = spawnSync(process.execPath, [path.join(here, '..', '..', 'design', 'embed.mjs'), path.join(here, '..', 'profile-edit-pane.js'), '--check'], { stdio: 'inherit' })
if (sheet.status !== 0) { console.log('\nSTOPPED: run node design/embed.mjs profile-edit/profile-edit-pane.js'); process.exit(1) }
for (const [file, ...args] of [['edit.mjs'], ['turtle.mjs'], ['whole.mjs'], ['layout.mjs'], ['shell.mjs'], ['loggedout.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
// setup.mjs resets suite-data/folder/ on the pod from samples/ (and makes work/ and locked/). First, the design
// sheet's block in the pane must be current (design/embed.mjs --check). shell.mjs reuses write.mjs's login;
// bob.mjs logs in as the second test user; two-person.mjs (the reviewer's) shares through Files with bob, ports 9561/9562.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
for (const [file, ...args] of [['../../design/embed.mjs', '--check', path.join(here, '..', 'folder-pane.js')], ['setup.mjs'], ['read.mjs', '1300'], ['read.mjs', '400'], ['write.mjs', '1300'], ['write.mjs', '400'], ['shell.mjs'], ['bob.mjs'], ['two-person.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit', timeout: 300000 })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

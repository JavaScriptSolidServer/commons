// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
// setup.mjs resets suite-data/notes/ on the pod from samples/; notes.mjs logs in, shell.mjs reuses that login,
// loggedout.mjs starts from a clean browser.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
for (const [file, ...args] of [['setup.mjs'], ['notes.mjs'], ['shell.mjs'], ['loggedout.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit', timeout: 300000 })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

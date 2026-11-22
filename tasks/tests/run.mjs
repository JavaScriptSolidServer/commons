// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
// static (no browser) · sample (logged out, samples, 1300 + true 400 px) · tasks (logged in: create a list, add,
// tick, edit, delete, rename, reload) · shell (inside the suite shell) · bob (a second person, then logged out) ·
// interop (the Boards pane opens a Tasks list) · two-person (reviewer: me and bob on one shared list, 9571/9572).
// Browsers on 9531 (and 9532 for bob).
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const here = import.meta.dirname
for (const file of ['static.mjs', 'sample.mjs', 'tasks.mjs', 'shell.mjs', 'bob.mjs', 'interop.mjs', 'fixes.mjs', 'two-person.mjs']) {
  console.log(`\n== ${file}`)
  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

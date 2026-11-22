// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const here = import.meta.dirname
for (const [file, ...args] of [['static.mjs'], ['units.mjs'], ['setup.mjs'], ['search.mjs'], ['search.mjs', '400'], ['alone.mjs'], ['loggedout.mjs']]) {
  console.log(`\n== ${path.basename(file)} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

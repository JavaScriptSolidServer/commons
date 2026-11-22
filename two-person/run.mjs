// Both two-person tests, one after another. Stops at the first file that fails.
//   node run.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'

for (const file of ['poll.mjs', 'sharing.mjs']) {
  console.log(`\n== ${file}`)
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, file)], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

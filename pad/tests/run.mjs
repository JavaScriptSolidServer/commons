// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
console.log('== the design block is current')
const embed = spawnSync(process.execPath, [path.join(here, '..', '..', 'design', 'embed.mjs'), path.join(here, '..', 'pad-pane.js'), '--check'], { stdio: 'inherit' })
if (embed.status !== 0) { console.log('\nSTOPPED: design block stale'); process.exit(1) }
for (const [file, ...args] of [['pad.mjs'], ['shell.mjs'], ['two.mjs'], ['sample.mjs'], ['two-person.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

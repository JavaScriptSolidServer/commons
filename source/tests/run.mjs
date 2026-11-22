// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const suite = path.join(here, '..', '..')
console.log('== the design block is current')
const embed = spawnSync(process.execPath, [path.join(suite, 'design', 'embed.mjs'), path.join(here, '..', 'source-pane.js'), '--check'], { stdio: 'inherit' })
if (embed.status !== 0) { console.log('\nSTOPPED: design block stale'); process.exit(1) }
for (const [file, ...args] of [['source.mjs'], ['layout.mjs', '400'], ['shell.mjs'], ['logged-out.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

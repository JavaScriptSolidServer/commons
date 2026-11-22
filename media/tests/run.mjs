// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
// The pane's copy of the design sheet must be current (design/embed.mjs --check).
const sheet = spawnSync(process.execPath, [path.join(here, '..', '..', 'design', 'embed.mjs'), path.join(here, '..', 'media-pane.js'), '--check'], { stdio: 'inherit' })
if (sheet.status !== 0) { console.log('\nSTOPPED: the design block is out of date (run design/embed.mjs on media-pane.js)'); process.exit(1) }
for (const [file, ...args] of [['make-samples.mjs'], ['setup.mjs'], ['media.mjs'], ['media.mjs', '400'], ['shell.mjs'], ['logged-out.mjs']]) {
  console.log(`\n== ${file} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

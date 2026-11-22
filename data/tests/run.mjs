// Every test, one after another. Stops at the first file that fails.
//   node tests/run.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const here = import.meta.dirname
const DESIGN = path.join(here, '..', '..', 'design', 'embed.mjs')
for (const [file, ...args] of [[DESIGN, path.join(here, '..', 'data-pane.js'), '--check'], ['setup.mjs'], ['data.mjs', '1300'], ['data.mjs', '400'], ['shell.mjs'], ['loggedout.mjs', '1300'], ['loggedout.mjs', '400']]) {
  console.log(`\n== ${path.basename(file)} ${args.map(a => path.basename(a)).join(' ')}`)
  const result = spawnSync(process.execPath, [path.resolve(here, file), ...args], { stdio: 'inherit' })
  if (result.status !== 0) { console.log(`\nSTOPPED: ${file} failed`); process.exit(result.status || 1) }
}
console.log('\nEVERY TEST PASSED')

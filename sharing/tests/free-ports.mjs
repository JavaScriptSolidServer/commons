// Import first in every test: whatever way the process ends (a check failing inside the shared helper's open(),
// which exits at once, an uncaught error, Ctrl-C), no browser is left holding this folder's ports, 9527 (me) and
// 9528 (bob). Only these two ports, which are this folder's alone. A normal finish() has closed them already.
import { spawnSync } from 'node:child_process'
const PORTS = ['9527/tcp', '9528/tcp']
let freed = false
function free () {
  if (freed) return
  freed = true
  try { spawnSync('fuser', ['-s', '-k', '-TERM', ...PORTS], { stdio: 'ignore', timeout: 5000 }) } catch { /* nothing to free */ }
}
process.on('exit', free)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { free(); process.exit(130) })
process.on('unhandledRejection', (error) => { console.log('FAIL ' + (error && error.message ? error.message : error)); process.exitCode = 1; free(); process.exit(1) })

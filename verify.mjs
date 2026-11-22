// The coordinator's own pass over every suite pane: static safety scan, design-block check, then each pane's own
// tests, one at a time. Ends EVERY TEST PASSED only if every pane passes and nothing is flagged.
//   node verify.mjs | tee verify.log
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { spawnSync, execFileSync } from 'node:child_process'
import path from 'node:path'
const ROOT = import.meta.dirname
const code = (s) => s.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, t) => t || '')
const out = []
for (const name of readdirSync(ROOT).filter(d => existsSync(path.join(ROOT, d, 'tests', 'run.mjs'))).sort()) {
  const dir = path.join(ROOT, name)
  const file = readdirSync(dir).find(f => /-pane\.js$/.test(f))
  const row = { name, file, lines: 0, bad: [], parse: 'ok', tests: '', seconds: 0, checks: 0, readme: existsSync(path.join(dir, 'README.md')), notes: existsSync(path.join(dir, 'NOTES.md')) }
  if (file) {
    const src = readFileSync(path.join(dir, file), 'utf8'); const bare = code(src)
    row.lines = src.split('\n').length
    for (const [what, re] of [['innerHTML', /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write\s*\(/g], ['eval', /\beval\s*\(|\bnew\s+Function\b/g], ['static import', /^\s*import\s[^(]/mg], ['alert/confirm', /\b(alert|confirm|prompt)\s*\(/g]]) { const n = (bare.match(re) || []).length; if (n) row.bad.push(what + '×' + n) }
    if (!/\bexport\s+default\b/.test(bare)) row.bad.push('no default export')
    try { execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' }) } catch { row.parse = 'FAILS' }
    for (const f of readdirSync(dir).filter(f => /-pane\.js$/.test(f))) { const t = readFileSync(path.join(dir, f), 'utf8'); if (/suite:design begin/.test(t)) { try { execFileSync(process.execPath, [path.join(ROOT, 'design', 'embed.mjs'), path.join(dir, f), '--check'], { stdio: 'pipe' }) } catch { row.bad.push('design block stale: ' + f) } } }
    row.paneName = (src.match(/\bname:\s*'([^']+)'/) || [])[1] || '?'
  } else row.bad.push('no pane file')
  const t = Date.now()
  const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'run.mjs')], { encoding: 'utf8', timeout: 15 * 60 * 1000, cwd: dir })
  row.seconds = Math.round((Date.now() - t) / 1000)
  const text = (r.stdout || '') + (r.stderr || '')
  row.checks = (text.match(/^PASS /mg) || []).length
  row.fails = (text.match(/^FAIL .*/mg) || []).slice(0, 4)
  row.tests = /EVERY TEST PASSED/.test(text) && r.status === 0 ? 'pass' : (r.error ? 'TIMEOUT' : 'FAIL')
  out.push(row)
  writeFileSync(path.join(ROOT, 'verify.json'), JSON.stringify(out, null, 1))
  console.log(`${row.tests.padEnd(7)} ${name.padEnd(13)} ${String(row.checks).padStart(3)} checks ${String(row.seconds).padStart(4)}s  ${row.lines} lines  pane "${row.paneName}"  ${row.bad.join(', ') || 'clean'}${row.fails && row.fails.length ? '\n        ' + row.fails.join('\n        ').slice(0, 500) : ''}`)
}
const bad = out.filter(r => r.tests !== 'pass' || r.bad.length || r.parse !== 'ok')
console.log(`\n${out.length} panes, ${out.reduce((n, r) => n + r.checks, 0)} checks`)
console.log(bad.length ? `NOT PASSED: ${bad.map(r => r.name).join(', ')}` : 'EVERY TEST PASSED')
process.exit(bad.length ? 1 : 0)

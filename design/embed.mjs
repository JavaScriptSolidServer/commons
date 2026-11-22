// Copies the design sheet into a pane's CSS string, so the pane stays one file with no imports.
//
//   node design/embed.mjs <pane.js> --prefix ab                 tokens + every recipe, classes renamed ui- → ab-
//   node design/embed.mjs <pane.js> --prefix ab --only btn,input,row   tokens + only those sections
//   node design/embed.mjs <pane.js> --check                     exit 1 if the block is not what the sheet says now
//   node design/embed.mjs --sections                            list the section names
//
// The pane's CSS string must hold the two marker lines (once), and the tool replaces what is between them:
//   const CSS = `
//   /* suite:design begin */
//   /* suite:design end */
//   .ab.my-pane { ... }
//   `
// The options used are written into the begin line, so --check and a later re-run need no options.
// Tokens go in as `:where(:root) { --sui-… }` (no specificity: the shell's :root block wins when the pane runs
// inside the shell). The shell itself is embedded with --provider, which writes `:root` instead.
// Run by hand when the sheet changes; nothing runs this at load time. MIT. Copyright (c) 2026 Melvin Carvalho.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dirname
const tokens = readFileSync(path.join(HERE, 'tokens.css'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '').trim()
const recipes = readFileSync(path.join(HERE, 'recipes.css'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '')

// Sections start at lines like "/* ---- name: ... ---" ; the first word after ---- is the section key.
export function sections () {
  const out = []
  for (const part of recipes.split(/^(?=\/\* ---- )/m)) {
    const m = part.match(/^\/\* ---- ([a-z]+)/)
    if (m) out.push({ key: m[1], css: part.trim() })
  }
  return out
}

export function block ({ prefix, only = [], provider = false }) {
  if (!/^[a-z][a-z0-9]{0,7}$/.test(prefix)) throw new Error('--prefix: 1-8 lower-case letters or digits, starting with a letter')
  const all = sections()
  const unknown = only.filter(k => !all.some(s => s.key === k))
  if (unknown.length) throw new Error('unknown section(s): ' + unknown.join(', ') + ' (see --sections)')
  const chosen = all.filter(s => !only.length || s.key === 'base' || only.includes(s.key))
  const css = chosen.map(s => s.css).join('\n').replace(/\.ui-/g, '.' + prefix + '-').replace(/--ui-i\b/g, '--' + prefix + '-i')
  const root = provider ? tokens.replace(':where(:root)', ':root') : tokens
  const opts = ['--prefix ' + prefix, only.length ? '--only ' + only.join(',') : '', provider ? '--provider' : ''].filter(Boolean).join(' ')
  const text = `/* suite:design begin ${opts} */\n${root}\n${css}\n/* suite:design end */`
  if (/[`\\]|\$\{/.test(text)) throw new Error('the sheet holds a backtick, backslash or ${: it cannot go in a template string')
  return text
}

const MARK = /\/\* suite:design begin([^*]*)\*\/[\s\S]*?\/\* suite:design end \*\//

function optionsFrom (args) {
  const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
  return { prefix: get('--prefix'), only: (get('--only') || '').split(',').filter(Boolean), provider: args.includes('--provider') }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2)
  if (args.includes('--sections')) { console.log(sections().map(s => s.key).join(' ')); process.exit(0) }
  const file = args.find(a => !a.startsWith('--') && /\.m?js$/.test(a))
  if (!file) { console.log('usage: node design/embed.mjs <pane.js> --prefix ab [--only a,b] [--provider] | --check | --sections'); process.exit(2) }
  const src = readFileSync(file, 'utf8')
  const found = src.match(MARK)
  if (!found) { console.log('No /* suite:design begin */ … /* suite:design end */ markers in ' + file); process.exit(2) }
  let opts = optionsFrom(args)
  if (!opts.prefix) opts = optionsFrom(found[1].trim().split(/\s+/)) // re-use what the begin line says
  if (!opts.prefix) { console.log('No --prefix given and none recorded in the begin line'); process.exit(2) }
  const want = block(opts)
  if (args.includes('--check')) {
    const ok = found[0] === want
    console.log(ok ? `OK ${file}: the design block is current` : `STALE ${file}: re-run node design/embed.mjs ${file}`)
    process.exit(ok ? 0 : 1)
  }
  writeFileSync(file, src.replace(MARK, () => want))
  console.log(`${file}: design block written (${opts.prefix}-, ${opts.only.length ? opts.only.join(',') : 'all sections'}${opts.provider ? ', provider' : ''})`)
}

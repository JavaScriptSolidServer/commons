// Shared by the source pane's tests: where things are, and how to open the Source view.
import { LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

export const PANE = LAB + 'source/source-pane.js'
export const PORT = 9521
export const DATA = POD + 'public/suite-data/source/' // the only place these tests write
export const DATA_DIR = path.join(config.podDir, 'public', 'suite-data', 'source')
export const SAMPLES = path.join(import.meta.dirname, '..', 'samples')

// Put the samples on the pod, as files written straight to disk.
export function freshData () {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const f of readdirSync(DATA_DIR)) rmSync(path.join(DATA_DIR, f), { recursive: true, force: true })
  for (const f of readdirSync(SAMPLES)) cpSync(path.join(SAMPLES, f), path.join(DATA_DIR, f))
}

const DEEP = `(sel, root = document) => { const walk = (node) => { const found = node.querySelector(sel); if (found) return found; for (const el of node.querySelectorAll('*')) if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f } return null }; return walk(root) }`

// The data browser lists other views in the "More options" menu; choose ours from it, as a person would.
export async function openSource (page, address, uri) {
  await page.goto(address(uri))
  await page.waitFor(() => { const b = document.getElementById('browseAsk'); return !!b && !b.hidden }, { timeout: 6000 })
    .then(() => page.evaluate(() => document.getElementById('browseAskYes').click()), () => {})
  const ours = `(() => { const menu = (${DEEP})('solid-ui-resource-actions-menu'); if (!menu || !menu.shadowRoot) return null; return [...menu.shadowRoot.querySelectorAll('solid-ui-menu-item')].find(i => i.textContent.trim() === 'Source' && (i.querySelector('img') || {}).src && i.querySelector('img').src.includes('00679e')) || null })()`
  await page.waitFor(`!!${ours}`, { timeout: 40000 })
  await page.evaluate(`${ours}.dispatchEvent(new CustomEvent('solid-ui-select', { bubbles: true, composed: true }))`)
  await page.waitFor(() => { const p = document.querySelector('.src.source-pane'); return p && (p.querySelector('.src-text') || p.querySelector('.src-empty')) }, { timeout: 30000 })
  await sleep(300)
}

// Our pane forced onto a resource the menu would not offer it for (a picture, say).
export async function forceSource (page, address, uri, near) {
  await openSource(page, address, near)
  await page.evaluate((u) => { const p = document.querySelector('solid-ui-file-explorer-provider'); p.openPane(window.SolidLogic.store.sym(u), 'source-lab') }, uri)
  await page.waitFor(() => { const p = document.querySelector('.src.source-pane'); return p && p.querySelector('.src-empty') }, { timeout: 30000 })
}

// What the pane shows, in one look.
export const view = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector('.src.source-pane ' + s)
  const shown = (b) => !!b && !b.hidden
  const word = (b) => b.getAttribute('aria-label') || b.textContent
  const msg = [...document.querySelectorAll('.src.source-pane .src-msg')].find(shown)
  const buttons = [...document.querySelectorAll('.src-bar button')].filter(shown).map(word)
  return {
    title: q('.src-title') && q('.src-title').textContent,
    meta: q('.src-meta') && q('.src-meta').textContent,
    text: q('.src-text') ? q('.src-text').value : null,
    readOnly: q('.src-text') ? q('.src-text').readOnly : null,
    gutter: q('.src-gutter') ? q('.src-gutter').textContent.split('\n').length : 0,
    buttons,
    statusButtons: msg ? [...msg.querySelectorAll('button')].map(word) : [],
    status: msg ? msg.dataset.tone + ' :: ' + msg.textContent : '',
    dirty: shown(q('.src-dirty')),
    empty: q('.src-empty') && q('.src-empty').textContent,
    wide: document.documentElement.scrollWidth > innerWidth
  }
})

export const click = (page, label) => page.evaluate((l) => [...document.querySelectorAll('.src.source-pane button')].find(b => (b.getAttribute('aria-label') || b.textContent) === l && !b.hidden).click(), label)

// Replace the text as typing would (an input event follows).
export const setText = (page, text) => page.evaluate((t) => { const a = document.querySelector('.src-text'); a.value = t; a.dispatchEvent(new Event('input', { bubbles: true })) }, text)

// A real key press, through the browser's input pipeline, into the text.
export async function key (page, keyName, { ctrl = false } = {}) {
  await page.evaluate(() => document.querySelector('.src-text').focus())
  const code = { Tab: ['Tab', 9], s: ['KeyS', 83] }[keyName]
  const base = { key: keyName, code: code[0], windowsVirtualKeyCode: code[1], modifiers: ctrl ? 2 : 0 }
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

// Wait until a save or a check has finished: the status is no longer "Saving…".
export const settled = (page) => page.waitFor(() => { const s = [...document.querySelectorAll('.src.source-pane .src-msg')].find(m => !m.hidden); return s && !/Saving/.test(s.textContent) && !document.querySelector('.src-bar button:disabled') }, { timeout: 30000 })

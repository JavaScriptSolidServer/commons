// Shared by the settings tests: where things are, a fresh copy of Alice's sample on the pod,
// and helpers that open the pane and read what it shows.
import { LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { cpSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PANE = LAB + 'settings/settings-pane.js'
export const PORT = 9529
export const DATA_DIR = path.join(config.podDir, 'public', 'suite-data', 'settings')
export const DATA = POD + 'public/suite-data/settings/'
export const ALICE = DATA + 'alice/card.ttl#me'
export const ALICE_PREFS = DATA + 'alice/prefs.ttl'
export const BOB = DATA + 'bob/card.ttl#me' // someone else: readable, not editable by the test user
export const DAVE = DATA + 'dave/card.jsonld#me' // JSON-LD with an inline key, an inline email, a list: what a PATCH loses
export const DAVE_PREFS = DATA + 'dave/prefs.jsonld'
export const CONTACT = DATA + 'contact/card.ttl#this' // a contact card: person-typed, editable, not a WebID profile
export const REAL = POD + 'profile/card.jsonld#me' // the test user's own profile: read, never written

// Alice's profile, preferences and public type index, and Bob's read-only profile, put back as they
// are in samples/ (written straight to disk, in this lab's own pod folder).
export function freshAlice () {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const who of ['alice', 'bob', 'dave', 'contact']) {
    const to = path.join(DATA_DIR, who)
    rmSync(to, { recursive: true, force: true })
    cpSync(path.join(HERE, '..', 'samples', who), to, { recursive: true })
  }
}

// Open the pane on what the page shows: it must be among the panes offered for it (its label said yes).
// The page may draw the subject again once the login and the tool index settle: if it does, open again.
export async function openPane (page, uri) {
  let result = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt ? 1500 : 2500)
    result = await page.waitFor((u) => {
      const provider = [...document.querySelectorAll('solid-ui-file-explorer-provider')].find(p => p.subjectUri === u && p.relevantPanes)
      if (!provider) return false
      const names = provider.relevantPanes.map(p => p.name)
      if (!names.includes('settings-lab')) return 'not offered: ' + names.join(',')
      if (!provider.querySelector('.set.settings-pane')) provider.openPane($rdf.sym(u), 'settings-lab')
      return 'ok'
    }, { timeout: 40000, args: [uri] })
    if (result !== 'ok') return result
    const ready = await page.waitFor(() => { const s = document.querySelector('.set.settings-pane .set-say'); return !!document.querySelector('.set-overview .set-item') && s && !/Checking/.test(s.textContent) }, { timeout: 20000 }).catch(() => false)
    await sleep(1000)
    if (ready && await page.evaluate(() => !!document.querySelector('.set-overview .set-item'))) return 'ok'
  }
  return 'the pane did not stay open'
}

// The panes the page offers for a subject, once it has decided.
export function offered (page, uri) {
  return page.waitFor((u) => {
    const provider = [...document.querySelectorAll('solid-ui-file-explorer-provider')].find(p => p.subjectUri === u && p.relevantPanes)
    return provider ? provider.relevantPanes.map(p => p.name).join(',') || '(none)' : false
  }, { timeout: 40000, args: [uri] })
}

// What the pane shows: overview rows (item, value, state, help), apps (origin, level, words), switches.
export function seen (page) {
  return page.evaluate(() => {
    const q = (s, r = document) => r.querySelector(s)
    return {
      title: q('.set-title').textContent,
      status: q('.set-say').className + ' :: ' + q('.set-say').textContent,
      rows: [...document.querySelectorAll('.set-overview .set-item')].map(r => ({ item: r.dataset.item, value: q('.set-value', r).textContent, state: q('.set-chip', r).dataset.state, help: (q('.set-help', r) || { textContent: '' }).textContent, links: [...r.querySelectorAll('a')].map(a => a.href) })),
      apps: [...document.querySelectorAll('.set-app')].map(a => ({ origin: a.dataset.origin, level: (q('.set-level', a) || {}).value, words: q('.set-can', a).textContent })),
      switches: Object.fromEntries([...document.querySelectorAll('.set-switch-row')].map(r => [r.dataset.role, String(q('.set-switch input', r).checked) + (q('.set-switch input', r).disabled ? ' disabled' : '')])),
      empty: !!q('.set-apps .set-empty-line'),
      wide: document.documentElement.scrollWidth > innerWidth
    }
  })
}

// Wait until a change has been saved (or refused) and the pane has drawn again.
export const settled = (page) => page.waitFor(() => /set-(good|bad)/.test(document.querySelector('.set-say').className) && !document.querySelector('.set button:disabled:not(.set-switch)'), { timeout: 30000 })
export const statusText = (page) => page.evaluate(() => document.querySelector('.set-say').className + ' :: ' + document.querySelector('.set-say').textContent)

// A document as the pod serves it now, read into a fresh graph in the page: every statement as N-Triples
// lines (blank nodes renamed so two reads compare), and the trusted apps as { origin: 'Mode Mode' }.
export function podGraph (page, address, person) {
  return page.evaluate(async (args) => {
    const [url, who] = args
    const response = await fetch(url, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
    const text = await response.text()
    const graph = $rdf.graph()
    $rdf.parse(text, graph, url, (response.headers.get('content-type') || 'text/turtle').split(';')[0])
    const ACL = 'http://www.w3.org/ns/auth/acl#'
    const apps = {}
    for (const app of graph.each($rdf.sym(who), $rdf.sym(ACL + 'trustedApp'))) {
      const origin = graph.any(app, $rdf.sym(ACL + 'origin'))
      apps[origin ? origin.value : '?'] = graph.each(app, $rdf.sym(ACL + 'mode')).map(m => m.value.replace(ACL, '')).sort().join(' ')
    }
    const lines = graph.statements.map(s => [s.subject, s.predicate, s.object].map(t => t.termType === 'BlankNode' ? '_:b' : t.toNT()).join(' ')).sort()
    return { status: response.status, apps, lines }
  }, [address, person])
}

// Scroll the part of the pane to the middle of the view (whatever element scrolls), then take a picture.
export async function shotOf (page, shot, selector, name) {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel)
    if (!target) return
    let box = target.parentElement
    while (box && !(box.scrollHeight > box.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    const scroller = box || document.scrollingElement
    const top = target.getBoundingClientRect().top - (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top)
    scroller.scrollTop += top - 80
  }, selector)
  await sleep(400)
  await shot(name)
}

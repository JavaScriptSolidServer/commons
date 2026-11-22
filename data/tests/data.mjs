// The data pane, logged in, at one width (node tests/data.mjs 1300 | 400):
// it is offered but does not take over; Alice's properties, formatted and grouped; nested and
// list values; links that browse; Linked from with "show more"; a document's things; Turtle and
// JSON-LD with Copy; the caps on a big file; loading, 401/403/404 and "nothing known"; a reload
// reads the same; nothing on the pod changes; no sideways scroll.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { open, LAB, POD, config, sleep } from '../../lib/lib.mjs'
import { view, menuData, direct, realClick } from './helpers.mjs'

const width = Number(process.argv[2] || 1300)
const PANE = LAB + 'data/data-pane.js'
const BASE = POD + 'public/suite-data/data/'
const ALICE = BASE + 'people.ttl#alice'
const onDisk = (f) => readFileSync(path.join(config.podDir, 'public', 'suite-data', 'data', f), 'utf8')
const before = ['people.ttl', 'project.jsonld', 'big.ttl', 'odd.ttl'].map(onDisk).join('\n')

const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9533, dir: import.meta.dirname, width, resource: BASE + 'people.ttl' })
const W = width + ' px: '
try {
  // A data file: SolidOS's own view opens first, and Data is one of the choices in its menu.
  await page.waitFor(() => !!document.querySelector('#OutlineView .paneDiv'), { timeout: 30000 })
  await sleep(2500)
  check(W + 'it does not take focus', await page.evaluate(() => !document.querySelector('.data-pane') && panes.byName('data-lab').shouldGetFocus() === false && panes.byName('data-lab').label() === 'Data'))
  check(W + 'it is offered in the pane menu as "Data"', await page.evaluate(menuData), 'menu item')
  await page.waitFor(() => document.querySelector('.data-pane')?.dataset.state === 'ready', { timeout: 20000 })
  check(W + 'chosen from the menu, it shows the document', await page.evaluate(() => document.querySelector('.data-pane .dat-title').textContent) === 'The Example Walking Club')
  // Alice is a person, so the profile pane would open first; show her with this pane.
  await view(page, ALICE)

  let seen = await page.evaluate(() => {
    const root = document.querySelector('.data-pane')
    const rows = [...root.querySelectorAll('[data-part=about] > .dat-rows > .dat-prop')]
    const row = (name) => rows.find(r => r.querySelector('.dat-key').firstChild.textContent === name)
    const vals = (name) => [...(row(name)?.querySelector('.dat-vals').children || [])].map(li => li.textContent)
    return {
      title: root.querySelector('.dat-title').textContent,
      chips: [...root.querySelectorAll('.dat-types .dat-chip')].map(c => c.textContent),
      order: rows.map(r => r.querySelector('.dat-key').firstChild.textContent),
      keyTitle: row('Birth date')?.querySelector('.dat-key').title,
      birth: vals('Birth date')[0], birthRaw: row('Birth date')?.querySelector('.dat-val').title,
      walks: vals('Walks completed')[0], pace: vals('Average pace')[0],
      member: vals('Is member')[0], news: vals('Wants newsletter')[0],
      comments: [...row('Comment').querySelectorAll('.dat-tag')].map(t => t.textContent),
      colours: [...row('Favourite colours').querySelectorAll('ol > li')].map(li => li.textContent),
      knows: [...row('Knows').querySelectorAll('a')].map(a => a.textContent + '|' + a.getAttribute('href') + '|' + a.rel),
      email: row('Email').querySelector('a')?.getAttribute('href'),
      urn: row('Same in').querySelector('a') ? 'link' : row('Same in').querySelector('.dat-vals').textContent,
      nested: (() => { const n = row('Has address').querySelector('.dat-nest'); return n && { depth: row('Has address').querySelectorAll('.dat-nest').length, rows: [...n.querySelectorAll(':scope > .dat-rows > .dat-prop > .dat-key')].map(k => k.firstChild.textContent), surveyed: [...n.querySelectorAll('a')].map(a => a.textContent) } })(),
      breaks: rows.filter(r => r.classList.contains('dat-break')).map(r => r.querySelector('.dat-key').firstChild.textContent)
    }
  })
  check(W + 'title and types, told apart', seen.title === 'Alice Example' && seen.chips.join() === 'Person (foaf),Person (schema)', seen.chips.join())
  check(W + 'type and names first, then text and numbers, then links', seen.order.slice(0, 3).join() === 'Type,Name,Nickname' && seen.order.indexOf('Walks completed') < seen.order.indexOf('Email') && seen.order.indexOf('Average pace') > 2 && seen.breaks.join() === 'Average pace,Email', seen.order.join(', '))
  check(W + 'property names readable, full URI on hover, rdfs:label used', seen.keyTitle === 'http://schema.org/birthDate' && seen.order.includes('Favourite colours') && seen.order.includes('Has address'), seen.keyTitle)
  check(W + 'date, numbers and booleans formatted', seen.birth !== '1990-04-12' && /1990/.test(seen.birth) && seen.birthRaw === '1990-04-12' && seen.walks === '1,250' && seen.pace === '4.75' && seen.member === 'Yes' && seen.news === 'No', [seen.birth, seen.walks, seen.member, seen.news].join(' | '))
  check(W + 'language tags shown small', seen.comments.sort().join() === 'cs,en')
  check(W + 'an RDF list is an ordered list', seen.colours.join() === 'red,green,deep blue')
  check(W + 'links named, real hrefs, rel=noopener', seen.knows.length === 2 && seen.knows.every(k => /people\.ttl#(bob|carol)\|noopener$/.test(k)) && /^Bob Example\|/.test(seen.knows[0]) && seen.email === 'mailto:alice@example.com', seen.knows.join(' '))
  check(W + 'a urn is shown as text, not a link', seen.urn === 'urn:example:member:42', seen.urn)
  check(W + 'blank nodes nested, three deep', seen.nested && seen.nested.depth === 3 && seen.nested.rows.join() === 'Type,Locality,Street address,Location' && seen.nested.surveyed.includes('Carol Example'), JSON.stringify(seen.nested))
  await shot('alice-' + width)

  // Linked from: who points at Alice, capped.
  seen = await page.evaluate(() => {
    const part = document.querySelector('.data-pane [data-part=linked]')
    const row = [...part.querySelectorAll('.dat-prop')].find(r => r.querySelector('.dat-key').firstChild.textContent === 'Organizer')
    const before = row.querySelectorAll('li').length
    row.querySelector('.dat-more').click()
    return { keys: [...part.querySelectorAll('.dat-key')].map(k => k.firstChild.textContent), before, after: row.querySelectorAll('li').length, more: !!row.querySelector('.dat-more') }
  })
  check(W + 'Linked from, grouped by property', seen.keys.join() === 'Knows,Mentor,Organizer', seen.keys.join())
  check(W + 'Linked from capped, "show more" shows the rest', seen.before === 8 && seen.after === 12 && !seen.more, seen.before + ' then ' + seen.after)

  // A link browses in place.
  await page.evaluate(() => [...document.querySelectorAll('.data-pane [data-part=about] a')].find(a => a.textContent === 'Bob Example').click())
  await page.waitFor(() => new URLSearchParams(location.search).get('uri')?.endsWith('#bob'), { timeout: 15000 })
  check(W + 'a link opens the thing in the data browser', true)

  // The document: the things in it, and the text.
  await view(page, BASE + 'people.ttl')
  seen = await page.evaluate(() => {
    const part = document.querySelector('.data-pane [data-part=things]')
    const items = [...part.querySelectorAll('.dat-thing')]
    return { head: part.querySelector('.dat-h').textContent, n: items.length, first: items[0].textContent, links: items.every(li => li.querySelector('a[href]')), about: document.querySelector('.data-pane [data-part=about] .dat-key')?.textContent }
  })
  check(W + 'In this document: every thing, a link, with its type', seen.n === 16 && /16 things/.test(seen.head) && /^Alice Example.*Person \(foaf\).*Person \(schema\).*19 statements/.test(seen.first) && seen.links, seen.head + ' / ' + seen.first)
  await page.evaluate(() => document.querySelector('.data-pane [data-part=text] button[data-type="text/turtle"]').click())
  await page.waitFor(() => !!document.querySelector('.data-pane .dat-pre'))
  seen = await page.evaluate(() => ({ head: document.querySelector('.data-pane [data-part=text] .dat-h').textContent, text: document.querySelector('.dat-pre').textContent, bar: document.querySelector('.dat-what').textContent }))
  check(W + 'As text: Turtle, with the statement count', /88 statements/.test(seen.head) && /^:alice$/m.test(seen.text) && /"Alice Example"/.test(seen.text) && /^Turtle, \d+ lines$/.test(seen.bar), seen.head + ' / ' + seen.bar)
  await realClick(page, '.data-pane .dat-copy')
  await page.waitFor(() => document.querySelector('.data-pane .dat-copy').textContent !== 'Copy', { timeout: 5000 })
  await page.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  seen = await page.evaluate(async () => ({ said: document.querySelector('.data-pane .dat-copy').textContent, same: (await navigator.clipboard.readText()) === document.querySelector('.dat-pre').textContent }))
  check(W + 'Copy puts the Turtle on the clipboard', seen.said === 'Copied' && seen.same, JSON.stringify(seen))
  await page.evaluate(() => document.querySelector('.data-pane [data-part=text] button[data-type="application/ld+json"]').click())
  await page.waitFor(() => /^JSON-LD/.test(document.querySelector('.data-pane .dat-what')?.textContent || ''))
  seen = await page.evaluate(() => { const t = document.querySelector('.dat-pre').textContent; let ok = false; try { ok = !!JSON.parse(t) } catch {} return { ok, pretty: t.split('\n').length > 20, alice: t.includes('Alice Example'), pressed: [...document.querySelectorAll('.dat-toggle')].map(b => b.getAttribute('aria-pressed')).join() } })
  check(W + 'As text: JSON-LD, pretty and valid', seen.ok && seen.pretty && seen.alice && seen.pressed === 'false,true', JSON.stringify(seen))
  await sleep(300)
  await shot('document-' + width)
  await page.evaluate(() => document.querySelector('.data-pane [data-part=text] button[data-type="application/ld+json"]').click())
  check(W + 'pressing it again hides the text', await page.evaluate(() => document.querySelector('.data-pane .dat-text').hidden))

  // A big document: capped lists and text.
  await view(page, BASE + 'big.ttl')
  seen = await page.evaluate(() => { const p = document.querySelector('.data-pane [data-part=things]'); return { head: p.querySelector('.dat-h').textContent, n: p.querySelectorAll('.dat-thing').length, more: p.querySelector('.dat-more')?.textContent } })
  check(W + 'a big document: 40 things at a time', /1,500 things/.test(seen.head) && seen.n === 40 && seen.more === 'Show 40 more of 1,460', JSON.stringify(seen))
  await page.evaluate(() => document.querySelector('.data-pane [data-part=things] .dat-more').click())
  check(W + 'show more adds 40', await page.evaluate(() => document.querySelectorAll('.data-pane .dat-thing').length) === 80)
  await page.evaluate(() => document.querySelector('.data-pane [data-part=text] button[data-type="text/turtle"]').click())
  await page.waitFor(() => !!document.querySelector('.data-pane .dat-pre'), { timeout: 30000 })
  seen = await page.evaluate(() => ({ head: document.querySelector('.data-pane [data-part=text] .dat-h').textContent, bar: document.querySelector('.dat-what').textContent, lines: document.querySelector('.dat-pre').textContent.split('\n').length }))
  check(W + 'a big document: the text is capped and says so', /6,000 statements/.test(seen.head) && /showing the first 1,500 lines; Copy takes all of it/.test(seen.bar) && seen.lines === 1500, seen.head + ' / ' + seen.bar)
  await realClick(page, '.data-pane .dat-copy')
  await page.waitFor(() => document.querySelector('.data-pane .dat-copy').textContent === 'Copied', { timeout: 5000 })
  const copied = await page.evaluate(() => navigator.clipboard.readText().then(t => t.split('\n').length))
  check(W + 'a big document: Copy takes all of it', copied > 7000, copied + ' lines copied')
  await shot('big-' + width)

  // JSON-LD data, linking to people in another document.
  await view(page, BASE + 'project.jsonld#map')
  seen = await page.evaluate(() => ({ title: document.querySelector('.dat-title').textContent, text: document.querySelector('[data-part=about]').textContent, linked: document.querySelector('[data-part=linked]')?.textContent || '' }))
  check(W + 'JSON-LD data reads the same way', seen.title === 'Trail map' && /Carol Example/.test(seen.text) && /Keywords · 3/.test(seen.text) && /Walk leader guide/.test(seen.linked), seen.text.slice(0, 120))

  // Odd values: exact big integers, no rolled-over dates, a long value cut with a button for the rest.
  await view(page, BASE + 'odd.ttl#x')
  seen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.data-pane [data-part=about] > .dat-rows > .dat-prop')]
    const val = (name) => rows.find(r => r.querySelector('.dat-key').firstChild.textContent === name)?.querySelector('.dat-val')
    const long = val('Long')
    return { counter: val('Counter').firstChild.textContent, huge: val('Huge').firstChild.textContent, bad: val('Bad').firstChild.textContent, badTime: val('Bad time').firstChild.textContent, early: val('Early').firstChild.textContent, longLen: long.firstChild.textContent.length, button: long.querySelector('.dat-long')?.textContent, height: Math.round(long.getBoundingClientRect().height) }
  })
  check(W + 'a 20-digit integer is shown exactly', seen.counter === (12345678901234567890n).toLocaleString(), seen.counter)
  check(W + 'a double too big for a number is shown as written', seen.huge === '1e400', seen.huge)
  check(W + 'impossible dates are shown as written, not rolled over', seen.bad === '2024-02-30' && seen.badTime === '2023-02-30T10:00:00Z', seen.bad + ' | ' + seen.badTime)
  check(W + 'a date in the year 90 stays in the year 90', /\b90\b/.test(seen.early) && !/1990/.test(seen.early), seen.early)
  check(W + 'a 300,000-character value is cut at 2,000 with "Show all"', seen.longLen === 2001 && seen.button === 'Show all 300,000 characters' && seen.height < 2000, JSON.stringify({ len: seen.longLen, b: seen.button, h: seen.height }))
  await page.evaluate(() => document.querySelector('.data-pane .dat-long').click())
  check(W + '"Show all" shows the whole value', await page.evaluate(() => !document.querySelector('.data-pane .dat-long') && [...document.querySelectorAll('.data-pane .dat-val')].some(v => v.firstChild.textContent.length === 300000)))
  await view(page, BASE + 'people.ttl')
  check(W + 'type chips in the document\'s rows keep the sheet\'s 28 px', await page.evaluate(() => [...document.querySelectorAll('.data-pane .dat-thing .dat-chip')].every(c => c.getBoundingClientRect().height >= 28)))

  // Nothing known; and the states.
  await view(page, BASE + 'people.ttl#nobody')
  seen = await page.evaluate(() => ({ text: document.querySelector('[data-part=nothing]')?.textContent, asText: !!document.querySelector('[data-part=text]') }))
  check(W + 'nothing known: says so, offers the document as text', /^Nothing is known about this here\. Its document, people\.ttl, holds 88 statements/.test(seen.text || '') && seen.asText, seen.text)
  await shot('nothing-' + width)
  seen = await direct(page, BASE + 'private/notes.ttl#diary')
  check(W + 'not loaded yet: a quiet loading state, then the data (owner-only file)', seen === "loading|Loading notes.ttl… -> ready||Alice's diary", seen)
  await view(page, BASE + 'missing.ttl#x', 'failed')
  const note = await page.evaluate(() => document.querySelector('.data-pane .dat-bad')?.textContent)
  check(W + '404 says why', /^There is no document at .*missing\.ttl \(404\)\.$/.test(note || ''), note)
  // The browser shows its own "Access denied" for 401 and 403 before any pane is drawn: draw it directly.
  seen = await direct(page, BASE + 'forbidden/notes.ttl#diary')
  check(W + '403 says why', seen === 'loading|Loading notes.ttl… -> failed|You are not allowed to read notes.ttl (403).|diary', seen)
  await shot('forbidden-' + width)

  // Each view, no sideways scroll; and at 400 px the two columns stack.
  for (const uri of [ALICE, BASE + 'people.ttl', BASE + 'big.ttl']) {
    await view(page, uri)
    seen = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth, cols: getComputedStyle(document.querySelector('.data-pane .dat-prop')).gridTemplateColumns.split(' ').length }))
    check(W + 'no sideways scroll on ' + uri.slice(BASE.length) + (width <= 500 ? ', columns stacked' : ', two columns'), !seen.wide && seen.cols === (width <= 500 ? 1 : 2), JSON.stringify(seen))
  }

  // A reload reads back the same, and the pane wrote nothing.
  await page.goto(address(BASE + 'people.ttl'))
  await page.waitFor(() => !!document.querySelector('#OutlineView .paneDiv'), { timeout: 30000 })
  await sleep(2500)
  await page.evaluate(menuData)
  await page.waitFor(() => document.querySelector('.data-pane')?.dataset.state === 'ready', { timeout: 20000 })
  await view(page, ALICE)
  const rows = await page.evaluate(() => document.querySelectorAll('.data-pane [data-part=about] > .dat-rows > .dat-prop').length)
  check(W + 'after a reload, the same rows', rows === 16, rows + ' rows')
  check(W + 'read-only: the pod files are unchanged', ['people.ttl', 'project.jsonld', 'big.ttl', 'odd.ttl'].map(onDisk).join('\n') === before)
} catch (error) { await finish(error) }
await finish()

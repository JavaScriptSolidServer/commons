// The data pane with nobody logged in, at one width (node tests/loggedout.mjs 1300 | 400):
// public data reads the same; an owner-only file says to log in (401); no sideways scroll.
import { open, LAB, POD } from '../../lib/lib.mjs'
import { view, direct } from './helpers.mjs'

const width = Number(process.argv[2] || 1300)
const BASE = POD + 'public/suite-data/data/'
const { page, check, finish, shot } = await open({ pane: LAB + 'data/data-pane.js', port: 9533, dir: import.meta.dirname, width, login: false, fresh: true, resource: BASE + 'people.ttl' })
const W = width + ' px, logged out: '
try {
  await page.waitFor(() => !!document.querySelector('#OutlineView .paneDiv'), { timeout: 30000 })
  await view(page, BASE + 'people.ttl#alice')
  const seen = await page.evaluate(() => ({ title: document.querySelector('.dat-title').textContent, rows: document.querySelectorAll('.data-pane [data-part=about] > .dat-rows > .dat-prop').length, linked: document.querySelectorAll('.data-pane [data-part=linked] .dat-prop').length, wide: document.documentElement.scrollWidth > innerWidth }))
  check(W + 'public data reads the same', seen.title === 'Alice Example' && seen.rows === 16 && seen.linked === 3, JSON.stringify(seen))
  check(W + 'no sideways scroll', !seen.wide)
  await shot('loggedout-' + width)
  const said = await direct(page, BASE + 'private/notes.ttl#diary')
  check(W + 'an owner-only file: 401, log in', said === 'loading|Loading notes.ttl… -> failed|You need to log in to read notes.ttl (401).|diary', said)
  check(W + 'no sideways scroll on the 401', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
} catch (error) { await finish(error) }
await finish()

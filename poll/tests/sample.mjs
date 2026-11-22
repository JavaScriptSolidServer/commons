// The sample, read without logging in: the hours under their days, the counts, the best hour, names.
// Once at 1300 px, then at a true 400 px (design/viewport.mjs). Browser on port 9523.
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'poll/poll-pane.js'
const SAMPLE = LAB + 'poll/samples/call/index.ttl#this'
const { page, check, finish, shot } = await open({ pane: PANE, port: 9523, dir: import.meta.dirname, login: false, fresh: true, resource: SAMPLE })
try {
  for (const width of [1300, 400]) {
    if (width === 400) { await narrow(page); await sleep(300) }
    await page.waitFor(() => document.querySelectorAll('.pol-option').length === 6 && document.querySelectorAll('.pol-who .pol-chip').length > 0, { timeout: 40000 })
    await page.waitFor(() => /By Alice/.test(document.querySelector('.pol-meta').textContent), { timeout: 15000 }).catch(() => {})
    const seen = await page.evaluate(() => ({ title: document.querySelector('.pol-title').textContent, meta: document.querySelector('.pol-meta').textContent, days: [...document.querySelectorAll('.pol-day')].map(d => d.textContent), zone: document.querySelector('.pol-zone').textContent, options: [...document.querySelectorAll('.pol-option')].map(o => o.querySelector('.pol-name').textContent + '|' + o.querySelector('.pol-count').textContent + '|' + (o.classList.contains('pol-lead') ? 'lead' : '') + '|' + [...o.querySelectorAll('.pol-who .pol-chip')].map(c => c.textContent).join(', ')), buttons: document.querySelectorAll('.pol-choose button').length, status: document.querySelector('.pol-status').textContent }))
    check(width + ' px: title and people', seen.title === 'Call about the tool index' && /By Alice · 3 people have answered/.test(seen.meta), seen.meta)
    check(width + ' px: two days of hours, then the other choice', seen.days.length === 3 && /3/.test(seen.days[0]) && /4/.test(seen.days[1]) && seen.days[2] === 'Also to decide' && seen.options.slice(0, 5).every(o => / to /.test(o.split('|')[0])) && /^Record the call/.test(seen.options[5]), seen.days.join(' / '))
    check(width + ' px: it names the time zone', /your time zone: \S+/.test(seen.zone), seen.zone)
    check(width + ' px: the hour everyone can make is the best so far', /\|3 yes\|lead\|Alice, Bob, Carol$/.test(seen.options[1]) && seen.options.filter(o => /\|lead\|/.test(o)).length === 1, seen.options[1])
    check(width + ' px: if need be is counted apart', /\|1 yes · 1 if need be\|\|Carol, Alice \(if need be\)$/.test(seen.options[3]), seen.options[3])
    check(width + ' px: logged out, nothing to press, and it says so', seen.buttons === 0 && /Log in to say when/.test(seen.status), seen.buttons + ' ' + seen.status)
    const m = await measure(page)
    check(width + ' px' + (width === 400 ? ' (true, device metrics)' : '') + ': no sideways scroll', !m.sideways, JSON.stringify(m))
    await shot('sample-' + width)
  }
  await finish()
} catch (error) { await finish(error) }

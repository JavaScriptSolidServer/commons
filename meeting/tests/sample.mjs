// The sample, read without logging in, at 1300 and a true 400 px (design/viewport.mjs): the header card, the list in
// order, the calendar file.
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'meeting/meeting-pane.js'
const SAMPLE = LAB + 'meeting/samples/planning/index.ttl#this'
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9536, dir: import.meta.dirname, width, login: false, fresh: true, resource: SAMPLE })
  try {
    if (width === 400) await narrow(page)
    await page.waitFor(() => document.querySelectorAll('.mtg.meeting-pane .mtg-item').length === 4, { timeout: 40000 })
    await sleep(1500)
    const seen = await page.evaluate(() => {
      const facts = {}
      for (const f of document.querySelectorAll('.mtg-head [data-fact]')) facts[f.dataset.fact] = (facts[f.dataset.fact] ? facts[f.dataset.fact] + ' ' : '') + [...f.childNodes].filter(n => !(n.classList && n.classList.contains('mtg-sr'))).map(n => n.textContent).join('')
      const card = document.querySelector('.mtg-head')
      const chips = [...card.querySelectorAll('.mtg-chip')].map(c => c.dataset.fact)
      const ics = document.querySelector('a.mtg-ics')
      return {
        title: document.querySelector('.mtg-title').textContent,
        facts,
        items: [...document.querySelectorAll('.mtg-item')].map(li => li.querySelector('.mtg-name').textContent + '|' + li.querySelector('.mtg-kind').textContent + '|' + (li.querySelector('a') ? li.querySelector('a').href : '')),
        buttons: document.querySelectorAll('.mtg button').length,
        forms: document.querySelectorAll('.mtg form').length,
        status: document.querySelector('.mtg-status').textContent,
        ics: ics ? decodeURIComponent(ics.href.replace(/^data:text\/calendar;charset=utf-8,/, '')) : '',
        icsName: ics ? ics.download : '',
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        expect: new Date('2026-12-03T14:00:00Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' to ' + new Date('2026-12-03T15:30:00Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        wide: document.documentElement.scrollWidth > innerWidth,
        look: { chips, card: getComputedStyle(card).borderRadius, font: getComputedStyle(document.querySelector('.mtg.meeting-pane')).fontSize, rows: [...document.querySelectorAll('.mtg-item')].every(r => r.classList.contains('mtg-row') && !!r.querySelector('.mtg-row-icon .mtg-icon')), width: innerWidth }
      }
    })
    check(width + ' px: the title', seen.title === 'Planning the spring workshop', seen.title)
    check(width + ' px: when, in the viewer\'s zone, with the zone named', /December/.test(seen.facts.When) && /2026/.test(seen.facts.When) && seen.facts.When.includes(seen.expect) && seen.facts.When.includes(seen.zone), seen.facts.When)
    check(width + ' px: where, who and notes', /Room 2/.test(seen.facts.Where) && seen.facts.Who === 'Alice, Bob, Carol' && /three talks\.\nBring/.test(seen.facts.Notes), JSON.stringify(seen.facts).slice(0, 200))
    check(width + ' px: every item, in the list\'s order, with its kind', seen.items.map(i => i.split('|').slice(0, 2).join('|')).join(' ; ') === 'Agenda|Web page ; Shared notes|Shared notes ; Chat|Chat ; Last year\'s report|Web page', seen.items.join(' ; '))
    check(width + ' px: each item has a real link', seen.items.every(i => /\|https?:\/\//.test(i)) && /SharedNotes\/index\.ttl#this$/.test(seen.items[1]), seen.items[1])
    check(width + ' px: the calendar file has the meeting\'s own fields', /BEGIN:VEVENT/.test(seen.ics) && /DTSTART:20261203T140000Z/.test(seen.ics) && /DTEND:20261203T153000Z/.test(seen.ics) && /SUMMARY:Planning the spring workshop/.test(seen.ics) && /LOCATION:Room 2\\, Example Hall/.test(seen.ics) && /UID:http/.test(seen.ics) && seen.icsName === 'planning-the-spring-workshop.ics', seen.ics.slice(0, 400).replace(/\r\n/g, ' / '))
    check(width + ' px: calendar lines are folded at 75 bytes', seen.ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75))
    check(width + ' px: logged out, nothing to press or fill, and it says why', seen.buttons === 0 && seen.forms === 0 && /Log in/.test(seen.status), seen.buttons + ' ' + seen.forms + ' ' + seen.status)
    check(width + ' px: a header card with when and where as chips, rows with icons, the suite type scale', seen.look.chips.join() === 'When,Where' && seen.look.card === '12px' && seen.look.font === '15px' && seen.look.rows && seen.look.width === width, JSON.stringify(seen.look))
    const m = await measure(page)
    check(width + ' px: no sideways scroll', !seen.wide && !m.sideways, JSON.stringify(m))
    await shot('sample-' + width)
    if (width === 1300) {
      // A pod item opens in the data browser, in place.
      await page.evaluate(() => document.querySelectorAll('.mtg-item a')[2].click())
      const went = await page.waitFor(() => !document.querySelector('.mtg.meeting-pane') && /Chat\/chat\.ttl/.test(decodeURIComponent(location.href) + ' ' + document.body.textContent) ? decodeURIComponent(location.href) : false, { timeout: 15000 }).catch(e => String(e.message).slice(0, 200))
      check('a pod item opens in the data browser', /chat\.ttl/.test(went), went)
      // The whole row opens it too, not only the name.
      await page.goto(address(SAMPLE))
      await page.waitFor(() => document.querySelectorAll('.mtg.meeting-pane .mtg-item').length === 4, { timeout: 40000 })
      await page.evaluate(() => document.querySelectorAll('.mtg-item')[1].click())
      const row = await page.waitFor(() => !document.querySelector('.mtg.meeting-pane') && /SharedNotes/.test(decodeURIComponent(location.href) + ' ' + document.body.textContent) ? decodeURIComponent(location.href) : false, { timeout: 15000 }).catch(e => String(e.message).slice(0, 200))
      check('a click anywhere on an item\'s row opens it', /SharedNotes/.test(row), row)
    }
    const errors = page.console.filter(l => /exception/.test(l) && /meeting/i.test(l))
    check(width + ' px: no errors from the pane', !errors.length, errors.join(' | ').slice(0, 300))
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

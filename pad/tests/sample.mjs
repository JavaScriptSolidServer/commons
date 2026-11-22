// The sample, read without logging in: title, lines in order, who wrote each, the legend, nothing to edit.
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'pad/pad-pane.js'
const SAMPLE = LAB + 'pad/samples/meeting-notes.ttl#this'
for (const width of [1300, 400]) {
  const { page, check, finish, shot } = await open({ pane: PANE, port: 9521, dir: import.meta.dirname, login: false, fresh: true, resource: SAMPLE })
  try {
    if (width !== 1300) await narrow(page, width) // a true 400 px page (design/viewport.mjs)
    await page.waitFor(() => document.querySelectorAll('.npd-line').length === 8, { timeout: 40000 })
    await sleep(1500)
    const seen = await page.evaluate(() => ({
      title: document.querySelector('.npd-title').textContent,
      meta: document.querySelector('.npd-meta').textContent,
      lines: [...document.querySelectorAll('.npd-line')].map(l => l.title + '|' + l.querySelector('.npd-text').textContent + '|' + l.style.background),
      legend: [...document.querySelectorAll('.npd-who')].map(w => w.textContent),
      inputs: document.querySelectorAll('.npd input, .npd textarea').length,
      hint: document.querySelector('.npd-hint').textContent,
      wide: document.documentElement.scrollWidth > innerWidth
    }))
    check(width + ' px: the title', seen.title === 'Garden club, planning notes', seen.title)
    check(width + ' px: maker, line count and the last writer', /^By Alice · 8 lines · last written by Bob, /.test(seen.meta), seen.meta)
    check(width + ' px: the lines in ring order, each with its author', seen.lines[0].startsWith('Alice|Spring planting') && seen.lines[2].startsWith('Bob|I can lend') && seen.lines[5].startsWith('Carol|Sweet peas') && seen.lines[6].startsWith('Bob|Runner beans'), seen.lines.map(l => l.split('|')[0]).join(','))
    check(width + ' px: lines are tinted by author (the colour each one recorded)', /246, 214, 228/.test(seen.lines[0]) && /214, 239, 200/.test(seen.lines[2]) && /214, 222, 250/.test(seen.lines[4]), seen.lines[0].split('|')[2])
    check(width + ' px: an empty line is kept as a line', seen.lines[3].split('|')[1].trim() === '')
    check(width + ' px: markup in a line is shown as text', seen.lines[7].includes('<before> the end of January & keep'))
    check(width + ' px: the legend says who is who', seen.legend.join(';') === 'Alice3 lines;Bob2 lines;Carol3 lines', seen.legend.join(';'))
    check(width + ' px: logged out, nothing to edit, and it says so', seen.inputs === 0 && /Log in to edit/.test(seen.hint), seen.inputs + ' ' + seen.hint)
    const m = await measure(page)
    check(width + ' px: no sideways scroll', !seen.wide && !m.sideways && m.innerWidth === width, m.poking.join(' '))
    await shot('sample-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

// The sample folder (samples/team.acl.jsonld, put on the pod by setup.mjs) at 1300 and 400 px,
// reusing the login left by sharing.mjs. Reads only, except one Review that is cancelled.
import './free-ports.mjs'
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { reset, disk, BASE, ME } from './setup.mjs'
import { openSharing as openPane } from './open-sharing.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'sharing/sharing-pane.js'
const TEAM = BASE + 'team/'
reset()
const before = disk('team/.acl')
async function openSharing (page, address, uri) {
  await openPane(page, address(uri))
  await sleep(1500) // names from profiles, in the background
}
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9527, dir: import.meta.dirname, login: false, width, resource: TEAM })
  try {
    if (width === 400) await narrow(page) // a true 400 px page (CDP device metrics), not the helper's ~500 px window
    await openSharing(page, address, TEAM)
    const seen = await page.evaluate(() => {
      const r = document.querySelector('.shr.sharing-lab-pane')
      return {
        names: [...r.querySelectorAll('.shr-row:not(.shr-readonly) .shr-name')].map(n => n.textContent),
        readOnly: [...r.querySelectorAll('.shr-readonly')].map(n => n.textContent),
        add: !!r.querySelector('.shr-add'),
        file: r.querySelector('.shr-foot').textContent,
        wide: document.documentElement.scrollWidth > innerWidth,
        clipped: [...r.querySelectorAll('.shr-row, .shr-box, .shr-source, select')].filter(e => e.getBoundingClientRect().right > r.getBoundingClientRect().right + 1).length
      }
    })
    check(width + ' px: names in order, owners first; the test user by the name in their profile', seen.names.join(',') === 'me,alice.example,bob.example,carol.example,Anyone logged in,Everyone', seen.names.join(','))
    check(width + ' px: the group and app rules are shown in words', /Group: https:\/\/alice\.example\/groups\/friends#group/.test(seen.readOnly.join()) && /Only when using the app at https:\/\/notes\.example/.test(seen.readOnly.join()), seen.readOnly.join(' | '))
    check(width + ' px: the rules file is named', /team\/\.acl/.test(seen.file), seen.file)
    check(width + ' px: no sideways scroll, and nothing pokes out of the pane', !seen.wide && !seen.clipped, seen.clipped + ' element(s) too wide')
    const m = await measure(page)
    check(width + ' px: measured, nothing past the right edge', !m.sideways && !m.poking.length && (width !== 400 || m.innerWidth === 400), m.innerWidth + ' ' + m.poking.join(' '))
    await shot('team-' + width)
    await page.evaluate(() => { const s = [...document.querySelectorAll('.shr-row')].find(r => r.dataset.key.startsWith('public')).querySelector('select'); s.value = 'view'; s.dispatchEvent(new Event('change')) })
    await page.evaluate(() => [...document.querySelectorAll('.shr button')].find(b => b.textContent === 'Review and save').click())
    await sleep(800)
    check(width + ' px: the review fits too', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && /Everyone can now view, in this folder and everything inside/.test(document.querySelector('.shr-review').textContent)))
    await shot('team-review-' + width)
    await page.evaluate(() => document.querySelector('.shr-cancel').click())
    check(width + ' px: cancelled, so the pod file is unchanged', disk('team/.acl') === before)
    await openSharing(page, address, BASE + 'note.ttl')
    check(width + ' px: an inherited file fits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && /follows the rules/.test(document.querySelector('.shr-source').textContent)))
    await shot('inherited-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

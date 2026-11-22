// The sample book, read without logging in: the list, the groups, a person, a card opened alone.
//   node tests/sample.mjs
import { open, LAB, sleep } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
const PANE = LAB + 'contacts/contacts-pane.js'
const BOOK = LAB + 'contacts/samples/book/index.ttl#this'
const BOB = LAB + 'contacts/samples/book/Person/bob/index.ttl#this'

for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ pane: PANE, port: 9515, dir: import.meta.dirname, width, login: false, fresh: true, resource: BOOK })
  try {
    if (width === 400) await narrow(page) // a true 400 px page (design/viewport.mjs), not the helper's ~500 px window
    const sideways = async (what) => { const m = await measure(page); check(width + ' px: no sideways scroll (measured) ' + what, !m.sideways && m.innerWidth === (width === 400 ? 400 : m.innerWidth), m.innerWidth + '/' + m.scrollWidth + ' ' + m.poking.join(' ')) }
    await page.waitFor(() => document.querySelectorAll('.ctc-row').length === 3 && /Example University/.test(document.querySelector('.ctc-list').textContent), { timeout: 40000 })
    await sleep(800)
    const list = await page.evaluate(() => ({
      title: document.querySelector('.ctc-book').textContent,
      count: document.querySelector('.ctc-count').textContent,
      rows: [...document.querySelectorAll('.ctc-row')].map(r => r.querySelector('.ctc-row-title').textContent + '|' + r.querySelector('.ctc-row-sub').textContent),
      chips: [...document.querySelectorAll('.ctc-chips .ctc-chip')].map(c => c.textContent),
      tools: document.querySelectorAll('.ctc-add, .ctc-new-group, .ctc-edit, .ctc-delete').length,
      status: document.querySelector('.ctc-msg').textContent,
      wide: document.documentElement.scrollWidth > innerWidth
    }))
    check(width + ' px: title and count', list.title === 'Sample contacts' && list.count === '3 people', list.title + ' / ' + list.count)
    check(width + ' px: people in order, with role and organisation', list.rows.join(';') === 'Alice Example|Mathematician · Example University;Bob Builder|Site manager · Example Works Ltd;Carol Danvers|Pilot', list.rows.join(';'))
    check(width + ' px: groups as chips', list.chips.join(',') === 'All contacts,Friends,Work', list.chips.join(','))
    check(width + ' px: logged out, no controls to change anything, and it says so', list.tools === 0 && /Log in/.test(list.status), list.tools + ' ' + list.status)
    check(width + ' px: no sideways scroll on the list', !list.wide)
    if (width === 400) check('400 px: the list shows first, no detail beside it', await page.evaluate(() => getComputedStyle(document.querySelector('.ctc-main')).display === 'none'))
    await sideways('on the list')
    await shot('sample-list-' + width)

    // Filter by group: Friends holds Alice directly and Carol by her WebID.
    await page.evaluate(() => [...document.querySelectorAll('.ctc-chips .ctc-chip')].find(c => c.textContent === 'Friends').click())
    const friends = await page.evaluate(() => [...document.querySelectorAll('.ctc-row-title')].map(n => n.textContent).join(','))
    check(width + ' px: the Friends chip shows Alice, and Carol by her WebID', friends === 'Alice Example,Carol Danvers', friends)
    await page.evaluate(() => [...document.querySelectorAll('.ctc-chips .ctc-chip')].find(c => c.textContent === 'All contacts').click())
    // Search reaches email and work as well as names.
    await page.evaluate(() => { const s = document.querySelector('.ctc-search input'); s.value = 'example works'; s.dispatchEvent(new Event('input')) })
    const found = await page.evaluate(() => [...document.querySelectorAll('.ctc-row-title')].map(n => n.textContent).join(','))
    await page.evaluate(() => { const s = document.querySelector('.ctc-search input'); s.value = 'carol@'; s.dispatchEvent(new Event('input')) })
    const byMail = await page.evaluate(() => [...document.querySelectorAll('.ctc-row-title')].map(n => n.textContent).join(','))
    await page.evaluate(() => { const s = document.querySelector('.ctc-search input'); s.value = 'zzz'; s.dispatchEvent(new Event('input')) })
    const none = await page.evaluate(() => document.querySelector('.ctc-list').textContent)
    check(width + ' px: search by organisation, by email, and no match', found === 'Bob Builder' && byMail === 'Carol Danvers' && none === 'No one matches.', found + ' / ' + byMail + ' / ' + none)
    await page.evaluate(() => { const s = document.querySelector('.ctc-search input'); s.value = ''; s.dispatchEvent(new Event('input')) })

    // Bob: everything known.
    await page.evaluate(() => [...document.querySelectorAll('.ctc-row')].find(r => /Bob/.test(r.textContent)).click())
    await page.waitFor(() => !!document.querySelector('.ctc-person'), { timeout: 10000 })
    await sleep(600)
    const bob = await page.evaluate(() => {
      const p = document.querySelector('.ctc-person')
      return {
        name: p.querySelector('.ctc-name').textContent,
        sub: p.querySelector('.ctc-sub').textContent,
        photo: !!p.querySelector('img.ctc-avatar') && p.querySelector('img.ctc-avatar').naturalWidth > 0,
        links: [...p.querySelectorAll('a')].map(a => a.getAttribute('href') + '|' + a.rel),
        facts: [...p.querySelectorAll('dt')].map(d => d.textContent),
        text: p.textContent,
        tools: p.querySelectorAll('.ctc-edit, .ctc-delete, .ctc-x, .ctc-pick').length,
        listHidden: getComputedStyle(document.querySelector('.ctc-side')).display === 'none',
        wide: document.documentElement.scrollWidth > innerWidth
      }
    })
    check(width + ' px: Bob by name, role and organisation, with his photo', bob.name === 'Bob Builder' && bob.sub === 'Site manager · Example Works Ltd' && bob.photo, JSON.stringify([bob.name, bob.sub, bob.photo]))
    check(width + ' px: emails and phone as mailto: and tel: links, web site, all rel=noopener', ['mailto:bob@example.com|noopener', 'mailto:bob.home@example.net|noopener', 'tel:+420-555-0100|noopener', 'https://bob.example.com/|noopener'].every(l => bob.links.includes(l)), bob.links.join(' '))
    check(width + ' px: address and group shown', /1 Example Street/.test(bob.text) && /110 00 Prague/.test(bob.text) && /Czechia/.test(bob.text) && bob.facts.includes('Groups') && /Work/.test(bob.text), bob.facts.join(','))
    check(width + ' px: nothing to change when logged out', bob.tools === 0)
    check(width + ' px: no sideways scroll on a person', !bob.wide)
    if (width === 400) check('400 px: the person replaces the list, with a way back', bob.listHidden && await page.evaluate(() => getComputedStyle(document.querySelector('.ctc-back')).display !== 'none'))
    await sideways('on a person')
    await shot('sample-person-' + width)

    // Carol: initials, WebID link, notes elsewhere.
    if (width === 400) await page.evaluate(() => document.querySelector('.ctc-back').click())
    await page.evaluate(() => [...document.querySelectorAll('.ctc-row')].find(r => /Carol/.test(r.textContent)).click())
    await sleep(300)
    const carol = await page.evaluate(() => { const p = document.querySelector('.ctc-person'); return { face: p.querySelector('.ctc-avatar').textContent, links: [...p.querySelectorAll('a')].map(a => a.getAttribute('href')), facts: [...p.querySelectorAll('dt')].map(d => d.textContent) } })
    check(width + ' px: Carol shows initials and her WebID as a link', carol.face === 'CD' && carol.links.includes('https://carol.example.org/profile/card#me') && carol.facts.includes('WebID') && /Friends/.test(await page.evaluate(() => document.querySelector('.ctc-person').textContent)), JSON.stringify(carol))
    await page.evaluate(() => { if (getComputedStyle(document.querySelector('.ctc-back')).display !== 'none') document.querySelector('.ctc-back').click() })
    await page.evaluate(() => [...document.querySelectorAll('.ctc-row')].find(r => /Alice/.test(r.textContent)).click())
    await sleep(300)
    const alice = await page.evaluate(() => document.querySelector('.ctc-person').textContent)
    check(width + ' px: Alice: email and phone held in blank nodes, kinds, notes', /alice@example\.org/.test(alice) && /Work/.test(alice) && /\+44-20-7946-0000/.test(alice) && /Cell/.test(alice) && /short proofs/.test(alice), alice.slice(0, 200))

    // A card opened on its own.
    await page.goto(address(BOB))
    await page.waitFor(() => !!document.querySelector('.ctc-person') && document.querySelector('.ctc-name').textContent === 'Bob Builder', { timeout: 40000 })
    await page.waitFor(() => !!document.querySelector('.ctc-in-book'), { timeout: 10000 }).catch(() => {})
    const alone = await page.evaluate(() => ({ title: document.querySelector('.ctc-book').textContent, mail: !!document.querySelector('.ctc-person a[href="mailto:bob@example.com"]'), book: (document.querySelector('.ctc-in-book') || {}).textContent || '', list: !!document.querySelector('.ctc-row'), back: !!document.querySelector('.ctc-back'), wide: document.documentElement.scrollWidth > innerWidth }))
    check(width + ' px: a single card opens on its own, names its book, no list', alone.title === 'Contact' && alone.mail && /Sample contacts/.test(alone.book) && !alone.list && !alone.back, JSON.stringify(alone))
    check(width + ' px: no sideways scroll on a single card', !alone.wide)
    await sideways('on a single card')
    await shot('sample-card-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}

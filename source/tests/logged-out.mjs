// The source pane with nobody logged in, at 1300 and 400 px: public files read only, a private one refused.
//   node tests/logged-out.mjs
import { open, config } from '../../lib/lib.mjs'
import { narrow, measure } from '../../design/viewport.mjs'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { PANE, PORT, DATA, DATA_DIR, freshData, openSource, forceSource, view } from './common.mjs'

freshData()
// A file only the pod's owner may read, with its access rule (JSON-LD, as this server wants).
writeFileSync(path.join(DATA_DIR, 'secret.txt'), 'Only the owner may read this.\n')
writeFileSync(path.join(DATA_DIR, 'secret.txt.acl'), JSON.stringify({
  '@context': { acl: 'http://www.w3.org/ns/auth/acl#' },
  '@graph': [{ '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': config.pod + 'profile/card.jsonld#me' }, 'acl:accessTo': { '@id': './secret.txt' }, 'acl:mode': [{ '@id': 'acl:Read' }, { '@id': 'acl:Write' }, { '@id': 'acl:Control' }] }]
}, null, 2))

for (const width of [1300, 400]) {
  const opened = await open({ pane: PANE, port: PORT, dir: import.meta.dirname, login: false, fresh: true, resource: DATA + 'people.ttl' })
  const { page, finish, shot, address } = opened
  let failed = false
  const check = (name, ok, detail) => { if (!ok) failed = true; opened.check(name, ok, detail) }
  try {
    if (width !== 1300) await narrow(page, width) // a true 400 px page (design/viewport.mjs)
    await openSource(page, address, DATA + 'people.ttl')
    let v = await view(page)
    check(width + ' px: a public file opens, read only', v.readOnly === true && /read only$/.test(v.meta), v.meta)
    check(width + ' px: Copy, and no Edit', v.buttons.join(',') === 'Copy', v.buttons.join(','))
    const m = await measure(page)
    check(width + ' px: no sideways scroll', !v.wide && !m.sideways, m.poking.join(' '))
    await shot('logged-out-' + width)
    if (width === 1300) {
      await forceSource(page, address, DATA + 'secret.txt', DATA + 'notes.md')
      v = await view(page)
      check('a private file: it says to log in, and shows nothing of it', /private\. Log in to see it/.test(v.empty) && v.text === null, v.empty)
      await shot('private-1300')
    }
  } catch (error) { await finish(error) }
  if (width === 400 || failed) await finish(); else await page.close() // finish() exits, 1 if anything failed
}

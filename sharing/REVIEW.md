# Review: sharing (Sharing pane), alone and hosted in the Files details

Reviewer: phase 4, 22 Nov 2026. Read the code, README and tests before NOTES.md. Exercised mainly as Files hosts it
(the real integration, in the suite shell, as me and as bob), ports 9561/9562; data in `suite-data/folder-review/`.
Screenshots: `../folder/tests/shots/review-shell-1300-sharing.png`, `review-shell-400-sharing.png`,
`review-alone-400-sharing.png`.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug (host contract) | sharing-pane.js:1121-1146 (`apply`) | A host cannot learn that the pane wrote. Files hosts it in its details and keeps a cached listing; after "Give it its own rules" (a new `x.acl`) or "Go back to inherited rules" (DELETE) the host's list is stale, and Files' Rename guard then lets a file be renamed away from its own rules, orphaning the `.acl` (tested; see `folder/REVIEW.md` #2). | After a successful write, dispatch a bubbling DOM event on the root, e.g. `new CustomEvent('sharing-change', { bubbles: true, detail: { item, aclUrl, kind: 'created' | 'saved' | 'deleted' } })`, and say so in the README. |
| 2 | nit | sharing-pane.js:782 (`summary` → `who`) | The review summary names a person just added by their raw WebID if the profile has not loaded yet. Seen in the two-person run: "http://127.0.0.1:8732/bob/profile/card.jsonld#me can now view", while the same step for `team/` a few seconds later said "Bob Tester can now edit". | Fall back to `hostOf(id)` like the row does, or redraw the open review when the name arrives (`spots`). |
| 3 | nit | sharing-pane.js:632, 811 | An ACL agent that is not an http(s) IRI (tested: `acl:agent <javascript:alert(2)>`) gets an empty bold name and an empty avatar, because `hostOf` returns `''` for it. Safe (no href, text only), but the row looks broken and is editable. | Show the raw IRI as the name when `hostOf` is empty, and treat a non-http(s) agent as a read-only rule. |
| 4 | design | sharing-pane.js:561-563, 223 | Hosted in the Files "Sharing" tab it repeats an `h2` "Sharing" and "Who can see and change the file …" under a tab and a details head that already say both, and its own `padding: --sui-space-4` sits inside the details body's padding, so rows get ~300 px of the 380 px column (WebIDs cut at "…/me/pro…"). | The `slot: 'details'` flag the NOTES propose (drop the title and outer padding), agreed with Files. |
| 5 | design | sharing-pane.js:223, 229, 237, 251, 256, 261 | Raw sizes in the pane's own rules: `max-width: 760px`, `gap: 2px`, `margin-top: 2px`, `max-width: 280px`, chip `min-height: 22px` (below the sheet's 28 px chip), icon `18px`. DESIGN rule 7 / "do not invent sizes". | Tokens (`--sui-space-1`, `--sui-icon`, the chip recipe as is), or a NOTES line for each kept exception. |

## Two-person: what was tested, result

Not added here (the task put it in Files; this pane already has its own `tests/two-person.mjs`). Through the Files
host (`folder/tests/two-person.mjs`): me gives a file and a subfolder their own rules, adds bob as Can view / Can
edit, removes him with ⋯ › Remove access, and sends the subfolder back with "Go back to inherited rules". Bob's own
requests follow every step (200 / 403 / 201 / 403 as granted). Pod files checked after each save. **All pass.**
Also checked: with a hostile profile (`foaf:name "<img src=x onerror=alert(1)> …"`, `vcard:hasPhoto <javascript:…>`)
listed in a rules file, the name is text, the photo is not used, no element is injected.

## Checked and fine

- Safety, code: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; `textContent` throughout.
- Links: `safeHref` keeps only http(s)/mailto/tel, `rel="noopener"`; the click handler only navigates http(s).
- Writes: exactly the three in the README (PUT `If-None-Match: *`, PUT `If-Match`, DELETE `If-Match`), each after a review and a confirm; Turtle then JSON-LD on 415; read-back after each write with a "server has something different" check.
- Guards: no-owner saves blocked, losing your own Control needs a second click, 412 reloads, WebIDs must be https (http only on localhost).
- Unknown rules (groups, origins, odd predicates) are kept and shown read-only; inherited rules are copied with only `acl:default` ones that apply.
- Denied / logged out: one plain sentence, no controls.
- Races: `apply` returns while busy; every control is disabled during a save.
- Design: embedded block current; rows, pills, 44 px targets (none under 44 px in the details column); container query works in the real 380 px Files column and at a true 400 px.
- 400 px (true, `design/viewport.mjs`): in the shell's details overlay and inline under a row in Files alone: no sideways scroll, nothing cut off.
- Read the author's NOTES after: #4 is known (proposed `slot: 'details'`); the Files sidebar was only tested with a stand-in box, which is now covered for real.

## Fixed (author, 22 Nov 2026)

| # | what was done |
|---|---|
| 1 | After every confirmed write (own rules, save, remove access, go back) the root dispatches `suite-sharing-change` (`bubbles`, `composed`, `detail: { uri, acl }`, `acl: null` after a DELETE), as the coordinator's contract says; not on cancel, failure or a mismatched re-read. README "For hosts". `tests/narrow.mjs`: none on cancel, none on a 412, one per save / own rules / go back with the right detail. |
| 2 | The open review redraws its sentences when a person's profile name arrives (a profile that never loads still shows the WebID, as before). |
| 3 | `hostOf` returns the address itself when it has no host, so the name and avatar are never empty; an `acl:agent` that is not http(s) makes the rule read-only (kept as it is). |
| 4 | `context.embedded === true` or `context.suite.slot === 'details'`: no heading, no outer padding. Tested in `narrow.mjs`. Files must pass one of them. |
| 5 | Removed `margin-top: 2px`, the 22 px chip override (recipe chip as is) and the 18 px icon (`--sui-icon`). Kept `760px`, `2px` row gap and `280px`, each explained in NOTES. Design block untouched (`--check` OK). |

`node tests/run.mjs`: 117 PASS, EVERY TEST PASSED.

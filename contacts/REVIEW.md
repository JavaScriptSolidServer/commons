# Review: contacts-pane.js (phase 4)

Reviewer did not write the pane. Every finding below was reproduced on the local pod (JSS 0.0.231) unless it says
"by reading". Probes ran on port 9563 against throwaway books under `suite-data/contacts-review/` (since removed).

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | contacts-pane.js:569, 639, 698 (`store.updater.update`, no re-read) | JSS finding 5 is not worked around. A `}` in any value saved by patch is lost while the pane says it worked. Editing a note to `see {the} plan` shows "Saved." and the note on screen, and after a reload the note is gone. Renaming a contact to `Ben {B}` shows "Saved." and after a reload the card has **no name at all** in the card or in `people.ttl`: the list shows the UUID folder name (`a754c3a8-…`, see `tests/shots/review-shell-400-list.png`). The same goes for a new contact's name in `people.ttl` (line 639). Silent data loss. | Re-read every patched document after saving (`fetcher.load(doc, { force: true })`) and compare it with what was meant; if it differs say "Not saved as typed". Better, avoid the bad path: use the PUT + If-Match `rewrite()` the pane already has for any change whose literals contain `{` or `}`, or for every card change. |
| 2 | safety | contacts-pane.js:756-757 (`remove`), also 588 (`rewrite`) and 569 | Delete sends `DELETE` to whatever document the person's IRI is in, without checking that it is inside the book. A `people.ttl` entry `<../victim.ttl#this> vcard:inAddressBook <index.ttl#this>` (a file *outside* the book's folder) shows as a contact; pressing Delete twice answered "Victim Outside was deleted." and **`victim.ttl` was gone from disk**. In a shared book, anyone with write on `people.ttl` can point an entry at `../../profile/card.jsonld` or any other file the owner can write, and the owner deletes it with two clicks. Edit (`rewrite` PUT / patch) likewise writes to any document named there. The README says Delete removes "the card", not any file. | Only DELETE (and only PUT/patch a card) when `docOf(person)` starts with the book's folder (`new URL('./', docOf(state.book))`); outside it, take the entry out of `people.ttl` and groups only, and say the card itself was left. Hide Edit for cards outside the folder or another origin. |
| 3 | bug | contacts-pane.js:385 (`strip` calls `decodeURIComponent`), used at 794, 924, 1006 | One card with a malformed percent sequence in an email or phone (`vcard:hasEmail <mailto:50%off@example.org>`, legal in Turtle) throws `URIError: URI malformed`. Opening that card draws only the head: no fields, **no Edit and no Delete**, so it cannot be fixed or removed from the pane. Worse, while that card is in the book, **any search query empties the whole list** (typing "ali" shows no one, not even Alice), alone and through the shell's header search. A hostile or merely sloppy entry breaks search for the whole book. | Wrap the decode: `const decode = (s) => { try { return decodeURIComponent(s) } catch { return s } }` and use it in `strip`, and at 539 and 555, which have the same call on addresses. |
| 4 | bug | contacts-pane.js:636-639 (`addPerson`) | The card is PUT first, then the name is patched into `people.ttl`. If the second step fails (bob with write on the folder but not on `people.ttl`, or a 412/5xx), the pane says "Not saved: …" but the new `Person/<uuid>/index.ttl` stays on the pod, unlisted, and every retry leaves another. By reading; not forced in a test. | On failure of the `people.ttl` patch, `DELETE` the card just made (and its folder), or say plainly that a card was left at that address. |
| 5 | design | contacts-pane.js:255 (`button.ctc-x` 20 × 20 px) | The × that takes a person out of a group is a 20 px target. DESIGN.md rule 5: every button is at least 44 px; chips are the exception, not buttons inside them. On a phone at 400 px the × next to "Work" is hard to hit and sits next to the group select (`review-shell-400-card.png`). | Give the × a 44 px hit area (padding or a `::before` that extends it) while keeping the 20 px glyph, or move removal into the group menu. |
| 6 | design | contacts-pane.js:1116 (only logged-out visitors get a line) | Bob with read-only access sees the book with no controls and no word about why (`review-two-bob-read.png`): his message line is empty. He cannot tell "I may not change this" from "this pane has no editing". Rule 10 asks for a note for something that stays true. | When logged in and `!state.canEdit`, show a `ctc-note`: "You can see this address book but not change it." |
| 7 | nit | contacts-pane.js:597 and 955 | `act()` disables only buttons; the "Add to group…" `select` stays live during a save. Choosing a second group while the first join is saving is silently dropped (`act` returns early while busy) and the select keeps showing the dropped choice until the next redraw. | Disable `select`s too in `buttons()` (or query `button, select, input`). |
| 8 | nit | contacts-pane.js:464, 627 | New cards and new books write `dct:created`. JSS finding 4: a `dct:` predicate is stored as `dc:` and cannot be deleted later. Harmless today (never edited) but the suite brief says avoid `dct:`. | Drop `dct:created` or use a non-`dct:` predicate. |
| 9 | nit | contacts-pane.js:237 (`.ctc-head` `align-items: center`) | With a very long name (3000 chars) the 64 px avatar is centred against a head hundreds of px tall, so at 400 px it is off-screen below the fold and the name starts with a blank gap (`review-hostile-400.png`). No sideways scroll, nothing broken. | `align-items: flex-start`, and clamp the title (e.g. 3 lines with `-webkit-line-clamp`) in the card head. |
| 10 | nit | README.md "Not done" | "Two people at once: there is one test user, so sharing a book was not tried" is now stale: `tests/two-person.mjs` covers it. | Update the line. |

After writing the above I read NOTES.md: the author already knew of 5 (the 20 px ×, argued as part of a chip) and 8
(`dct:created`, kept as upstream writes it). Findings 1-4, 6, 7 and 9 are not mentioned there; NOTES' item 2 handles
the blank-node patch bug but not JSS finding 5 (`}` in a literal), which hits the named-node patches.

## Two-person: what was tested, result

`tests/two-person.mjs` (added to `tests/run.mjs`; me on 9563, bob on 9564). A copy of `samples/book` at
`suite-data/contacts-review/book/` with its own JSON-LD `.acl` (me Read/Write/Control, bob by WebID, `acl:default` on the folder):

1. **bob Read only**: bob, logged in as himself, sees the same three people and the Friends/Work chips, opens Alice's
   card with her email, and has **no** New contact, New group, Edit, Delete, group menu or ×. His own PUT and PATCH of
   `people.ttl` and PUT of a new card are refused (403 403 403); `people.ttl` unchanged on disk. No sideways scroll.
2. **bob Read + Write** (ACL rewritten): after a reload bob gets New contact and New group, adds "Dave Shared"
   (email, role) and puts him in Friends from the card's menu: good messages, `people.ttl`, the new card and
   `Group/Friends.ttl` all show it on disk.
3. **me reloads**: Dave is in my list, his card shows the email, role and Friends that bob set, and the Friends filter
   includes him.
4. **bob removed from the ACL**: the data browser does not hand the 403 book to the pane at all; bob sees no people
   and no controls; the book is unchanged.

Result: 21 checks, all pass. `node tests/run.mjs` ends **EVERY TEST PASSED** with it added. (One run of the helper's
login timed out on the IdP page; the rerun passed; not the pane.) Finding 2 is the two-person risk that matters: a
person given write on a shared book can make the owner delete files outside it.

## Checked and fine

- No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; all text via `textContent`. A name
  `<img src=x onerror=alert(1)>` shows as text; a `javascript:` web site and photo are dropped (no link, initials).
- Links: `safeHref` allows only http(s)/mailto/tel, `rel="noopener"`, web links `target=_blank`; photos http(s) only, `no-referrer`.
- Every write path read: mintNew (3 PUTs, `If-None-Match: *`), add, edit, group, join, leave, delete match the README
  table, apart from finding 2 (where) and 4 (left-over card).
- Blank-node cards (JSS finding 1) go through PUT + If-Match with a 412 message; folder DELETE checks emptiness first
  (finding 2); group file names avoid apostrophes (3b).
- Double submit and double Delete are guarded by `state.busy`; a list refresh during an open form keeps what was typed.
- Server errors on save and load are shown (status line alone, toast in the shell), not swallowed.
- Access: controls follow the server's `WAC-Allow` (via `updater.editable`) for a second, real user, both ways.
- Design: tokens and recipes from the sheet, pill buttons/inputs, 56 px rows, 44 px nav items and buttons (measured:
  nothing under 44 px apart from the × in finding 5), one primary button per view, empty states, shell navigation
  with `aria-current`, toasts in the shell.
- 400 px: true 400 px via `design/viewport.mjs`, alone and in the shell, list and card, with hostile long names and a
  400-character email: no sideways scroll, nothing cut off (`review-list-400.png`, `review-shell-400-*.png`).

## Fixed (by the pane's author)

Regression checks: `tests/review.mjs` (one or more per row, tagged by row number), `tests/static.mjs`, and
`tests/two-person.mjs` (row 6). `node tests/run.mjs` ends EVERY TEST PASSED with all of them.

| # | fix | check |
|---|---|---|
| 1 | No SPARQL patches at all. Every change to an existing file is a whole-file `PUT` with `If-Match`, then a fresh read (old statements dropped) compared with what was meant; a difference is "Not saved: the pod did not keep it as typed…", never "Saved.". The pane keeps ETags from its own reads (rdflib's `getHeader` can return an old one). | review.mjs 1: `Alice {A}` / `see {the} plan` saved, on the pod, in people.ttl and the group, read back after a reload; a new contact `Eve {E}`; a pod that answers 2xx but keeps something else is reported as an error. static: no `updater.update(`. |
| 2 | `insideBook()` / `cardInBook()`: every PUT, rewrite and DELETE must be inside the book's folder, and a card must not be one of the book's own files. Outside: Delete only takes the entry out of `people.ttl` and the groups in the folder, says the file was left; Edit is hidden with a line saying why. | review.mjs 2: `<../victim.ttl#this>` has no Edit; Delete twice says it was left; `victim.ttl` unchanged on disk; gone from people.ttl. static: the guards are in place. |
| 3 | `decode()` wraps `decodeURIComponent` (strip, group and folder names). | review.mjs 3: with `mailto:50%off@example.org` in the book, "ali" finds Alice, "50%off" finds Percy, his card shows the email, Edit and Delete. |
| 4 | If the `people.ttl` step of New contact fails, the new card (and its folder) is deleted again; if that fails too, the message names the address left. | review.mjs 4: a forced 500 on people.ttl gives "…removed again" and no new `Person/` folder. |
| 5 | The × keeps its 20 px mark with a `::before` that makes a 44 px hit area (the chip no longer clips it). | review.mjs 5: points 20 px above, below and left of its centre hit the ×. |
| 6 | Logged in without write access: a standing note "You can see this address book but not change it." | two-person.mjs: bob (read only) sees the note. |
| 7 | `act()` disables `select`s too. | review.mjs 7: the group menu is disabled straight after a choice. |
| 8 | No `dct:created` on new cards or books. | review.mjs 8: a new card has no created date; static: no `dct:` in the source. |
| 9 | Card head `align-items: flex-start`; the name is clamped to 3 lines (full name in its `title`). | review.mjs 9. |
| 10 | README "Not done" updated; README "What it writes" now says where and how. | — |
| nit | Initials skip punctuation (`Alice {A}` is AA). | review.mjs. |

Also moved `two-person.mjs` to this pane's ports (9515/9516) and data folder (`suite-data/contacts/two-person/`), and
loosened one regex in contacts.mjs that assumed patch-style serialisation (`[^.]*` across `127.0.0.1`); the data it
checks is the same.

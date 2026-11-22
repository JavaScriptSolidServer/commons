# Review: poll (`poll-pane.js`)

Reviewer did not write the pane. Read: suite BRIEF, lab BRIEF, DESIGN.md, the pane, README and tests; NOTES.md only
after the findings below were written (none of them is in it). Probes were run in a real browser on port 9567
(throwaway polls under `suite-data/poll-review/`, removed); screenshots `tests/shots/review-*.png`.

Decided, not a finding: the answers file is writable by anyone logged in.

| # | severity | where (file:line) | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | poll-pane.js:560-573, 706-711, 487 | JSS finding 5 not respected and no re-read after save. Maker types `Bring {snacks} please` in Notes, presses Save: status says **"Saved."** and the page shows the new notes, but on disk `cal:comment` is gone (old value deleted, new one lost); after a reload Notes is empty. Same path for the title, place and a "not a time" choice label. | Refuse or escape `{`/`}` before `updater.update`, or write `index.ttl` with PUT + If-Match; in every case reload the doc after the save and say "Not saved as typed" when the value read back differs. |
| 2 | bug | poll-pane.js:654, 696-711 | The "Or add something else" input sits inside the Offer-times `<form>` and its Add button is `type=button`. Typing "Pizza" and pressing Enter submits the outer form: if a day is picked it adds **3 hours (09-12)** ("3 times added.") and not Pizza; with no day the browser's "fill out this field" bubble appears on the date input. | Make the text choice its own `<form>` (outside `.pol-add`) with a submit button, or handle Enter in that input. |
| 3 | bug | poll-pane.js:479, 648-649, 713, 889-895, 541 | Every refresh rebuilds the maker's forms. Maker types new notes (not saved), then presses any answer: the textarea is back to the stored value, the typing is lost. The background profile load (541) also triggers a refresh a moment after opening, so early typing can vanish too; "Or add something else" collapses each time. Same for the edit form in the shell's About tab. | Draw the owner forms once and update only the list on refresh (or skip redrawing a form that has focus / unsaved input). |
| 4 | bug | poll-pane.js:795, 527-529 | Refresh reloads only `results.ttl`. Two-person test: bob has the poll open, me adds a time, bob presses Refresh: still 4 choices (5 on the pod); title/place edits are not picked up either. Only a page reload shows them. | Reload `doc` as well as `resultsDoc` with `force: true` in `app.load(true)`. |
| 5 | safety | poll-pane.js:359-362, 540 | Names are read from anywhere in the store, including `results.ttl`, which anyone logged in can write. Bob PATCHed `<me> foaf:name "Mallory"` and `<bob> foaf:name "Alice"` into it (204); the store then holds `me/Mallory`, `Bob Tester/Alice`. The profile name wins only if the profile happened to load first; because a planted name makes the person "named", line 540 never fetches the real profile, so a viewer who has not loaded it (e.g. logged out, a third person) sees "By Mallory" and bob as "Alice". Goes past the decided "answers are writable": it rewrites who made the poll. | Take a person's name only from their own profile doc (`store.any(p, FOAF_NAME, null, p.doc())`); keep reading names from `results.ttl` only for the read-only sample, or put the sample's names in its index. |
| 6 | design | poll-pane.js:726, 760 | Pressing an answer redraws the whole list, so keyboard focus drops to `<body>` (checked: `document.activeElement` = BODY after Space/Enter on "Yes"). A keyboard or screen-reader user must tab from the top after every answer. | After `refresh`, refocus the button with the same `data-option` + `data-answer`. |
| 7 | design | poll-pane.js:818, 672, 895 | In the shell the maker sees up to three primary buttons at once: "Add poll" (nav), "Add times" (content) and "Save" (details). DESIGN.md rule 3: one primary per view. | Make "Add times" secondary inside the shell, or "Add poll" a `nav-new`-style secondary. |
| 8 | 400px | poll-pane.js:750-751 (chip recipe) | A long name in a "who" chip is clipped with no way to read it: at 400 px a 60-character name ends mid-word at the edge (`review-shell-400.png`), also at 1300 px (`review-shell-1300.png`). No sideways scroll, but text is cut off. | `title` on the chip, or let these chips wrap (`overflow-wrap: anywhere; white-space: normal`). |
| 9 | nit | poll-pane.js:766-769 | "Press again to remove" stays armed forever; a press minutes later removes without a fresh ask. | Disarm after a few seconds or on blur. |
| 10 | nit | poll-pane.js:769, 389-392 | Removing an option leaves its answers in `results.ttl`; and anyone with a response node counts in "N people have answered" even if all their answers are cleared or on removed options. | Count people with at least one answer on a current option. |
| 11 | nit | poll-pane.js:752, 762 | The maker's Remove buttons are drawn only when `results.ttl` could be read; if it 404s/403s the maker cannot remove options. | Draw Remove whenever `app.mine()`. |
| 12 | nit | poll-pane.js:610-613 | `mintNew` writes index, results, then two ACLs; if a later step fails, a half-made poll (no ACL, or results without index) is left. | Say which part exists in the error, or remove what was written. |
| 13 | nit | poll-pane.js:861-867 | Tabs have `role=tab` but no `aria-controls`, no `tabindex` roving or arrow keys. | Add `aria-controls`/ids and arrow-key handling, or drop the tab roles. |

## Two-person: what was tested, result

`tests/two-person.mjs` (added to `tests/run.mjs`): me (9567) makes a poll with `mintNew`, offers 12:00-15:00 and
"Bring cake", answers three. Bob (9568, `as: 'bob'`) is logged in as bob, sees the title, "By me", the four choices
and my answers, none shown as his; has 12 answer buttons and no Offer times / About / Remove. He answers No, Yes, If
need be, and sets and clears one: the server has his four cells under his WebID and my answers unchanged. Bob's
PATCH (add title/option, remove a time), PUT over `index.ttl` and PUT of its ACL all get 403; `index.ttl` unchanged
on disk. Me reloads: counts, "Bob Tester" chips from his profile, "2 people have answered", best-so-far on the right
hour. Bob after a reload sees a time me added; no sideways scroll at a true 400 px. **Result: all pass** (29 PASS).
INFO lines: Refresh misses the new time (finding 4); bob's hand-made PATCH flips my Yes to No (204, the decided ACL;
not possible through the pane); planted names (finding 5).

## Checked and fine:

- Safety: no innerHTML/outerHTML/insertAdjacentHTML/eval/new Function; all text via `textContent`; markup in title, names, labels shows as text; `javascript:` place is plain text; links only `https?:` with `rel="noopener"`.
- Writes: every PUT/PATCH/updater call matches the README's "What it writes"; bob's writes go only to his own response.
- JSS quirks: no blank nodes, no `dct:`, no folder DELETE, ACLs fall back to JSON-LD on 415 (findings 1, 2, 4, 6, 7 not hit); finding 5 is hit (#1).
- Races: `busy` plus disabling every button blocks double presses and save-during-save.
- Errors: refused saves show "Not saved: …" and a toast in the shell; unreadable answers say why.
- Design: tokens and recipes current (`embed.mjs --check`), pills, 44 px targets (no visible control under 44 px in the shell), rows, empty state, nav/details contract.
- 400 px: true 400 px (`design/viewport.mjs`) alone, in the shell, and with details open: no sideways scroll, nothing overlapping.
- `node tests/run.mjs` with the two-person test added ends `EVERY TEST PASSED`.

## Fixed (by the pane's author, after this review)

Regression checks are in the tests named; `node tests/run.mjs` ends `EVERY TEST PASSED`, two-person.mjs included
(moved to the pane's ports 9523/9524 and to `suite-data/poll/`).

| # | fixed? | how | regression check |
|---|---|---|---|
| 1 | yes | Changes to `index.ttl` (title, place, notes, choices; only its maker writes it) are no longer SPARQL patches: the file is read fresh, changed, and PUT whole with `If-Match` (412 → "changed somewhere else, try again"), as the Tasks pane does. Answers (no free text) are still patched. After every save each file touched is read again from the server; "Saved." only if it holds exactly the change, else "Not saved as typed: … What it holds is shown." | poll.mjs `#1` (notes and a choice with braces: on the pod, after a reload) |
| 2 | yes | "Offer times" and "a choice that is not a time" are two separate forms in one box; Enter submits its own. | poll.mjs `#2` (real Enter key via CDP, with a day picked: one choice, no hours) |
| 3 | yes | The maker's forms are made once and kept; a redraw only refills a field nobody has typed in. Same for the About form in the shell (kept on the app). | poll.mjs `#3`, shell.mjs `#3` |
| 4 | yes | Refresh reads `index.ttl` and `results.ttl` fresh. | two-person.mjs "Refresh reads the poll again too" (was INFO) |
| 5 | yes | Names come only from the person's own profile document, or from the poll's `index.ttl` (only its maker can write it); never from `results.ttl`. Profiles are fetched for anyone without such a name. The sample's names moved from its results file into its index. | two-person.mjs "planted names … are not shown" (was INFO); shell.mjs fixture plants "Mallory" for Alice |
| 6 | yes | After a save, focus returns to the answer button with the same option and answer (`data-option` + `data-answer`). | poll.mjs `#6` |
| 7 | yes | In the shell "Add times" and the About form's Save are secondary; "Add poll" is the one primary. Alone, "Add times" stays primary. | shell.mjs `#7` |
| 8 | yes | Who-chips wrap (`white-space: normal; overflow-wrap: anywhere`, after the end marker) and carry their text as `title`. | poll.mjs `#8` |
| 9 | yes | An armed Remove disarms after 4 s or on blur. | poll.mjs `#9` |
| 10 | partly | Counting fixed: only people with an answer on a choice still offered count, in the by-line, the left column and Participants. Not done: removing a choice does not delete its answers from `results.ttl` (they are ignored; deleting other people's answers is a write the README does not list). | shell.mjs fixture (Carol's answer on a removed choice: count stays 1) |
| 11 | yes | Remove is drawn for the maker whether or not the answers could be read. | poll.mjs `#11` (answers file deleted) |
| 12 | mostly | If a step of `mintNew` fails, the files written so far are deleted again and the error says "nothing was left behind" or what was. An access rule already written for `index.ttl` is not tracked (rare: it would need the second ACL to fail). | poll.mjs `#12` (results.ttl already there) |
| 13 | yes | Tabs have ids, `aria-controls`, `aria-labelledby` on the panel, roving `tabindex`, and ArrowLeft/Right/Home/End. | shell.mjs `#13` |

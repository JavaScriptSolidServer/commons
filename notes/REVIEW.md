# Review: notes (read-only Markdown reader)

Reviewer's probes: hostile notes in `suite-data/notes-review/` (`hostile2.md`, `fence-title.md`, `deep.md`, `emph.md`),
opened alone and logged in on port 9575; screenshots `tests/shots/review-probe/shots/review-*`. Line numbers are
`notes-pane.js`.

| # | severity | where | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | notes-pane.js:477 (with the skip at 233) | The title is the first `^# ` line anywhere in the text, **including inside a code fence**, while the block parser skips the first *real* H1. `fence-title.md` (a ```` ```sh ```` block holding `# install it first`, then `# Real title`) shows the title "install it first" and **"Real title" is not shown at all**. Shell scripts and Python in notes hit this. | Take the title from the block parser (the first H1 it meets outside fences), not a regex over the raw text. |
| 2 | safety | notes-pane.js:436, 445-446 | `[[//evil.example/steal]]` passes the wiki-name pattern (`/` and `.` are allowed), resolves with `new URL()` to `http://evil.example/steal.md`, and is drawn as an internal note link (`a.note-wiki`, no `rel`). Clicking it opens the off-site address **in place** through `GotoSubject`, so the pane then fetches it with the logged-in fetch and draws it as if it were one of your notes. A hostile note can make a "next note" that is someone else's page. | Accept a wiki target only if the resolved URL has the note's own origin (ideally the same folder or below); otherwise show it greyed like a missing note. |
| 3 | safety | notes-pane.js:173, 192 | `safeHref` lets anything starting with `/` through, so `[text](//evil.example/phish)` becomes a live off-site link, and `rel="noopener"` is only added when the href starts with `http(s):`, so this one has none (seen in the probe: `//evil.example/phish rel=null`). | Resolve the href against the note first; then decide by the resolved protocol, and add `rel="noopener"` to every off-origin link. |
| 4 | bug | notes-pane.js:230, 477 | Both heading patterns end in `\s*#*$`, which strips trailing `#` even with no space before it: `# Learn C#` is shown as "Learn C" (seen). Same for `## F#`. | Strip a closing sequence only when a space precedes it: `/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/`. |
| 5 | nit | notes-pane.js:243 | A quote nested 20 000 deep (one line of `>`) recurses per level and ends in "Could not load this note: Maximum call stack size exceeded". It is caught (nothing breaks), but the note is lost and the message is a JavaScript error. | Cap quote depth (say 20) and treat deeper `>` as text. |
| 6 | nit | notes-pane.js:454 | With no folder listing, each `[[link]]` is checked with a plain `fetch` HEAD, not the logged-in fetch used for the note itself, so in a private folder that cannot be listed every existing note link shows as missing. | Use the same `doFetch` as the note. |
| 7 | nit | notes-pane.js:173 | `tel:` links (allowed by the brief) are dropped to plain text. | Add `tel:` to `safeHref`. |

## Two-person

Not asked for this pane (read-only). Not tested.

## Checked and fine

- Hostile markup: `<script>`, `<img onerror>`, raw `<a href="javascript:">`, `[x](javascript:…)` and `data:` links all stay text; no `innerHTML`/`eval` anywhere; everything is `createElement` + `textContent`.
- Huge input: 240 kB of `_a ` and 30 000 unclosed `[x](` render in about 2 s with no runaway regex.
- Writes: none. No PUT/PATCH/POST/DELETE in the code (the only non-GET is the HEAD in #6).
- 400 px: a true 400 px (`design/viewport.mjs`) on the hostile note, alone and in the shell: no sideways scroll; pager fits; long words wrap.
- Shell contract: `renderNavigation` shares the listing promise through `state`, marks `aria-current`, drops the column with `refreshNavigation()` when there is no listing; no `renderDetails`, as Nextcloud Notes.
- Design: tokens and the `icon,nav,buttons` recipes from `embed.mjs`; pill buttons at 44 px.

## Fixed

All seven. Proof: the hostile sample `samples/journal/hostile2.md` (on the pod via `tests/setup.mjs`) and its
checks in `tests/notes.mjs` ("a second hostile note"). The whole run still passes (`node tests/run.mjs` ends
`EVERY TEST PASSED`), so the earlier checks on links, titles, tasks and layout still hold after each fix.

| # | fix | test |
|---|---|---|
| 1 | The title is the first top-level H1 the block parser meets (`markdown(…, take)` stores it); no regex over raw text. | title "Real title" from a note with ```` ```sh ```` `# install it first` above it; the fence keeps its comment; one H1. |
| 2 | A `[[…]]` target must lie in the note's folder or below (`target.startsWith(folder)`); otherwise greyed like a missing note, with no address. | `[[//evil.example/steal]]` and `[[../outside]]` are greyed with no href; `[[sub/inner]]` still links. |
| 3 | `safeLink` resolves the href against the note, allows only http(s), mailto, tel (and `#…`), and adds `rel="noopener"` to every http(s) link off the note's origin. The href stays as written. | `//evil.example/phish` has `rel=noopener`; `/me/public/` and `#top` have none; `vbscript:` is text. |
| 4 | Headings: `/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/`. | `## Learn C#` keeps its `#`; `### Closed heading ###` drops the closing run. |
| 5 | Quotes nest at most 20 deep; deeper `>` is paragraph text. | a 20 000-deep quote line draws 20 levels and its text, no error; no sideways scroll at 1300 and a true 400 px. |
| 6 | The no-listing HEAD check uses the same logged-in fetch as the note. | Not tested (needs a folder that cannot be listed); the listed path is unchanged and tested. |
| 7 | `tel:` allowed. | `[call Bob](tel:+15550100)` is a link. |

Also: the design sheet changed during this work (new tokens and recipes), so the block was regenerated with
`node design/embed.mjs` (not by hand). The pane's width now uses the new `--sui-reading-width` instead of `72ch`.
At 400 px the 20-deep quote leaves its text a very narrow column; it does not overflow, and this is left as it is.

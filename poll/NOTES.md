# Notes: poll (phase 2)

## Judgement calls

- **Left column = only what the pane knows.** Nextcloud's Relevant / My polls / All polls / Closed are filters over
  every poll a person has. This pane only ever reads the poll on show, so the column holds that poll under the one
  heading it belongs to ("My polls" if you made it, "Answered" if you have answered, else "This poll"), with the
  number of people who answered. No Closed: polls cannot be closed. Listing every poll would mean searching the
  type indexes, which is new behaviour (see "Needs a decision").
- **"Add poll" uses the pane's own `mintNew`**, in a new `poll-<time>/` folder beside the folder of the poll on
  show, then opens it with `suite.go(…, { pane: 'poll' })`. Shown only to the poll's maker: they are the one most
  likely to be able to write in that parent folder. Someone else could not, and a button that fails is worse than
  none. It is listed under "What it writes" in the README.
- **Details column**: About (place, notes, and the maker's edit form), Configuration (made by, made on, choices,
  how answering works, time zone, answers file, address, and the honest note that anyone logged in can change an
  answer), Participants (one row per person with yes / if need be / no counts). No comments tab: the data has no
  comments. In the shell the edit form moves from the content to About (Nextcloud edits a poll's text in its
  sidebar); alone it stays in the content as before. The configuration note says what *new* polls get; for an
  existing poll it does not read the access rules, so it does not claim them.
- **The vote grid is rows, not a table.** The sheet says lists are rows; a participants × options table does not
  fit 400 px. Each choice is a row: time, "Best so far" chip, count, bar, who said yes as chips (green yes, amber
  "(if need be)" — the words stay, so colour is not the only sign), and the person's own Yes / If need be / No as
  44 px pill buttons on the right (under the choice when the content is narrower than 640 px, by container query,
  so it also works in the shell between two columns). Pressed answers use the success / warning / error tokens.
- **One primary button per view.** Alone: "Add times" is primary, the edit form's Save is secondary. In the details
  column Save is the primary (it is its own view).
- **Status line kept** (the tests and the alone pane need it) and in the shell a saved / refused change is also a
  toast. The logged-out "Log in to say when you can make it" is drawn as a note, since it stays true.
- **Data browser leak:** mashlib's CSS styles every `[role="status"]` as a green box with padding and shadow. The
  pane undoes that on `.pol .pol-status` (after the end marker). Other panes with `role="status"` will hit the same.
- `change()` disables every button in the content, column and details while saving, and re-enables after, so the
  details tabs (not redrawn) do not stay dead — that was a real bug found by the shell test.
- Removed `tests/lib.mjs`, `tests/cdp.mjs`, `tests/local.example.json` and the old `tests/local.json` (a copy of
  credentials no longer used); tests use `../../lib/lib.mjs`. `index.html`, `og.png` and `tools/` (the published
  repo's landing page) are left as they were and are not part of the suite.
- Added one behavioural check that was missing: Remove asks twice and then removes the hour from the pod.

## After the review (REVIEW.md has a "Fixed" table)

- **Whole-file writes for `index.ttl`, patches for `results.ttl`.** Only the maker writes the poll file, so read
  fresh + PUT with If-Match is safe there and avoids JSS finding 5 (a `}` in a patched literal is silently lost).
  The answers file is shared by everyone answering: a whole-file PUT would make two people answering at once clash
  (412) more often, and answers hold no free text, so they stay patches. Both are read back after every save.
- **Trusted names**: the person's own profile document, else the poll's `index.ttl` (the maker's word; the sample
  keeps its made-up names there), else the address. The maker could misname a participant in `index.ttl`; that is
  the maker's own poll, and much less than anyone logged in renaming the maker.
- Forms are kept between redraws; a field is refilled from the pod only if its text is still what was last shown.
- Not done: answers on a removed choice stay in `results.ttl` (ignored, not counted). Deleting them would be the
  maker writing other people's answers; not in "What it writes".
- `two-person.mjs` now runs on 9523/9524 and writes under `suite-data/poll/` (it used the reviewer's 9567/9568 and
  `suite-data/poll-review/`).

## Testing

- True 400 px with `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`), in `poll.mjs`, `shell.mjs`
  and `sample.mjs`; not the helper's `width: 400` window.
- All on port 9523 (9524 used only for a throwaway probe). Order matters: `shell.mjs` reuses `poll.mjs`'s login;
  `sample.mjs` wipes the profile to be logged out, so it runs last.
- `shell.mjs` writes its poll straight to disk as Turtle (author = the test user, one answer by Alice) so it does not
  depend on `poll.mjs`'s data.
- After `narrow()` the shell keeps its left column open (it decides at mount), so the test shuts the drawer
  before the 400 px picture.

## Unverified

- A second person in the shell (bob) was not run here; `two-person/poll.mjs` covers the published copy, not this one.
- "Add poll" when the maker cannot write the parent folder: it shows an error toast (code path read, not tested).
- The toast after "Add poll" is not seen: the shell draws a new frame when it goes. The new poll opening is the
  only feedback.
- 12-hour clock in the screenshots is the headless browser's locale; times follow the viewer's locale.

## Needs a decision

- **A list of polls for the left column.** To match Nextcloud (Relevant / My polls / All polls) the pane would
  have to find every `sched:SchedulableEvent` in the person's type indexes, as the shell's `start` lookup does.
  Either the shell exposes what it found (e.g. `context.suite.instances(classes)`), or the pane does its own type
  index walk. Both are new behaviour, so not done.
- **The sheet's base recipe could undo `[role="status"]`** from the data browser (padding, border, background,
  shadow, width, margin) as it already undoes `header` and `button`; then panes would not each need the fix.
- **Shell:** after `go()` to a new thing the toast given just before is lost; a toast that survives the redraw
  (or a `toast` option on `go`) would let "Add poll" say "Poll made".
- **Shell:** the navigation column does not close when the viewport narrows past 900 px after mount.

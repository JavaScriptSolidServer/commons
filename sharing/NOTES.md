# Notes: sharing pane

## Phase 2 (suite restyle, 22 Nov 2026)

Judgement calls:

1. **Container query, not media queries.** The root is `container: shr / inline-size`; under 520 px of *its own*
   width a row becomes avatar · name over dropdown · ⋯. So the same file reads right in the Files app's ~360 px
   details sidebar on a 1300 px screen and on a phone. `render()` also works with a bare `{}` context (falls back to
   `document` and `SolidLogic.store`) since a host mounting it by `import()` may not build a data-browser context.
2. **Nextcloud order:** "Add a person by WebID" at the top (only when the rules are the item's own and editable),
   then the own/inherited note, people, then "Everyone else" (anyone logged in, everyone) standing in for the
   "Share link" row: a pod has no secret links, the nearest thing is public read. No search-as-you-type: there is
   no directory to search, so it stays a WebID box (as before).
3. **Remove moved into a ⋯ menu** ("Open profile", "Remove access"), as Nextcloud does. Still drafted, never saved
   on click. Everyone / anyone logged in have no menu (no Remove: their "No access" does that) but keep an empty
   44 px cell so dropdowns line up.
4. **Read-only levels are chips** with short words ("Owner", "Can edit"); the full words ("owner: can edit and
   change who has access, here and in everything inside") are in the chip's title and a screen-reader span.
   A folder rule that differs for the folder and its contents shows "Mixed" plus a muted line spelling it out.
5. **Status stays in place** (as a `shr-note`), and inside the shell a save also calls `context.suite.toast()`.
   The sheet has `note`, `note-warning`, `note-error` but no success note: built from `--sui-success-light` /
   `--sui-success` (`.shr-note.shr-good`).
6. Avatars: the profile's `vcard:hasPhoto` or `foaf:img` (http(s) only, falls back to initials on error), else
   initials of the profile name, else the first letter of the WebID's host.
7. The select is a native `<select>` styled as a 44 px pill (the sheet has no dropdown recipe); built from the
   input tokens.
8. Tests: true 400 px via `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`) in `sample.mjs`,
   `shell.mjs`, `logged-out.mjs` and for bob in `two-person.mjs`. The 360 px box in `narrow.mjs` is a fixed
   `<aside>` on the plain data browser page (z-index above its header), the pane mounted by `import()`.
   `two-person.mjs` is `two-person/sharing.mjs` moved onto ports 9527/9528 and `suite-data/sharing/shared/`.
   One check was loosened in spirit only: `.shr-level` now holds a chip plus the screen-reader words, so the
   inherited-row texts read "Owner: owner: can edit…"; the `/owner/` check is unchanged and still passes.

Unverified / weak:

- The Files app's sidebar itself: tested with a stand-in 360 px box, not the real Files sidebar (built in parallel).
- The heading "Sharing" + subline shows even when a host already has a "Sharing" tab title: duplicated there.
- `suite.go()` for links in the shell is not exercised by a test (plain links and the data browser path are).
- Profile photos: no sample profile has one, so the photo path is untested.
- The ⋯ menu is a popover in the row; near the bottom of a short scrolling sidebar it opens below and needs a scroll.

Review fixes (REVIEW.md, "Fixed"):

- Host event `suite-sharing-change` after each confirmed write (README "For hosts"); tested in `narrow.mjs`.
- Details slot: `context.embedded === true` or `context.suite.slot === 'details'` drops the heading and padding.
  The flag name is my side of the proposal below; the Files agent must pass one of them.
- Kept raw sizes, on purpose: `max-width: 760px` (a readable column alone; the sheet's `--sui-content-max` 1080 is
  too wide for one list), `gap: 2px` between rows (the sheet's own nav-list uses 2px), `max-width: 280px` for the
  dropdown cell in the wide layout (keeps names readable next to a long "As now: …" option).

Flake in the coordinator's full pass (a state stuck "busy"/"loading"):

- The pane does not listen to login or session events itself, but the data browser (and the shell) redraw after a
  session restore, which can drop a pane opened by a click just before. Tests now open Sharing through
  `tests/open-sharing.mjs`: wait for the session to settle (current user and the account button's logged-in state),
  pick Sharing, wait until it has settled and is still there 400 ms later, else open it again (logged, at most 3).
  `shell.mjs` does the same for the shell's "Other views". No check was changed.
- The pane could stay "busy" if a read never answered: reads (GET/HEAD) now give up after 20 s (writes are never
  aborted), a whole load after 60 s, and only the latest read draws. So it always settles to its rules or an error.
- `tests/free-ports.mjs` (imported first by every test) frees 9527/9528 with `fuser -k` on any exit, since the
  helper's `open()` exits at once on a failed login and would leave the other browser running.
- Seen while repeating the run: bob's fresh login timed out inside the identity provider. `two-person.mjs` now reuses
  the session bob's last run left in `tests/profile-bob` and logs in afresh only when there is none (logged).

Needs a decision:

- **A hint for embedded hosts** (now honoured by this pane, see above). When the Files app hosts this pane under its own "Sharing" tab, the pane's own
  "Sharing" heading is redundant. Proposal: a context flag the contract defines, e.g. `context.embedded === true`
  (or `context.suite.slot === 'details'`), on which panes drop their title. Not implemented here (it would be a
  contract change in DESIGN.md / shell, which I may not edit).
- **A dropdown (select) recipe and a success note** in `design/recipes.css`; this pane builds both from tokens.

## Phase 1 (lab)

## Judgement calls

1. **Edits are drafted, never saved on change.** Changing a level or adding a person only marks the row; "Review
   and save" shows plain sentences ("Everyone can now view", "Bob can no longer see or change it (could edit)")
   and only the confirm button writes. Upstream writes on each change; for access control that is too risky.
2. **"Give this item its own rules" writes immediately (after confirm).** It PUTs a copy of the inherited rules that
   apply (the folder's `acl:default` rules, re-pointed at this item, with `acl:default` too if it is a folder), with
   `If-None-Match: *`. The copy keeps every triple of each rule except the targets, so group, origin and condition
   rules come along unchanged. Test: logged-out access is the same before and after.
3. **What counts as editable.** A rule is editable only when it has nothing but type, `acl:agent`, `acl:agentClass`
   (everyone / logged in), `acl:accessTo`/`acl:default` pointing at this item, and the four standard modes. Anything
   else (groups, origins, conditions such as JSS payment conditions, other targets, blank-node subjects) is shown
   read-only and written back triple for triple. Editable rules are regrouped on save: one authorization per
   person per scope, absolute IRIs (JSS resolves relative `accessTo` in a file ACL against the folder, so relative
   forms are a trap).
4. **"Owner" means Read + Write + Control.** It is offered for people only, never for everyone / anyone logged in.
   An odd existing mix shows as "As now: …" in the select and is kept unless the person picks a level.
5. **Folders: one level sets both scopes.** Picking a level for a folder sets the folder and its contents the same
   (`accessTo` + `default`). Mixed existing rules (Carol: folder only) are shown and kept as they are until changed.
6. **The no-owner guard counts only `acl:agent` with Control on the item itself.** Control through everyone,
   anyone-logged-in, a group, or origin-limited rules does not count. It applies to saving, to the copy and to
   "go back" (if the folder rules above have no owner, it refuses).
7. **Losing your own Control** (via a save or via "go back") makes the confirm button red, labelled "Yes, remove my
   own control", and needs a second click ("Click again to confirm: I will lose control").
8. **WebID check:** `https://` only, except `http://` for localhost / 127.0.0.1 / [::1] so the local test user works.
9. **Label:** "Sharing" for any http(s) subject without a fragment that ends in `/` or that the store knows as an
   LDP resource. The data browser hides upstream `sharing` from this menu, so there is exactly one "Sharing".
10. **ACL reads** ask `application/ld+json, text/turtle;q=0.9` (lossless on JSS, which stores JSON-LD) with
    `cache: 'no-store'`, so a read after a save is never a stale cached copy.

## Verified (tests/run.mjs)

File inherits → own rules copy (pod file checked, logged-out still 401) → everyone can view (logged-out 200) →
reload reads back → taken back (logged-out 401) → bad / non-https WebIDs refused → Bob added (pod file) → removed →
no-owner refused with the file unchanged → go back to inherited (ACL deleted) → own rules again, Bob owner, demote
self: first click writes nothing, second saves, pane then says you can no longer see the rules → folder sample:
names, levels, Carol folder-only, group and app rules read-only and preserved byte-for-meaning through a save →
a file in the folder inherits without Carol → 1300 and 400 px, no sideways scroll and nothing wider than the pane →
logged out: "You cannot see who has access to this. Log in…", no controls.

## Unverified or weak

- Alice/Carol in the sample are fictional; bob (the second test user) is real in `tests/two-person.mjs`.
- **Turtle PUT path** never succeeds on JSS (always 415 → JSON-LD). On NSS/CSS the N-Triples body should be fine,
  but it is untested.
- **Non-Control but logged-in users** get "You cannot see who has access" via 403; tested logged out and as bob.
- A user with Control on the item but not on the folder above can't see inherited rules, so can't make own rules
  here (they are told they cannot see). Probably acceptable; upstream has the same gap.
- `If-Match` relies on the server returning an ETag on the ACL GET; JSS does. Without one, saves are unconditional.
- Profile names load through the shared store with a 10 s give-up; unreachable WebIDs show their host name.
- The data browser's own "Private/Public" badge in the header does not refresh after a save (host, not pane).

## Next

- Show the effective access for a logged-in non-owner from `WAC-Allow` ("you can view this") instead of a flat no.
- Test the Turtle path against a Community Solid Server.
- Group editing (read the group document, add/remove members) if wanted.

# Two-person tests: notes (22 Nov 2026)

## The second user, bob

- Server: JSS 0.0.229, pid 402360, cwd `/home/melvin/ideas`, started as
  `jss start --port 8732 --host 127.0.0.1 --root ./jss-data --idp --conneg --single-user --single-user-name me --single-user-password <…> --mashlib-module http://127.0.0.1:8732/me/public/solidos/mashlib/boot.js`
  (not under pm2). Accounts are JSON files in `jss-data/.idp/accounts/` (one `<uuid>.json` plus three index files).
- JSS has no "account create" command (`jss account` has only `delete`), and `--single-user` turns off registration
  and `POST /.pods` (403). Restarting without `--single-user` would have changed the command line, so instead:
- `node make-bob.mjs` (in this folder) imports the installed server's own `createPodStructure` and `createAccount`
  (`src/handlers/container.js`, `src/idp/accounts.js`) with `DATA_ROOT=/home/melvin/ideas/jss-data`: the same two
  calls the server's single-user start-up makes to seed "me". It made `/bob/` (profile, settings, inbox, public,
  private, ACLs) and the account `bob` with WebID `http://127.0.0.1:8732/bob/profile/card.jsonld#me`, password read
  from `local.json` (same as me's).
- **No restart.** The running server reads account files from disk on every login, so bob logged in at once.
- Backups before the change: `.accounts-backup-2026-11-22/` (the accounts folder; holds me's bcrypt hash, not the
  password) and `.lib.mjs.bak` (the helper before the change).
- Bob's profile `foaf:name` was set to "Bob Tester" (on disk, in his own pod) so tests can tell a name read from the
  profile from one guessed from the address.
- Caveat: in single-user mode JSS's `getPodName()` returns `me` for every request, so if quotas were ever turned on,
  bob's writes would count against me's pod. Quotas are off here; not tested.

## local.json and lib.mjs

- `local.json`: added `user2` (bob), `password2` (same as `password`), `pod2`, `podDir2`. Existing keys unchanged.
- `lib.mjs`: `open({ ..., as: 'bob' })` logs in as `user2` with its own browser profile `dir/profile-bob`;
  `export const POD2`; header comment updated. Without `as`, behaviour is byte-for-byte the old path.
- Checked: `table` (56 PASS), `meeting` (51), `data` (84) `node tests/run.mjs` all end `EVERY TEST PASSED`.

## What the tests prove (`node run.mjs` → EVERY TEST PASSED, 51 PASS lines)

`poll.mjs` (me on 9431, bob on 9432, poll in `lab-data/two-person/poll-<time>/`, removed after):
me makes the poll with `mintNew`, offers 12:00–15:00 (three hours), says Yes to the first two. Bob, in his own
browser, is logged in as bob, sees the three hours and my answers, has the answer buttons but no Offer times, no
About this meeting, no Remove. He answers Yes (2nd hour) and If need be (3rd); the answers file on the server has
both under his WebID as a separate response. Me, after a reload: 1st hour "1 yes" (me); 2nd "2 yes" (me, Bob Tester)
with "Best so far" on it alone; 3rd "0 yes · 1 if need be" (Bob Tester (if need be)); "2 people have answered";
bob's name comes from his profile.

**Can bob change my answer? Yes.** With his own logged-in fetch, bob sent
`PATCH results.ttl` (`application/sparql-update`):
`DELETE DATA { <…results.ttl#r…-…> sched:availabilty sched:Yes . } ; INSERT DATA { <same cell> sched:availabilty sched:No . }`
→ `204`, and my Yes on the first hour became No. A second PATCH deleting my response's link and author → `204`,
and the pane then shows none of my answers. This is the server doing what the ACL says (`acl:AuthenticatedAgent`
Read+Write on `results.ttl`, as the poll README warns), not a server bug: WAC has no per-person ownership of
triples. Not fixed, as asked.

`sharing.mjs` (folder `lab-data/two-person/shared/` with `secret.ttl`, me-only ACL, rebuilt each run):
bob GET file/folder 403/403, PUT 403 → me adds bob by WebID "can view" in the pane (row and summary show "Bob Tester")
→ bob GET 200/200, PUT 403, file unchanged → bob opens Sharing on the folder: state `denied`, "You cannot see who
has access to this. Only someone with control of it can.", zero controls, no list → me raises bob to "can edit"
→ bob PUT 204, on disk → me removes bob → bob GET/GET/PUT 403/403/403. No sideways scroll at 1300 px for either.

Screenshots looked at (1300 px): `shots/poll-me-both.png`, `shots/poll-bob-after.png`,
`shots/sharing-me-bob-view.png`, `shots/sharing-bob-view-only.png`.

## Surprises

- The sharing pane shows a person's WebID in place of their name until the profile has loaded; a review clicked
  straight after "Add" says "http://…/bob/profile/card.jsonld#me can now view". The test waits for the name.
  Cosmetic, a timing matter, not a bug.
- In bob's browser the data browser shows a "me" header card above the pane (the pod owner's card, on someone else's
  pod). Looks intentional; noted only.
- The poll shows 12-hour times ("12:00 PM to 01:00 PM") in the headless browser's locale.

## Known JSS findings run into

None of REPORT.md's 1–7 was hit: these flows use named nodes, no `dct:`, no braces in literals, no folder DELETE.

## New suspected bugs

None found. The only uncomfortable result (bob can rewrite or delete my poll answers) is by design of the poll's ACL.

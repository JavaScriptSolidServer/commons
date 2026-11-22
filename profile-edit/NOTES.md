# Notes: profile-edit

## Unverified

- **Editing the real logged-in profile is unverified.** Every write test runs on copies in
  `lab-data/profile-edit/` (Alice in JSON-LD, Carol in Turtle), opened directly. The tests check the hash of
  `/me/profile/card.jsonld` is unchanged. The real profile has the same JSON-LD shape as Alice's copy, with no blank
  nodes, so it should behave like it, but nobody has pressed Save on it.
- **A second person** cannot be tested (one test user). "Can edit" is whatever `store.updater.editable` says;
  someone with Write access to another person's profile would be offered the pane too. That seems right.
- **Upstream display:** checked in SolidOS's own profile pane on this pod for name, job, town, skill, language, email
  and bio. This browser page draws no profile heading, so pronouns and the photo in upstream's heading were checked
  only against upstream's source (`profileHeadingData.js` reads the same predicates), not on screen.
- Friends' names are tested with the test user's own WebID only (the only profile on the pod).

## Judgement calls

1. **Plain values, not RDF lists.** Upstream writes languages and accounts as RDF lists and saves them by PUTting the
   whole document. The brief says never rewrite the document, and a list can't be patched without blank nodes. So new
   items are plain repeated values (both readers handle those). An item already inside a list is removed by deleting
   its own description; the list keeps a reference to an empty node, which both readers skip. Blank-node items are
   shown but cannot be removed (button disabled, with a reason).
2. **Job title and organisation edit the current role**, because that's the only place upstream reads a job title
   from. If there is no current role, it makes one (`solid:CurrentRole` with `org:member`). If the profile instead has
   `vcard:title` / `schema:jobTitle` and no role (old shape), that is edited in place and no role is invented. An
   organisation shared with another role is not renamed; a new organisation node is linked instead.
3. **Read back after every save.** After each PATCH the pane fetches the document separately (not through the shared
   store, which would make SolidOS redraw the page) and checks the change is really there. That was added because of
   the JSS bug below: the server answered 200 and silently lost text. On a mismatch it says "Not saved as typed", puts
   the store back in line with the server, and keeps your text.
4. Skills are written as `<#id> schema:name "X"`, not upstream's `<#id> solid:publicId _:b . _:b schema:name "X"`:
   no blank nodes, and both readers accept it.
5. Accounts get `foaf:homepage` and `rdfs:label` as well as upstream's `foaf:accountName`, because the view pane can't
   build a link for upstream's `GithubAccount` (it knows `GitHubAccount`) or Mastodon from a handle alone.
6. Photo: replaces whichever of `foaf:img` / `vcard:hasPhoto` the profile uses (upstream's `vcard:hasPhoto` if none).
   SVG uploads are refused (they can carry script if opened directly). The old uploaded file is not deleted.
7. Bio is written to `vcard:note`; a `schema:description` is left as it was (the view pane prefers `vcard:note`).
8. A WebID may be `http://localhost` / `127.0.0.1` as well as https, so local pods can be tested. Everything else is
   https only.
9. The pane is offered on the profile document too (when its `foaf:primaryTopic` is a person), because that is
   where SolidOS shows the "More options" menu; on `#me` the profile view draws no pane menu at all.

## JSS bugs found (JSS 0.0.229; not fixed here, reported for the record)

1. **SPARQL Update loses text with `}` or `"`.** `src/patch/sparql-update.js` parses with regexes like
   `/INSERT\s+DATA\s*\{([^}]+)\}/` and `/^"([^"]*)"/`. A bio containing `{curly}` or `"quotes"` is cut short: the DELETE
   applies, the INSERT is lost, and the server still answers success, so the old bio is gone. Repro: `edit.mjs`, the
   "bio with braces and quotes" step (the pane now reports it instead of saying Saved). Workaround in the pane: the
   read-back check. A real fix is a proper SPARQL Update parser (I did not check whether the N3 Patch path has the same problem; rdflib sent SPARQL Update here).
2. **JSON-LD storage drops blank nodes and `@list` on PATCH.** A profile stored as JSON-LD with a nested object
   without `@id` (e.g. a `cert:key` written inline) or an `@list` loses them: Turtle conneg output omits them, and the
   first PATCH rewrites the file without them. That deletes keys the pane never touched. The real `/me` profile has
   no such nodes today. Turtle-stored files keep both.
3. **Compact IRIs in `@id` are not expanded** (`{"@id": "lang:en"}` with `lang` in the context comes back as
   `<lang:en>`). The Alice sample uses full IRIs for that reason.
4. Cosmetic: blank-node labels in Turtle files grow by a prefix on every PATCH (`_:b911_b909_b907_…`).

## Upstream quirks seen (not this pane's)

- SolidOS's profile pane shows `tel:+420777000111` as "777000111" (drops the country code), and `+351-210-000-000`
  as "-210-000-000".
- It shows a broken icon for an `OtherAccount` with no `foaf:icon`.

## Next

- An editor for resume roles (dates, past roles) and for projects/communities.
- Editing an item in place (change an email's kind) rather than remove-and-add.
- Ask before removing the last name or photo? Currently one press removes.
- If JSS fixes bug 1, the read-back check stays useful for any server; keep it.

## Phase 2: the suite restyle (judgement calls, unverified, needs a decision)

Judgement calls:

1. **The large avatar is the Profile picture card, first on the page**, not a second copy in the header (the old
   header photo is gone; the title is the name). 96 px = `calc(var(--sui-avatar-lg) + var(--sui-space-8))`: the
   sheet's largest avatar is 64, which reads small for "the avatar large at the top"; 96 is also the size the
   sheet's empty-state circle uses. Built from tokens, no new value.
2. **Navigation jumps, it does not page.** Nine cards in the shell's left column, a click scrolls to the card and
   marks it; the page stays one long form (Nextcloud's Personal info is one page too). No scroll spy.
3. **One toast per press in the shell**: the "About you" form toasts its summary ("2 saved"); per-field lines stay
   empty on success and show failures in place. Lists and the photo toast "Added", "Removed", "Photo saved".
   Alone, everything stays as status lines in place, as before (the tests rely on them).
4. **List remove buttons are icon buttons** (bin, `aria-label` "Remove <item>", title "Remove"); the photo's
   "Remove photo" keeps its words. Class names the tests use (`pfe-msg`, `pfe-list`, `pfe-remove`, `pfe-photo`,
   `data-part`, `data-field`) are kept, so no behavioural check changed; the data folder moved to
   `suite-data/profile-edit/` and the port to 9530.
5. Pieces built from tokens (no recipe): the section card (as in settings), the file input (its
   `::file-selector-button` as a grey pill), pill `<select>`s, list rows (44 px, 8 px radius, hover). The
   "keep" line is the sheet's note with a lock icon; the logged-out message is a warning note.
6. Pane icon: MDI account in `--sui-primary-element`.

Viewport: `layout.mjs`, `shell.mjs` and `loggedout.mjs` use `design/viewport.mjs` (CDP device metrics, a true
400 CSS px).

Unverified: in the shell, opening a WebID directly (not from the avatar menu) shows another app first; Edit profile
is under "Other views" (tested on Alice). Saving in the shell on the real profile was not pressed (read only).

### Needs a decision

- **The sheet has no card, select or file-input recipe**; built here from tokens (same card as settings). Worth a
  `card` and `select` section in `recipes.css` if more panes need them.
- **Avatar size**: a `--sui-avatar-xl` (96) token would make the "large avatar at the top" a sheet value instead of
  a calc in this pane.
- (Test note) During this phase `tests/.acl` appeared in every pane's `tests/` folder (owner-only; not written by
  me). The page's `import()` sends no login, so the copy of the view pane in `tests/view/` stopped loading. The tests
  now read its source in Node and import it in the page from a `blob:` address. No pane change.

## After the review (REVIEW.md)

- **Never a PATCH now** (findings 1, 2): every change is a whole-document GET (as stored, with ETag) → change in
  memory → PUT with `If-Match` in the same content type → GET and compare every statement; on any difference the
  original text is PUT back and checked, and the field says so. Text with `}` and quotes now saves exactly (the old
  test that accepted "not saved as typed" now requires "Saved" and the exact text). JSON-LD is written flat and
  expanded (one object per subject with an `@id`, full IRIs, `@list` kept): the statements stay, the file's form
  (context, nesting) does not. Judgement call: correctness over a pretty file.
- Finding 3: offered only on the logged-in WebID, or an editable profile naming a `solid:oidcIssuer`.
- Finding 4: when the pod refuses or stores something else, the field is reset to the stored value and says so, so
  the next Save sends only fields the person changed. A field that fails the pane's own check (not https, empty
  name) keeps the typed text, as before.
- Unverified: the restore path is tested by altering the first PUT in the page, not with a real faulty server.
- `--sui-avatar-xl` appeared in the sheet this round; the 96 px avatar now uses it (block refreshed with
  `design/embed.mjs`, no hand edits). The new select/file recipes are not adopted yet.

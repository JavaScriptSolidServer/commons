# Notes: settings pane

## Unverified

- **Writing to the real logged-in profile and preferences file is unverified.** By the task's rules every write
  test runs on Alice, a made-up person whose files sit in this lab's pod folder (editable by the test user).
  The real `/me/profile/card.jsonld` and `/me/settings/prefs.jsonld` were only read; `own.mjs` compares them on
  disk before and after. The code path is the same (the pane works on whatever subject it is opened on), but
  the real files are JSON-LD, Alice's are Turtle.
- **A second real person** cannot be tested (one test user). "Someone else" is Bob: a profile with an ACL
  that gives everyone, the test user included, read only. The pane is not offered there.
- **That the switches change which panes show** was not tested end to end. They write exactly what upstream's
  form writes (`<WebID> a solid:PowerUser` in the preferences file), and upstream's `getUserRoles` reads every
  `rdf:type` of the WebID in that file, so it should hold; "takes effect next load" is from reading that code.
- **Identity provider "Not checked"** only appears for a provider on another site that blocks the page's
  request (CORS). Not exercised: Alice's and the real provider are both the local server, so both are Found.

## A JSS bug that matters here (noted here only; JSS untouched)

JSS's SPARQL Update handler (`src/patch/sparql-update.js`) matches `DELETE {…} INSERT {…} WHERE {…}` with a
regex and **ignores the WHERE clause**, then answers 200. rdflib sends exactly that form for any change
touching a blank node, and rdflib prefers SPARQL because JSS lists `application/sparql-update` in
`Accept-Patch`. Result: an app that upstream SolidOS trusted (upstream always writes a blank node) can be
listed but **not changed or removed on JSS**, and a naive pane would report success. JSS's N3 Patch path
(`src/patch/quads.js`) does handle `solid:where` properly, so either fixing the SPARQL path or listing
`text/n3` first in `Accept-Patch` would fix it. Local workaround in this pane: after every write it reads the
document back from the pod into a separate graph and only then says "saved"; on a mismatch it says
"Not changed…" (naming the blank-node cause) and undoes its local copy. Tested. Nothing junk was written to the
profile by the ignored patches (checked).

## Judgement calls

1. **New trusted apps are named nodes**, `<profile#trusted-<host>-<4 random>>`, not blank nodes as upstream.
   Same meaning to any reader of `acl:trustedApp`; avoids the blank-node patch problem above for everything
   the pane itself creates. Blank-node entries from other apps are still read and shown.
2. **Verify by reading back, in a separate graph.** First version reloaded the shared store; on a preferences
   file that made the data browser redraw its default pane and throw the person out of Settings. Reading into
   a fresh `$rdf.graph()` leaves the shared store alone.
3. **Four levels, fixed mode sets**: View = Read; View and add = Read+Append; Edit = Read+Write; Control =
   Read+Write+Control. Read+Append+Write counts as Edit (WAC Write implies Append). Odd sets show "As listed"
   with the modes in words; picking a level only adds/removes the modes that differ.
4. **Origins: https only**, no path, query, fragment, user or password, and a plausible host. A bare host gets
   `https://` added. This means `http://localhost:3000` (an example upstream gives) cannot be trusted; I kept
   the task's "https origin" literally.
5. **Two switches, not upstream's single "Level of user" select.** Upstream's form is a `ui:Classifier` over
   `solid:User` subclasses (one choice), but its reader checks each type independently, and a pane with
   `audience: [Developer]` and another with `[PowerUser]` can only both show if both types are set. Two
   independent statements are safe to patch. Upstream's form may show only one of them if both are set.
   Nothing upstream stores was unsafe to write, so nothing is read-only on principle; the switches are
   read-only only when the preferences file is missing, unreadable or not editable, and the pane says which.
6. **"Viewer is that person"** = logged in as the WebID, or `store.updater.editable(subject doc)` is true.
   The second is what lets the pane open on Alice. It also means anyone with write access to someone's
   profile (e.g. a pod admin) sees their settings: that is the rule the task set.
7. **Person from a preferences file**: the logged-in user if their profile names it; else whoever's loaded
   profile names it; else the WebID upstream writes statements about inside it (`solid:privateTypeIndex`,
   `tools:toolIndex`, `rdf:type`). If the profile does not link back, the overview says "this page (your
   profile does not link to it)".
8. **Type indexes are read from both the profile and the preferences file**, any subject, and each address
   says where it was listed when that is not its usual place. The real test pod has two different private
   type indexes (`privateTypeIndex.jsonld` from the profile and the preferences file's `<>`, `.ttl` from the
   WebID in the preferences file); the pane flags "apps may not agree". That is a real finding about the test
   pod's settings, left as it is.
9. **Probing is `HEAD` with the person's own session**, a short `Accept`. The identity provider is probed
   without the session (its public OpenID configuration), so no token goes to another site.
10. **Not reachable by menu on a `#me` WebID.** The data browser hides the pane menu on `#me` addresses
    (`deriveExplorerHeader`), and the task says never take focus, so on a WebID the pane is offered (label
    says yes, it is in `relevantPanes`) but there is no menu to pick it from. The preferences file does have the
    menu, and "Settings" is listed there (tested). Next step would be an entry from the account menu, as
    upstream's dashboard does, or applying it to the profile document (no fragment) too.

## Next, if this went further

- Offer to create a missing preferences file / private type index (and link it), with the exact writes listed.
- Ask the JSS fix above (or N3 first in `Accept-Patch`); then blank-node apps become editable with no pane change.
- An account-menu entry so the pane is reachable from a WebID.
- Test on the real JSON-LD profile with a throwaway account once a second test user exists.

## Phase 2: the suite restyle (judgement calls, unverified, needs a decision)

Judgement calls:

1. **Navigation jumps, it does not page.** Nextcloud's settings show one section per navigation item. Here the
   three cards stay on one page and the shell's left column scrolls to the chosen one (and marks it). Splitting
   them would change behaviour ("Check again" re-checks everything the page shows, tests read all three at
   once) for no gain with only three short sections. The mark does not follow manual scrolling (no scroll spy).
2. **"Overview" is now titled "Your pod"**, a heading a person understands; `data-item` keys, help texts and
   chip states are as before. The status pills are the sheet's chips: Found = success, Missing / Not readable /
   Not set up = warning, Not checked / Checking = plain.
3. **Feedback in the shell is the shell's toast** for a saved change; errors and refusals stay in place as an
   error note above the cards (they need reading and often a fix in the form). Alone, a success is a green status
   line in place, as before. "Saving…" now shows in that line while a patch runs.
4. **Switches are the sheet's `<label><input type=checkbox role=switch>`**, not the old button with
   `aria-checked`; a change event writes. Tests updated to read `.set-switch input` `checked`/`disabled`.
5. **Control warning**: Cancel first, then the danger button, as the sheet orders modal actions. Remove is a
   tertiary button with a bin icon that turns into the danger style on the first click ("Click again to remove").
6. Pieces built from tokens because the sheet has no recipe: the section **card** (bg, border, radius-lg,
   space-6 padding; the same as the sample page's own section boxes), the overview **item grid**
   (`auto-fill, minmax(min(100%, 300px), 1fr)`), the trusted-app row (the `row` recipe with wrapping and no
   hover, actions dropping under the text below 600 px). `.set-root .set-note { border: 0 }` undoes a red border
   the data browser puts on `[role=alert]`.
7. **Selects are pills** (`set-input` on `<select>`, native arrow kept). The sheet has no select recipe.
8. Pane icon: MDI cog in `--sui-primary-element` (#00679e), not the old blue sliders.

Viewport: the 400 px checks use `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`, a true 400 CSS
px), in `settings.mjs 400`, `shell.mjs` and `loggedout.mjs`.

Unverified: the shell's own (i) details button is not offered (no `renderDetails`; Nextcloud's settings have no
details column). The navigation's look in the shell relies on the pane's `<style>` (in the content) also styling
the nav column, which is in the same document; checked by `shell.mjs` (44 px, 8 px radius, pale blue current).

### Needs a decision

- **On a WebID the shell does not choose Settings by itself.** Opening a person's WebID in the shell (not via the
  avatar menu) shows whichever app claims it first (profile pages); Settings is under "Other views". That is
  right for a WebID, but a `#settings` style deep link would need the shell to remember the wanted pane in the URL.
- **A "Personal info" link in the Settings navigation** (to the Profile app, as Nextcloud's settings list has
  Personal info first) would need `context.suite.go(webid, { pane: 'profile-edit-lab' })`; left out as a new
  feature. Say if wanted.
- **The sheet has no select or card recipe.** Both are built here from tokens; if other panes need them, a
  `select` (pill with a token-coloured arrow) and `card` section in `recipes.css` would keep them alike.

## After the review (REVIEW.md)

- **Never a PATCH now.** Every write is whole-document: GET as stored (`Accept: */*`, JSON-LD or Turtle only) with the
  ETag, change only the named statements in memory, PUT with `If-Match` in the same content type, GET again and
  compare every statement (a canonical form: lists spelled out as first/rest, blank nodes named by their
  surroundings). On any difference the original text is PUT back (If-Match the new ETag), checked, and the pane says
  "put back exactly as it was". JSON-LD is written flat and expanded (one object per subject, each with an `@id`,
  full IRIs, lists as `@list`) because JSS's own handling of nested objects and compact `@id`s is what loses data.
  The file on disk changes form (contexts and nesting go) while its statements stay the same. Judgement call:
  readable compaction was not worth a second serializer.
- Blank-node entries (apps another app wrote) are refused before anything is sent, instead of being sent and then
  reported. Matching the store's blank nodes (loaded through the server's Turtle) to the file's is not reliable.
- A statement to remove that is no longer in the file = changed elsewhere: refused, nothing sent.
- Offered on a WebID only when it is the logged-in WebID, or an editable profile naming a `solid:oidcIssuer`
  (contact cards excluded). Preferences files keep the old rule (editable, person found).
- Unverified: the restore path was exercised by altering the first PUT in the page (`window.fetch` wrapped), not by
  a real misbehaving server. Two people editing at once: only the If-Match refusal path is covered (by a file changed
  on disk in profile-edit's test), not two browsers.
- The design sheet changed during this round (new tokens, select/file recipes); the block was refreshed with
  `node design/embed.mjs` (no hand edits). The new select and file recipes are not adopted yet.

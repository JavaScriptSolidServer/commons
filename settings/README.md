# settings

A SolidOS pane for a person's own settings: a health check of where their pod keeps things, the apps they
trust, and the two "user type" preferences the data browser still uses. It replaces two upstream panes,
`trustedApplications` and `basicPreferences` (solid-panes), written from their data format, not their code.

One file, `settings-pane.js`, no imports. Pane name `settings-lab`, tab label **Settings**.

**Try it** (log in as the test user first; it is shown only to the person whose settings they are):

- In the suite shell, your own settings: open this, then your avatar (top right) › **Settings**:
  http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fprofile%2Fcard.jsonld%23me
- Alone, Alice's made-up settings, on her preferences file, then pick **Settings** from the ⋮ menu:
  http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsettings%2Fsettings-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsettings%2Falice%2Fprefs.ttl
- Alone, your own, the same way, on your preferences file:
  http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsettings%2Fsettings-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fsettings%2Fprefs.jsonld

(The data browser hides the pane menu on a `#me` WebID, so although the pane applies there too, the
preferences file is the way in. Alice's data appears once `node tests/run.mjs` has run.)

## In the suite (phase 2)

Restyled with the suite's design sheet (`design/`): the tokens and recipes are copied between the
`suite:design` markers in `CSS` by `node design/embed.mjs settings/settings-pane.js` (sections icon, nav, row,
buttons, input, switch, chip, toast; prefix `set-`). Laid out like a settings page: a title with **Check again**,
then one card per section (heading with icon, a line of help, then the content). **Your pod** (was "Overview") is a
responsive grid of labelled addresses with a status chip each; **Trusted apps** are rows (origin, what it may do,
a pill level picker, Remove), with the add form as pill fields and the one primary button; **Preferences** are the
sheet's switches. The control warning and errors are notes; the Remove button arms to the danger style.

Inside the shell (opened from the avatar menu, `SUITE_APPS` id `settings`) the pane also gives
`renderNavigation`: **Your pod**, **Trusted apps**, **Preferences** in the shell's left column; a click scrolls to
that card and marks it. A saved change is said with the shell's toast instead of the line above the cards. Alone in
the data browser (no `context.suite`) it draws the content only, as before. No `renderDetails`.

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as `data:` URIs
(cog, database, shield-check, tune, earth, refresh, plus, alert, lock, delete).

## When it shows

- On a person's WebID (a subject typed `foaf:Person`/`schema:Person`/`vcard:Individual`, or with
  `pim:preferencesFile`, `solid:oidcIssuer` or `pim:storage` in its profile), or on a preferences document
  (the document itself typed `pim:ConfigurationFile`).
- Only when the viewer is that person: logged in as that WebID; or allowed to edit the document on show
  (the server's `WAC-Allow` header) when it is a preferences file or a WebID profile that names a
  `solid:oidcIssuer` (not a contact card, which is person-typed and editable too). Otherwise `label` returns null. It never takes focus.
- For a preferences file it finds the person as: the logged-in user if their profile names this file;
  anyone whose profile in the store names it; else the WebID upstream writes statements about inside it.

## What it does

1. **Your pod** (the overview; read-only). WebID, identity provider, storage, preferences file, public and private type
   indexes, tool index. Each is a link that opens in the data browser, and each is checked by actually asking
   the pod for it (`HEAD`; the identity provider by its public `/.well-known/openid-configuration`):
   **Found**, **Missing**, **Not readable**, **Not checked** (the server would not let the page ask) or
   **Not set up**. Missing things get a calm line on what that means; a missing tool index links to
   https://solid-apps.github.io/tools/. Where something is listed twice with different addresses (e.g. two
   private type indexes) it says apps may disagree.
2. **Trusted apps**. Each app with its origin and what it may do in plain words ("May see your data and
   add to your data."). Add one (an `https://` origin with nothing after it; a bare host gets `https://`),
   at one of four levels; change a level; remove one (click twice). Granting **Control** shows a plain
   warning and needs a second click.
3. **Preferences**. Two switches, **Power user** and **Developer**: the upstream "user types" that decide
   which panes with an `audience` the data browser offers. They take effect the next time it loads.
4. **Check again** reloads and re-checks everything. A line says password and identity provider are changed
   on the pod server's own account page (no link).

## What it reads

The profile document (the WebID's document), the preferences file(s) it names (or the one on show), and a
`HEAD` of each address in the overview.

## What it writes, and when

A pane runs as the person using it, so this is the whole list. No document is ever created or deleted. Each
change touches only the statements named, but is written **whole, never as a PATCH** (JSS loses inline keys,
emails, lists and text with `}` on a PATCH, ignores WHERE, and still answers yes): GET the document as stored
with its ETag; change those statements in memory; PUT the whole document back with `If-Match` in the same content
type (JSON-LD written flat and expanded, one object per subject with an `@id`, lists as `@list`; Turtle by rdflib);
GET it again and compare every statement. Only then "saved". If anything else differs, the original text is PUT back
and checked, and the pane says so. A change to an entry another app wrote as a blank node is refused before
anything is sent.

| When | Where | Statements |
|---|---|---|
| Trust a new app | profile | `<WebID> acl:trustedApp <#trusted-…>`, `<#trusted-…> acl:origin <https://app.example>`, one `acl:mode` per mode |
| Change an app's level | profile | only that app's `acl:mode` statements that change (removed and/or added) |
| Remove an app | profile | the `acl:trustedApp` link to it and that app's own statements |
| Flip a switch | preferences file | `<WebID> a solid:PowerUser` (or `solid:Developer`), added or removed |

After every write it reads the document back from the pod (into a graph of its own) and only then says
"saved". If the pod said yes but the change is not there, it says so and puts its own view back.

Levels and the modes written:

| Level | Modes |
|---|---|
| View | `acl:Read` |
| View and add | `acl:Read`, `acl:Append` |
| Edit | `acl:Read`, `acl:Write` |
| Control | `acl:Read`, `acl:Write`, `acl:Control` |

An app whose modes are none of these shows "As listed" with its modes in words; picking a level replaces them.

## The data

```turtle
# profile (card.ttl)
<#me> a foaf:Person ;
    solid:oidcIssuer <https://idp.example/> ;
    pim:storage </> ;
    pim:preferencesFile </settings/prefs.ttl> ;
    solid:publicTypeIndex </settings/publicTypeIndex.ttl> ;
    acl:trustedApp <#trusted-notes-example-x1y2>, [ acl:origin <https://recipes.example> ; acl:mode acl:Read ] .
<#trusted-notes-example-x1y2> acl:origin <https://notes.example> ; acl:mode acl:Read, acl:Write .

# preferences file (prefs.ttl)
<> a pim:ConfigurationFile .
<card.ttl#me> a solid:PowerUser ;
    solid:privateTypeIndex <privateTypeIndex.ttl> ;
    <https://pod-os.org/vocab/tools#toolIndex> <toolIndex.jsonld> .
```

Upstream writes each trusted app as a blank node; this pane writes new ones as named nodes in the profile
(`#trusted-<host>-<random>`), which say the same thing and can be changed by this pane. Both are read; blank-node
entries are shown but not changed or removed here.

## Samples

`samples/alice/` is a made-up person (profile, preferences, public type index; the private type index it
links to is deliberately absent, and she has no tool index). `samples/bob/` is a profile the test user may
read but not change, standing for "someone else". `samples/dave/` is a JSON-LD profile and preferences file with
inline objects, lists and an empty string; `samples/contact/` a contact card. The tests copy them all to
`public/suite-data/settings/` on the test pod before they run.

## Tests

```sh
node tests/run.mjs
```

Real headless Chromium on the local test pod, through `../lib/lib.mjs`, port 9529. First it checks the design
block is current (`design/embed.mjs --check`).

- `settings.mjs`: logged in, on Alice: the overview states; trusted apps (refusals, add, control warning and
  cancel, change level, blank-node entry, two-click remove), each checked against the pod's copy and that
  nothing else in the profile changed; switches checked in the preferences file; reload reads back the same;
  the same pane on her preferences file. `settings.mjs 400`: layout and the control warning at a true 400 px
  (`design/viewport.mjs`).
- `whole.mjs`: Dave, a JSON-LD profile and preferences file with an inline key, an inline email, `@list`s, an empty
  string and braces (what a PATCH loses): trust, change level, remove, flip a switch, each compared statement by
  statement (read as JSON-LD) so only the named statements change; a PUT the pod stores differently (simulated) is
  put back exactly; a contact card the viewer may edit is not offered; no preferences file is said as such.
- `shell.mjs`: in the suite shell. The avatar menu opens Settings on the test user's own WebID (read only, files
  compared before and after); the sections in the shell's left column, their look, and the jump to a section;
  Alice's settings in the shell, a switch saved and said with the shell's toast; no sideways scroll at 1300 px
  and a true 400 px, with the navigation drawer open too.
- `own.mjs`: the test user's real WebID, read only (files compared on disk before and after): the overview as a
  health check, the menu on the preferences file offers Settings, and Bob's profile does not get the pane.
- `loggedout.mjs`: logged out, not offered anywhere; drawn by hand it asks to log in. 1300 and 400 px.

## Not done

- Creating a preferences file or type index when one is missing (it says so instead).
- Language, theme, password, identity provider, deleting the account: left out on purpose.
- Changing or removing a blank-node app (one another app wrote): refused before anything is sent; the pane says so.

## Licence

[AGPL-3.0-or-later](LICENSE), copyright Melvin Carvalho.

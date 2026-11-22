# Edit profile

A SolidOS pane for editing your own profile (your WebID document): name, nickname, pronouns, job and
organisation, town and country, home page, a short bio, your photo, and lists of emails, phone numbers,
skills, languages, accounts elsewhere and people you know.

One file, `profile-edit-pane.js`, no imports. Pane name `profile-edit-lab`, label "Edit profile".

## In the suite (phase 2)

Restyled with the suite's design sheet (`design/`): tokens and recipes copied between the `suite:design` markers
in `CSS` by `node design/embed.mjs profile-edit/profile-edit-pane.js` (sections icon, nav, buttons, input, avatar,
toast; prefix `pfe-`). Laid out as a "Personal info" page: the name as the title, a note on what is left alone, then
section cards (icon, heading, a line of help where useful). **Profile picture** comes first, full width, with the
avatar large (96 px) beside the link / upload / remove controls; then **About you** as a responsive grid of labelled
pill inputs with one primary **Save**; then the lists (emails, phones, skills, languages, accounts, people) as cards
of rows with a bin icon button and a pill add form; then Resume. Messages are the sheet's status lines.

Inside the shell (opened from the avatar menu, `SUITE_APPS` id `profile`) the pane also gives
`renderNavigation`: the nine cards in the shell's left column, a click scrolls to that card. A finished change is
said with the shell's toast (one per press: the form's "2 saved", not one per field); failures stay next to the
field. Alone in the data browser it draws the content only, as before. No `renderDetails`.

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), inline as `data:` URIs
(account, camera, email, phone, star, translate, link, account-multiple, briefcase, lock, delete, plus, upload).

## When it is offered

On a person (`foaf:Person`, `schema:Person`, `vcard:Individual`), or on a profile document whose
`foaf:primaryTopic` is one, and only when you are logged in and the data browser says you may change that
document (`store.updater.editable(doc)`), and only when that person is you or is a WebID profile (it names a
`solid:oidcIssuer`): a contact card in an address book is person-typed and editable but not a profile. Otherwise `label` returns `null`. It never takes focus: the
normal profile view opens first, and "Edit profile" is one of the choices in the profile document's
"More options" menu.

## What it reads

Every shape the read-only profile view pane (`profile-pane.js` in [solid-panes/profile](https://github.com/solid-panes/profile)) reads:
`foaf:name` / `vcard:fn`, `foaf:nick` / `vcard:nickname`, `solid:preferredSubjectPronoun` / `preferredObjectPronoun`,
the current role (`org:member` with no end date) or `vcard:title` / `schema:jobTitle`, the first `vcard:hasAddress`,
`vcard:note` / `schema:description`, `foaf:img` / `vcard:hasPhoto` and friends, `vcard:hasEmail` / `foaf:mbox` / `schema:email`,
`vcard:hasTelephone` / `foaf:phone` / `schema:telephone`, `schema:skills` (named, via `solid:publicId`, or plain text),
`schema:knowsLanguage` and `foaf:account` (plain values or RDF lists), `foaf:knows` / `schema:knows`.

## What it writes, and when

Only when you press **Save**, **Add**, **Remove**, **Use this link**, **Upload** or **Remove photo**. Each change
removes the old statements for that one thing and adds the new ones, and is written **whole, never as a PATCH**
(JSS loses inline keys, inline emails, lists and text with `}` on a PATCH, and still answers yes):

1. GET the profile document as stored (`Accept: */*`), with its ETag; JSON-LD or Turtle, nothing else is written.
2. Change only those statements in memory (a statement to remove that is no longer there means the file changed
   since the page read it: refused, nothing sent).
3. PUT the whole document back with `If-Match` and the same content type (JSON-LD is written flat and expanded:
   one object per subject, each with an `@id`, lists kept as `@list`; Turtle by rdflib).
4. GET it again and compare **every** statement with what was sent (blank nodes compared by shape). Only then
   "Saved". If anything differs, the original text is PUT back (If-Match the new ETag), checked, and it says
   "Not saved: … put back exactly as it was" (or, if even that failed, says to check the profile now).

```turtle
<#me> foaf:name "Alice Example" ;                       # vcard:fn too, if the profile already has one
  foaf:nick "alice" ;                                    # vcard:nickname instead/too, if that is what is there
  solid:preferredSubjectPronoun "she" ; solid:preferredObjectPronoun "her" ;
  vcard:note "Short bio" ;
  foaf:homepage <https://alice.example.org/> ;
  vcard:hasPhoto <https://…/photo-xyz.png> ;             # or foaf:img, whichever the profile already uses
  vcard:hasAddress <#id1> ;
  vcard:hasEmail <#id2> ; vcard:hasTelephone <#id3> ;
  schema:skills <#id4> ; schema:knowsLanguage <#id5> ; foaf:account <#id6> ;
  foaf:knows <https://bob.example/profile/card#me> .
<#id1> vcard:locality "Lisbon" ; vcard:country-name "Portugal" .
<#id2> a vcard:Work ; vcard:value <mailto:alice@example.org> .
<#id3> a vcard:Cell ; vcard:value <tel:+351210000000> .
<#id4> schema:name "JavaScript" .
<#id5> solid:publicId <https://www.w3.org/ns/iana/language-code/pt> ; schema:proficiencyLevel "Fluent" .
<#id6> a <https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#GithubAccount> ;
  rdfs:label "GitHub" ; foaf:accountName "alice" ; foaf:homepage <https://github.com/alice> .
# job title and organisation edit the current role (made if there is none):
<#id7> a solid:CurrentRole ; org:member <#me> ; vcard:role "Engineer" ; org:organization <#id8> .
<#id8> a schema:Organization ; schema:name "Example Labs" .
```

New things get `#id<number>` names in the profile document, as SolidOS's own editor does.

- **Removing** a plain value removes its link and, when the item is described only in this document, that
  description. An item inside an RDF list keeps its place in the list and loses its description, so no reader
  shows it. People you know: only the `foaf:knows` link goes, never anything about them.
- **Upload** PUTs the picture next to the profile (`photo-<random>.png` etc.) with `If-None-Match: *`, then points
  the profile at it. PNG, JPEG, GIF, WebP or AVIF, up to 2 MB. Removing the photo does not delete the file.
- **Addresses accepted:** `https:` for links, photos and accounts; `mailto:` and `tel:` for contacts. A WebID may also
  be `http://localhost` or `http://127.0.0.1` (for local pods).

## What it never touches

Keys (`cert:key`, CID verification methods), `solid:oidcIssuer`, `pim:storage`, `pim:preferencesFile`,
`solid:publicTypeIndex` / `privateTypeIndex`, `ldp:inbox`, `solid:account`, `solid:editableProfile`, `foaf:primaryTopic`,
`foaf:maker`, and anything in the ACL, cert, CID, security or pim vocabularies. Every change is checked against this list
before it is sent, and refused if it would touch one. Anything written as a blank node is shown but not changed.

## Try it

In the suite shell, logged in as the test user: open this, then your avatar (top right) › **Profile**. (This is your
real profile: Save writes to it.)

http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fprofile%2Fcard.jsonld%23me

Alone, on a copy of a made-up profile:

http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fprofile-edit%2Fprofile-edit-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fprofile-edit%2Falice%2Fprofile%2Fcard.jsonld

Then choose **Edit profile** in the "More options" (⋮) menu. (The copy is made by the tests; run them once first.)
Samples: `samples/alice/profile/card.jsonld` (JSON-LD, as JSS stores profiles) and `samples/carol/profile/card.ttl`
(Turtle, older shapes, RDF lists, blank nodes), `samples/dave/profile/card.jsonld` (JSON-LD with an inline key,
an inline email, a language `@list`, an empty string, braces) and `samples/contact/card.ttl` (a contact card).

## Tests

`node tests/run.mjs` (needs the test pod and `../local.json`; port 9530). It must end with `EVERY TEST PASSED`.
It first checks the design block is current (`design/embed.mjs --check`). Test copies live in
`suite-data/profile-edit/`.
`edit.mjs` logs in and does every action on Alice's copy, checks the pod after each, reloads, then checks the result
in the view pane (a copy in `tests/view/`) and in SolidOS's own profile pane. `turtle.mjs` does the same on Carol's
Turtle copy. `layout.mjs` checks a true 400 px (`design/viewport.mjs`); `whole.mjs` saves a name and bio with braces, and a skill, on Dave's JSON-LD copy with an inline key, inline
email, language `@list` and empty string, comparing every statement (read as JSON-LD); simulates a pod that stores
something else (the original is put back, the field shows the saved value); refuses when the file changed
meanwhile; and checks a contact card is not offered. `shell.mjs` opens Profile from the shell's
avatar menu on the test user's own WebID (read only), checks the cards in the shell's left column and the jump to
one, saves a field on Alice's copy in the shell (one toast), and checks 1300 px and a true 400 px with the drawer open;
`loggedout.mjs` checks the logged-out case at 1300 and a true 400 px. They never write to the real
profile (`/me/profile/card.jsonld`) and check its hash is unchanged.

## Not done

- Resume / CV roles (dates, past roles, descriptions): shown as a note, not editable. Job title and organisation
  change only the current role.
- Changing the WebID; privacy controls; projects and communities; date of birth; full postal address (only town and
  country); reordering lists; editing an item in place (remove and add instead).

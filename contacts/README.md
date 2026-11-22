# contacts

A dynamic SolidOS pane for an address book kept in a pod: a list of people you can search and filter by group,
and everything known about each person. It replaces the upstream contacts pane and keeps its data format, so a
book made there opens here and the other way round.

One file, `contacts-pane.js`, no imports. Loads at runtime by link.

**Try it locally** (the test pod must be running). In the suite shell (log in to add and change people):
[the sample book in the shell](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fcontacts%2Fsamples%2Fbook%2Findex.ttl%23this)

Alone in the data browser:
[the sample book](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fcontacts%2Fcontacts-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fcontacts%2Fsamples%2Fbook%2Findex.ttl%23this)
· [one card on its own](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fcontacts%2Fcontacts-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fcontacts%2Fsamples%2Fbook%2FPerson%2Fbob%2Findex.ttl%23this)

## Suite look (phase 2)

Restyled to the suite's design sheet (`design/`: tokens and recipes copied in with `node design/embed.mjs contacts/contacts-pane.js`,
sections icon, nav, row, buttons, input, chip, avatar, empty, toast) and laid out the way Nextcloud Contacts is:

- **In the suite shell**: the left column (`renderNavigation`) has a **New contact** pill on top, **All contacts** with a
  count, then a **Groups** caption with each group and its count, and **New group**. The content is the contact list
  (search box, rows with initials or photo avatars) and, beside it, the selected contact's card: big avatar, name,
  role and organisation, then the fields with icons. The header's search box filters the list too (`search`).
  Results of saving are toasts (`context.suite.toast`). No details column: the card is the content.
- **Alone** (no `context.suite`): the same content, with the groups as chips above the list and New contact / New
  group as buttons by the title; results as a line under the title.
- Below 760 px the list and the card stack: the list first, then the card in its place with an **All contacts** back
  button. Works at a true 400 px with no sideways scroll, alone and in the shell.
- Behaviour, data and what it writes are unchanged. Wording changed: "Add person" is now **New contact**,
  "Everyone" is **All contacts**.
- Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), as inline SVG `data:` URIs.

## What it does

- Opens on a `vcard:AddressBook` (or its `index.ttl`). Shows the book's title and how many people are in it.
- A list of people, sorted by name, with role and organisation under each name. Search matches names, role,
  organisation, notes, emails and phone numbers.
- The book's groups (in the shell's left column, or as chips above the list when alone): pick one to see only its members; "All contacts" shows all.
- A person's card: photo (or initials), name, role and organisation, emails and phones as `mailto:` and `tel:`
  links with their kind (Work, Home, Cell), postal address, birthday, WebID and web sites as links, notes, groups.
- Two columns on a wide screen; on a phone, the list, then the card in its place with "All contacts" to go back.
- Opens on a single `vcard:Individual` card too, read-only, and names the book it is in when that is
  `../../index.ttl` (the usual place).
- For someone the pod lets write (logged in, and the server's `WAC-Allow` says so): **New contact**, **Edit**,
  **New group**, add to a group (a menu on the card), take out of a group (the × on its tag), and **Delete**, which
  asks for a second press. The controls are not shown to anyone else; a logged-out visitor is told to log in.
- With the pane loaded, a folder's Add menu offers a **new address book**.

## What it writes

A pane runs as the person using it, so this is the whole list. Nothing is written until a button is pressed.

| When | What |
|---|---|
| New address book (Add menu) | `index.ttl`, `people.ttl`, `groups.ttl` in the new folder, each `PUT` with `If-None-Match: *`. No access rule: the book inherits the folder's. |
| New contact | a new `Person/<uuid>/index.ttl` (`PUT`, `If-None-Match: *`), then their name and `vcard:inAddressBook` in `people.ttl`. If that second step fails, the new card is deleted again (or the message names where it was left). |
| Edit | the card. A changed name is changed in `people.ttl` and in each group file that holds a copy of it. |
| New group | a new `Group/<Name>.ttl` (`PUT`, `If-None-Match: *`), then its entry in `groups.ttl` |
| Add to / take out of a group | that group's file only |
| Delete | their entries in `people.ttl` and every group, then `DELETE` of the card and of its `Person/<uuid>/` folder when empty, **only if the card is inside the book's folder** (and is not one of the book's own files). An entry pointing anywhere else is taken out of the book and its file is left alone. |

**Where:** the pane writes and deletes only inside the address book's own folder (the folder of `index.ttl`). A
people or group entry pointing at a file elsewhere is shown, but that file is never written or deleted; such a card
has no Edit.

**How:** an existing file is never patched. It is written back whole with a `PUT` guarded by `If-Match` (its ETag),
then read back; if the read-back does not hold what was meant, the pane says "Not saved: the pod did not keep it as
typed" and never "Saved.". Why: JSS loses a value holding `}` from a SPARQL patch while answering 204, and patches
blank nodes badly (JSS findings 1 and 5; NOTES.md). Nothing written has a `dct:` predicate (JSS finding 4). A
`PUT` stores the file as JSON-LD on JSS; it is served back as Turtle.

## The data

The upstream contacts pane's format, `http://www.w3.org/2006/vcard/ns#`:

```turtle
# index.ttl
<#this> a vcard:AddressBook ; dc:title "Contacts" ; acl:owner <WebID> ;
    vcard:nameEmailIndex <people.ttl> ; vcard:groupIndex <groups.ttl> .

# people.ttl
<Person/1a2b/index.ttl#this> vcard:inAddressBook <index.ttl#this> ; vcard:fn "Alice Example" .

# groups.ttl
<index.ttl#this> vcard:includesGroup <Group/Friends.ttl#this> .
<Group/Friends.ttl#this> a vcard:Group ; vcard:fn "Friends" .

# Group/Friends.ttl
<../index.ttl#this> vcard:includesGroup <#this> .
<#this> a vcard:Group ; vcard:fn "Friends" ; vcard:hasMember <../Person/1a2b/index.ttl#this> .
<../Person/1a2b/index.ttl#this> vcard:fn "Alice Example" .

# Person/1a2b/index.ttl
<#this> a vcard:Individual ; vcard:fn "Alice Example" ; vcard:role "Mathematician" ;
    vcard:organization-name "Example University" ; vcard:note "Met at the workshop." ;
    vcard:hasEmail <#email1> ; vcard:hasTelephone <#phone1> ;
    vcard:hasAddress <#address> ; vcard:hasPhoto <photo.jpg> ; vcard:url <#webid> .
<#email1> a vcard:Work ; vcard:value <mailto:alice@example.org> .
<#phone1> vcard:value <tel:+44-20-7946-0000> .
<#address> vcard:street-address "1 Example Street" ; vcard:locality "Prague" ;
    vcard:postal-code "110 00" ; vcard:country-name "Czechia" .
<#webid> a vcard:WebID ; vcard:value <https://alice.example.org/profile/card#me> .
```

A person with a WebID is listed in a group by the WebID, linked back to the card, as upstream does:
`<#this> vcard:hasMember <https://…/card#me> . <https://…/card#me> owl:sameAs <../Person/1a2b/index.ttl#this> .`
The pane reads both shapes and writes this one when the card has a WebID.

Read as well: an email or phone given directly (`vcard:hasEmail <mailto:…>`) or as a literal, `vcard:url` straight
to a web page, `vcard:photo`, `vcard:bday`. Upstream's `owl:sameAs` aliases are followed only inside group files.

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/contacts/contacts-pane.js')).default)
```

or `?pane=<that address>&uri=<a book>` on the data browser, as in the links above.

## Not done

- Importing vCard files, merging duplicates, drag and drop (left out on purpose).
- Editing the address, photo, birthday, WebID or web sites: shown, not editable. Renaming or deleting a group.
- Editing a card opened on its own (outside its book): read-only, because a new name must also go to `people.ttl`.
- Two people at once: `tests/two-person.mjs` covers a book shared read-only and read-write with a second user. Two people editing the same file at the same moment get a 412 ("changed somewhere else") for the later save; not tested.

## Tests

```sh
node tests/run.mjs
```

`static.mjs` checks the house rules on the source and that the design block is current (`design/embed.mjs --check`).
`contacts.mjs` logs in to the local test pod and makes a book, groups and people, edits, groups and ungroups,
deletes, reloads, then edits a copy of the hand-written sample (blank nodes, a member by WebID), then repeats the
layout at a true 400 px. `review.mjs` holds one regression check per REVIEW.md fix. `two-person.mjs` shares a book with the second user. `sample.mjs` reads the sample logged out at 1300 and a true 400 px. `shell.mjs` opens a
copy of the sample inside the suite shell, logged in: the navigation (counts, filter, current item), the header
search, a card, New contact from the navigation (toast, pod file), then a true 400 px (drawer, list then card, back).
True 400 px = CDP device metrics via `design/viewport.mjs`. Ports 9515 and 9516. Screenshots land in
`tests/shots/`. Test books are made under `suite-data/contacts/` and removed.

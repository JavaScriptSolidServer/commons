# Review: profile-edit

Reviewer's probes: copies in `suite-data/profile-edit-review/` — `real/` (the test user's real `card.jsonld`,
addresses rewritten to the copy) and `old/` (a JSON-LD profile with an inline `cert:key`, an inline
`vcard:hasEmail` and an `@list` of languages), plus a vCard contact card in `suite-data/settings-review/contact/`.
The real profile at `/me/profile/card.jsonld` was never written. Logged in on port 9575; screenshots
`tests/shots/review-probe/shots/review-*`. Line numbers are `profile-edit-pane.js`.

| # | severity | where | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | profile-edit-pane.js:489-525 (`change`), 554 | **Saving the name wipes the keys and other inline items of a JSON-LD profile, and the pane says "Saved".** On `old/card.jsonld` I changed the name only: "Saved", "1 saved"; the file on disk afterwards has **no `cert:key`, no `vcard:hasEmail`, no `schema:knowsLanguage`** (JSS finding 6). The page says "Your keys … This pane leaves them exactly as they are" and the README says blank-node items are "shown but not changed". The author's NOTES know the server does this, but the pane neither refuses nor detects it: the read-back check compares only the triples it sent. | Before the first PATCH, fetch the document as JSON-LD; if it holds nested objects without `@id`, `@list` or empty strings, refuse to save with a plain note (or offer one whole-document PUT with `If-Match` that keeps them). After each save compare the whole document, not only the change. |
| 2 | bug | profile-edit-pane.js:505-516 | **A failed save leaves the profile damaged.** Bio `Code: if (x) { y }` after a saved bio: the old bio is deleted on the pod and the new one dropped (JSS finding 5); the pane says "Not saved as typed … Check the profile" and stops. Name `Me {the} tester`: the profile now has **no `foaf:name`** (after a reload the title is the document's address and the Name field is empty). The pane knows exactly which old statements were deleted and does not put them back. | On a mismatch, re-insert the deletions the server no longer holds (and check that); better, refuse `}` and `PREFIX`-like text before sending, saying why. |
| 3 | bug | profile-edit-pane.js:452-458 | "Edit profile" is offered on any person-typed thing the viewer may edit, e.g. a contact card in my own pod (`vcard:Individual`): label returns "Edit profile", and the editor then writes `foaf:name`, `vcard:hasPhoto`, `foaf:knows` and so on into the contact. | Offer it only on the logged-in WebID (or a document whose primary topic is that WebID). |
| 4 | nit | profile-edit-pane.js:752 | After a field fails, `row.was` becomes the stored value while the field keeps the typed text, so the next Save of any other field re-sends the failed one: one name change reported "2 not saved". | Leave `was` alone on failure, or reset the field to the stored value and say so. |

## Two-person

Not asked for this pane. Not tested.

## Checked and fine

- Real profile copy: ordinary saves (bio) changed only the triples sent; nothing else in the document went (whole-document triple compare against the original). The only loss was the name lost in finding 2.
- Guard list: every change is checked against keys, `oidcIssuer`, storage, preferences, type indexes, inbox, ACL/cert/CID/pim namespaces and blank nodes before sending.
- Writes: `store.updater.update` patches and the photo `PUT` with `If-None-Match: *`, as the README lists. `busy` refuses a second change while one is under way.
- Safety: no `innerHTML`/`eval`; links via `safeHref` (http(s)/mailto/tel) with `rel="noopener"` (accounts `noopener noreferrer`, new tab); photos only http(s)/`data:image`; https checked on input.
- 400 px: true 400 px alone on Alice's copy: no sideways scroll; one-column pill fields; targets 44 px.
- Design: sheet tokens/recipes current; cards with icons, one primary Save; navigation column in the shell.

## Fixed

1. Every write is a whole-document GET → change in memory → PUT with `If-Match` (same content type) → GET and
   compare every statement; on a difference the original is PUT back and the pane says so. No PATCH at all.
   Regression: `tests/whole.mjs` (Dave: a name save keeps the inline key, email, language list, empty string).
2. Text with `}` saves exactly (no SPARQL); a failed write restores the original. Regression: `whole.mjs` (name
   and bio with braces; mangled PUT put back) and `edit.mjs` (braces and quotes now must be "Saved" exactly).
3. Offered only on the logged-in WebID or an editable profile naming `solid:oidcIssuer`. Regression: `whole.mjs`
   (contact card not offered).
4. A field the pod did not save is reset to the stored value and says so; the next Save sends only its own field.
   Regression: `whole.mjs` ("1 saved" after a failed name save).

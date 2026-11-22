# Review: settings

Reviewer's probes: copies in `suite-data/settings-review/` — `real/` (the test user's real `card.jsonld` and
`prefs.jsonld`, addresses rewritten to the copy), `old/` (a JSON-LD profile written the way older servers and apps
did: an inline `cert:key`, an inline `vcard:hasEmail`, an `@list` of languages) and `contact/` (a vCard contact card).
The real profile was never written. Logged in on port 9575; screenshots `tests/shots/review-probe/shots/review-*`.
Line numbers are `settings-pane.js`.

| # | severity | where | what fails, concretely | suggested fix |
|---|---|---|---|---|
| 1 | bug | settings-pane.js:676-700 (`change`) | **Trusting an app damages a JSON-LD profile that holds inline (blank-node) objects or lists, and the pane says it worked.** On `old/card.jsonld`, "Trust it" for `review.example` said "https://review.example is now trusted", and the file on disk afterwards has **no `cert:key`, no `vcard:hasEmail`, no `schema:knowsLanguage`** (JSS finding 6: any PATCH to JSON-LD drops nested objects without `@id` and `@list`). The check after saving looks only for the new app. By the README, upstream SolidOS writes trusted apps as blank nodes, so a profile with apps added upstream would lose them the first time an app is added here. Profiles are JSON-LD on JSS. | Before any PATCH to a JSON-LD document, read it as JSON-LD and refuse (with a clear note) if it holds nested objects without `@id`, `@list`, or empty strings; after the PATCH compare the **whole** document's triples with what was expected, not just the target, and say so loudly if anything else went. |
| 2 | bug | settings-pane.js:359-364, 443-445 | The pane is offered on **any** person-typed card the viewer can edit, not only their own. On a contact card in my pod (`vcard:Individual`) the menu offers Settings; it draws "Settings · Dave Contact", "Only you see this page", "Your profile does not name an identity provider…", and a working "Trust a new app" form that would write `acl:trustedApp` into the contact's card. | Offer it only when the subject is the logged-in WebID, or a preferences file that WebID's profile names; drop the `editable` fallback (or require `solid:oidcIssuer` as well). |
| 3 | nit | settings-pane.js:639, 645 | With no preferences file at all, the private type index and tool index rows say "It is listed in the preferences file, which could not be read." (seen on the contact card), which is untrue. | Distinguish "no preferences file" from "not readable". |

## Two-person

Not asked for this pane. Not tested. (`own.mjs` checks bob's profile does not get the pane.)

## Checked and fine

- Real profile copy: adding a trusted app and flipping Power user changed exactly the 3 app triples and 1 type triple (whole-document triple compare of the JSON-LD on disk against the original); nothing lost. The real profile and real preferences file were not touched.
- Writes: only the `store.updater.update` calls in the README's table; HEADs for the overview; no document created, replaced or deleted.
- Safety: no `innerHTML`/`eval`; overview links only for http(s) with `rel="noopener"`; the tools link `rel="noopener"`, `target="_blank"`; origins checked (`https` only, no path, no credentials).
- Races: `busy` plus disabling every control during a save; Remove arms first; Control needs a second confirm.
- A patch the server accepts but does not apply (blank-node app) is reported as "Not changed" and the local store put back.
- 400 px: true 400 px alone on Alice: no sideways scroll; long addresses wrap; buttons and inputs at least 44 px.
- Design: sheet tokens/recipes current; cards, chips, pill inputs, switches; navigation column in the shell.

## Fixed

1. Every write is a whole-document GET → change in memory → PUT with `If-Match` (same content type) → GET and
   compare every statement; on a difference the original is PUT back and the pane says so. No PATCH at all.
   Regression: `tests/whole.mjs` (Dave: inline key, inline email, `@list`s, empty string; trust / level / remove /
   switch change only the named statements; a mangled PUT is put back exactly).
2. On a WebID the pane needs the logged-in WebID, or an editable profile naming `solid:oidcIssuer`. Regression:
   `whole.mjs` (a contact card the viewer may edit is not offered).
3. With no preferences file the two rows say "there is no preferences file". Regression: `whole.mjs`.

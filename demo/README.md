# Demo data on the test pod

Copies of the app samples live in `/me/private/suite-demo/` (owner-only, inherited from `/me/private/`):
`photos/` (media gallery), `contacts/`, `tasks/<list>/`, `boards/`, `notes/` (no hostile samples), `pads/`, `poll/`, `meeting/`.

`privateTypeIndex.jsonld` here is what `/me/settings/privateTypeIndex.jsonld` now holds: one registration per
launcher app. `privateTypeIndex.original.jsonld` is the empty index it replaced; copy it back to undo.

Check: `node shots/launcher.mjs` opens every launcher app and fails if one shows "No … yet".

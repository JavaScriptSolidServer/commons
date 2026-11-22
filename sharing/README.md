# Sharing (suite pane)

Who can see and change a file or folder on a Solid pod, in plain words, and (for someone with Control) a careful
way to change it. It is a replacement for the SolidOS sharing pane, written from scratch against Web Access Control
(WAC). One file, `sharing-pane.js`, no imports. Pane name `sharing-lab`, label "Sharing"; it never takes focus, so open
it from the "More options" menu (⋮) of a file or folder, or from the suite shell's "Other views" (⋯).

## Layout (suite phase 2)

Restyled with the suite's design sheet (`design/`: tokens and recipes embedded with `design/embed.mjs`, prefix
`shr`) and laid out like the Sharing tab of a files app's details sidebar:

1. An "Add a person by WebID" box at the top (pill input with an icon, the level, Add), only where you can edit.
2. A note saying whether the rules are the item's own or inherited (and from which folder).
3. People as list rows: avatar (photo from the profile, else initials), name and WebID, a permission dropdown
   (or a chip when read-only), and a ⋯ menu with "Open profile" and "Remove access".
4. "Everyone else": anyone logged in and everyone (the closest thing a pod has to a public link), with icon avatars.
5. Read-only rules, the pending-changes bar, the review, and the rules file with "Go back to inherited rules".

It fits a ~360 px sidebar as well as a full page: the root is a CSS container and the rows switch layout by
**its own width** (a container query at 520 px: the dropdown moves under the name), not the viewport's. A host may
`import()` the module and call `render(subject, context)` into any element: `context.dom` and
`context.session.store` are used when given, else `document` and `SolidLogic.store`. With `context.suite` (contract
v1) a save also shows `context.suite.toast()` and links open with `context.suite.go()`; without it the status line
in place says it all. The default export keeps its shape: `{ name, icon, label, shouldGetFocus, render }`. No
navigation or details of its own (a sharing tab has neither), so in the shell it is content only.

## For hosts

A host (the Files app's details sidebar) mounts the pane with `import('../sharing/sharing-pane.js')` and
`pane.render(node, context)`, into any width (see Layout).

- **It tells you when it wrote.** After every confirmed write (give it its own rules, save changes, remove access,
  go back to inherited rules), once the server accepted it and the pane's re-read agrees, the pane's root
  dispatches `new CustomEvent('suite-sharing-change', { bubbles: true, composed: true, detail: { uri, acl } })`:
  `uri` is the resource's address, `acl` its rules file's address, or `null` when the rules file was deleted. One
  event per write; none on cancel, on a refused or failed write (412, 4xx/5xx), or when the server's copy differs
  from what was sent. Saving away your own control still sends it (the write happened; the pane just cannot read
  the rules any more). Listen on any ancestor: `el.addEventListener('suite-sharing-change', e => …)`.
- **Details slot.** With `context.embedded === true` or `context.suite.slot === 'details'` the pane drops its own
  "Sharing" heading and its outer padding (the host's tab and details head already say both).

Icons: Material Design Icons (pictogrammers.com, Apache 2.0) as inline SVG `data:` URIs: share, account-plus,
earth, account-multiple, puzzle, dots-horizontal, delete, open-in-new, information-outline, alert-circle-outline,
check, folder, lock.

## What it shows

- Each person, "Anyone logged in" and "Everyone", with what they can do: **can view**, **can view and add**,
  **can edit**, **owner** (edit and change who has access). Odd mixes are spelt out ("can add (but not view)").
- Whether the rules are the item's **own** or **inherited**, and from which folder (linked).
- For a folder, whether a rule applies to the folder, to what is inside, or both.
- Names from people's profiles, filled in as they load, with the WebID underneath.
- Rules it cannot edit (groups, `acl:origin`, conditions, anything unusual) under "Also in the rules", read-only.
- If you cannot read the rules (not logged in, or no Control): "You cannot see who has access to this." and nothing else.

## What it reads

1. A HEAD of the item, for `Link: <…>; rel="acl"` (else `<item>.acl`).
2. A GET of that ACL document with your logged-in fetch, parsed with `$rdf.parse` into a throwaway graph
   (JSON-LD or Turtle; the shared store is not used for ACLs).
3. If that is 404, the same for each folder above, up to the first that has an ACL; its `acl:default` rules apply.
4. Profiles of the people listed, for their names (`foaf:name` or `vcard:fn`), through the shared store.

## What it writes, and when

Nothing is written until you have seen a summary of the change and clicked to confirm.

| Action | Request |
|---|---|
| Give this item its own rules | `PUT <item ACL>` with `If-None-Match: *`: a copy of the inherited rules that apply, pointed at this item (`acl:accessTo`, and `acl:default` for a folder). Nothing changes in effect. |
| Save these changes | `PUT <item ACL>` of the whole document, with `If-Match: <ETag>`. Rules it cannot edit are kept triple for triple. |
| Go back to inherited rules | `DELETE <item ACL>` with `If-Match: <ETag>`. |

Each PUT is sent as Turtle first; on 415 (the JavaScript Solid Server) it is sent again as JSON-LD. After every
write the pane reads the ACL again and shows what the server now has; if that is not what was sent, it says so.

Guards:

- It refuses to save rules (or make a copy, or go back to rules) that leave no person (`acl:agent`) with Control.
- If the change takes away your own Control, the save button says so and needs a second click.
- A 412 (someone changed the rules meanwhile) saves nothing and reloads what the server has.
- A WebID must be an `https://` address (`http://` only for localhost / 127.0.0.1, for testing).

## The data

```turtle
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#bob> a acl:Authorization ;
    acl:agent <https://bob.example/profile/card#me> ;
    acl:accessTo <https://pod.example/team/> ;       # the folder itself
    acl:default <https://pod.example/team/> ;        # and everything inside without its own rules
    acl:mode acl:Read, acl:Write .
<#public> a acl:Authorization ; acl:agentClass foaf:Agent ; acl:accessTo <https://pod.example/team/> ; acl:mode acl:Read .
```

Levels it writes: view = `Read`; view and add = `Read, Append`; edit = `Read, Write`; owner = `Read, Write, Control`.
"Everyone" is `acl:agentClass foaf:Agent`; "Anyone logged in" is `acl:agentClass acl:AuthenticatedAgent`.
It writes one authorization per person and scope, with absolute addresses.

`samples/team.acl.jsonld` is a folder ACL with Alice (owner), Bob (edit), Carol (this folder only), anyone logged in
(view and add), a group and an app-limited rule. `samples/plan.ttl` is a file inside it.

## Try it locally

The tests put the sample on the test pod (`node tests/sample.mjs` leaves it there). Log in as the test user, then:

- Folder with its own rules: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsharing%2Fsharing-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsharing%2Fteam%2F
- File that inherits: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fsharing%2Fsharing-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsharing%2Fnote.ttl
- In the suite shell: http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fsharing%2Fteam%2F (then ⋯ Other views → Sharing)

Alone: ⋮ (More options) → Sharing.

## Tests

`node tests/run.mjs` checks the embedded design block (`design/embed.mjs --check`), then runs `sharing.mjs`
(logged in: every action, checked on the pod files and with logged-out fetches), `sample.mjs` (the sample at 1300
and a true 400 px), `narrow.mjs` (mounted by `import()` in a 360 px box with a plain context, with a stand-in
`context.suite`, and with `{}`), `shell.mjs` (inside the suite shell at 1300 and a true 400 px, toast on save),
`two-person.mjs` (me shares a folder with bob, bob's own requests and bob's view of the pane) and `logged-out.mjs`.
Browsers on ports 9527 (me) and 9528 (bob), freed on any exit (`tests/free-ports.mjs`); the pane is opened
through `tests/open-sharing.mjs`, which waits for the session to settle first. All changes stay in `suite-data/sharing/`, which `tests/setup.mjs`
rebuilds from scratch.

## Not done

- Editing groups and origins (shown read-only, kept as they are).
- Applying rules to subfolders beyond what `acl:default` already does.
- Turtle-first PUT and the 415 fallback are exercised on JSS only (always JSON-LD there).

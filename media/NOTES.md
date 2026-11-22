# Notes: judgement calls, gaps, next

## Judgement calls

1. **Public or private: WAC-Allow first, then fall back.** If the folder's (or file's) `WAC-Allow` header says
   `public` has no read, files go straight to `store.fetcher._fetch` and a `blob:` URL. If the header is missing or
   says public can read, the element loads the address directly; on an `error` event it retries once with the
   logged-in fetch. That keeps public galleries cheap (lazy `<img>` with no JS fetch) and handles one private file in a
   public folder (tested in `partly/`). Cost: a private file in a "public" folder makes one failed request first.
2. **Focus rule: strictly more than half of the visible children are media.** Children are counted after dropping
   hidden files and `.acl`/`.meta` (JSS lists `.acl` in `ldp:contains`, which made a private folder say "1 other item").
   Sub-folders count as "not media". `gallery/` (5 of 6) opens in the pane; `mixed/` (1 of 5) keeps the folder view.
3. **Label names by content:** "Photos", "Playlist" or "Media" for folders; "Image", "Audio", "Video" for files. A
   `.webm` counts as video (a `<video>` plays audio-only WebM too).
4. **Large view upscales** small pictures to fill the screen (`object-fit: contain`). Real photos are larger than the
   screen; tiny ones look soft. Chosen over a small picture in a big dark box.
5. **The large view wraps** from last to first and back, like a slideshow.
6. **The first playlist track is loaded but not started.** Autoplay without a click is blocked by browsers anyway.
   After a click, the next track starts on `ended`, which the browser allows because the page has had a gesture.
7. **Blob URLs are cached per file and revoked when the pane leaves the page** (a MutationObserver sees the root
   disconnected). Not revoked on every track switch, so replaying a track does not fetch again.
8. **The large view is a fixed overlay inside the pane root**, so it goes away with the pane. Keys are caught on the
   document only while it is open; Tab is kept inside it.
9. **Upstream's `pbo:PlaylistSlot` documents are not handled.** The task asked for folders; I did not port it.

## Unverified

- Real sound output: headless Chromium plays (time advances, `ended` fires) but nobody listened.
- Big files and big folders (hundreds of photos): lazy loading is on, but not measured.
- MP4/H.264 and MP3: not tested (no way to make them without a codec or a download). WAV, PNG, SVG and VP8 WebM are.
- A second person: there is one test user, so "shared with Bob" access was not tested. The 403 message path is
  untested for that reason; the 401 path is tested logged out.
- Whether the store's media-type classes or `Content-Type` headers ever mark an extension-less file as media in
  practice: the code checks them, but JSS listings carry no types, so the tests only exercise file names.
- The live SolidOS bundle on solidos.org: tested only on the lab's `solidos/index.html`.

## Next, if wanted

- Ask the server for thumbnails if one ever offers them; until then, maybe decode to a small canvas once loaded.
- Stream private video with a service worker or ranged fetches instead of a whole-file blob.
- Swipe left/right in the large view on phones.

## Phase 2 (suite restyle): judgement calls

1. **The viewer stays a modal; its details go through the contract.** Nextcloud's viewer has a details sidebar on the
   right. In the shell the viewer's (i) calls `context.suite.showDetails(photo)`, and the viewer makes room for the
   shell's column: over 1100 px it ends at `right: var(--sui-details-width)`; at 1100 px and under (where the shell
   floats the column at z-index 30) the viewer drops to z-index 25 so the column and scrim lie over it. Alone, the
   viewer draws the same details element in its own side panel. A tile click still opens the viewer (behaviour kept);
   it does not select a tile or open details by itself.
2. **The viewer sits below the browser's top bar** (`top: var(--app-header-height, 0px)`, z-index 50, as the sheet
   says for modals). Before, it covered the whole window at z-index 2147483000; at z 50 the top bar would have hidden
   its own bar and close button.
3. **Viewer colours from tokens only:** stage `--sui-text` (the darkest token), text `--sui-primary-text`, count
   `--sui-bg-dark`, round icon buttons `--sui-text-muted` (hover `--sui-border-strong`). The sheet has no dark
   surface; this is built from existing tokens.
4. **Navigation = filters on this folder plus its sub-folders.** "All media / Photos / Sound and video" map
   Nextcloud's "All media / Photos / Videos"; "Folders" lists the sub-folders from the listing (opened with
   `suite.go(uri, { pane: 'media' })`). No albums, favourites or timeline: the pane knows none. A sub-folder with no
   media then shows the shell's "Photos has nothing to show here" box with "Show it as usual".
5. **Filters hide sections** (`hidden`) rather than redrawing, so the player and thumbnails keep their state; hiding
   the playlist pauses it. Alone there is no navigation and no chips (a folder alone shows everything, as before).
6. **Details use only what is already known:** size and date from the folder listing (`stat:size`,
   `dcterms:modified`) or headers, dimensions from a loaded `<img>` (the details figure loads the picture through the
   same loader, so a private one reuses its blob). The type is from the extension, plus `Content-Type` when the store
   has that header (usually not, as `<img>` loads do not go through the fetcher).
7. **Square thumbnails keep their names under them** (Nextcloud shows none); the tests and people both use them.
8. The playlist's track numbers were dropped for the row recipe's icon (music or video) and a size on the right.
9. **True 400 px** in every 400 test via `design/viewport.mjs` (CDP `Emulation.setDeviceMetricsOverride`). In
   `shell.mjs` the narrowing is done before loading the shell, so it draws for a phone (navigation as a closed drawer).

## Phase 2: unverified

- A sub-folder whose listing JSS has not loaded yet: the shell loads it on `go`; tested only with `music/live/`.
- Escape now follows the shell's rule (it acts last and skips handled events): the viewer handles every Escape
  itself and closes the topmost thing. See REVIEW.md "Fixed".
- Opening the viewer while the shell's details column already shows the folder (from (i)): over 1100 px the viewer
  covers it until the viewer's own (i) is pressed. Harmless, not tested.
- Real dates in other locales: shown with `toLocaleString(dateStyle medium, timeStyle short)`.

## Needs a decision

- The sheet has no dark surface or "on dark" button for a media viewer; I used `--sui-text` / `--sui-text-muted`.
  A `--sui-bg-dark-stage`-style token (or a `viewer` recipe) would make this shared if other panes need one.
- (Settled: the shell now skips handled Escapes.)

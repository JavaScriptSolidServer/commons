# media

A dynamic SolidOS pane for pictures, sound and video kept in a pod. One file, no imports; it uses the browser's own
`<img>`, `<audio controls>` and `<video controls>`. It stands in for five upstream panes: slideshow, image, video,
audio and playlist.

**Try it:** [the sample photo gallery](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fmedia-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fsamples%2Fgallery%2F)
· [the sample playlist](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fmedia-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fsamples%2Fmusic%2F)
· [one picture](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fmedia-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fmedia%2Fsamples%2Fgallery%2Fcarol-sun.svg)

**In the suite shell (the Photos app):** [the gallery](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fmedia%2Fgallery%2F)
· [photos and sound](http://127.0.0.1:8732/me/public/solidos/index.html?pane=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite%2Fshell%2Fsuite-shell-pane.js&uri=http%3A%2F%2F127.0.0.1%3A8732%2Fme%2Fpublic%2Fsuite-data%2Fmedia%2Fprivate%2F) (log in first)

(Local test pod only. The browser asks before it adds a pane from a site it has not seen; on this pod it does not.)

## In the suite (phase 2)

Restyled with the suite's design sheet (`design/`: `--sui-*` tokens, the `icon nav row buttons toast details`
recipes, prefix `med-`, embedded by `design/embed.mjs`), laid out the way the Nextcloud Photos app is:

- **Left column (`renderNavigation`, shell only):** "All media", "Photos" and "Sound and video" with counts, which
  filter the folder on show; then "Folders": the folder's sub-folders; one with media opens in Photos, one without in whatever the shell picks (Files).
- **Middle:** a grid of square thumbnails (names under them), the playlist as list rows (icon, name, kind, size).
- **The viewer:** one photo large on a dark stage, with previous/next, and a Details (i) button. Its details (name,
  type, dimensions, size, date modified, folder, address) open in the shell's right column (`renderDetails`), the
  viewer stepping aside to make room (over 1100 px) or the column lying over it (narrower). Alone, the viewer draws
  the same details in its own side panel. Escape closes the details first, then the viewer.
- **The shell's (i) button** shows the folder: photos, sound and video, other items, who can see it (from
  `WAC-Allow`), date, address; on one file, that file's details.
- Size and date come from the folder listing (`stat:size`, `dcterms:modified`, which JSS gives for each child)
  or the file's own headers; dimensions from the picture once it has loaded. Nothing extra is fetched for them.
- Opened alone (no `context.suite`), the content is as before, with no navigation.

## What it does

- **A folder with pictures:** a grid of photos, loaded as they scroll into view. Click one to see it large, with its
  name and "2 / 5". Previous and next buttons, the left and right arrow keys, and Escape to close. It wraps from the
  last to the first. Focus goes into the large view and back to the photo on close.
- **A folder with sound or video:** a playlist. The first track is ready; click a track to play it; when it ends the
  next one plays. A video track plays in a video player.
- A folder with both shows the playlist, then the photos. The heading counts photos, tracks and other items not shown.
- **One picture, sound or video file:** shown or played on its own, with its name (and a picture's size in pixels).
- **When it opens first:** for a media file, always. For a folder, only when more than half of what it holds is
  media. A folder with some media but mostly other things gets a "Photos"/"Playlist"/"Media" tab and the normal
  folder view stays in front. A folder with no media is left alone.
- **A private sound or video** is not downloaded when the folder opens: the player shows a "Play" button first.
- **A folder with no media**, if drawn by the pane, shows an empty state.
- **Private files:** when the folder's `WAC-Allow` header says the public cannot read it, or a direct load fails, the
  file is fetched with the logged-in session (`store.fetcher._fetch`) and shown from a `blob:` URL. Those URLs are
  revoked when the pane leaves the page. Public files load from their own address. A file that cannot be read
  says "Log in to see this file." (401) or "You do not have permission to see this file." (403).
- Smaller tiles on a phone; no sideways scrolling at a true 400 px.

## What it reads

The folder listing (`ldp:contains`), which the data browser has already loaded, and the media files themselves.

A file counts as media by its type, when the store knows it (an `http://www.w3.org/ns/iana/media-types/image/png#Resource`
class or a `Content-Type` header), else by its name:

| Kind | Extensions |
|---|---|
| Image | png jpg jpeg gif webp svg avif bmp ico |
| Audio | mp3 wav ogg oga m4a aac flac opus weba |
| Video | mp4 webm ogv mov m4v |

Hidden files and access rules (`.acl`, `photo.png.acl`, `.meta`) are not counted.

## What it writes

Nothing. It is read-only.

## The data

No special format: an ordinary folder.

```turtle
<gallery/> a ldp:Container ;
    ldp:contains <gallery/alice-lake.png>, <gallery/carol-sun.svg>, <gallery/about.txt> .
```

shows two photos and "1 other item not shown". Files are sorted by name, numbers in order (`2` before `10`).

## Load it

```js
panes.register((await import('http://127.0.0.1:8732/me/public/suite/media/media-pane.js')).default)
```

## Samples and tests

`samples/` is made by `tests/make-samples.mjs`, nothing downloaded: PNGs drawn pixel by pixel, an SVG, WAV tones written
byte by byte, and a 1.5 s WebM recorded from a canvas in headless Chromium. Folders: `gallery/` (5 pictures and a text
file), `music/` (3 tones and the clip), `mixed/` (1 picture among 4 documents), `docs/` (no media), `private/`.

`node tests/run.mjs` checks the design block is current (`design/embed.mjs --check`), makes the samples if missing,
copies them to the test pod at `suite-data/media/` (with an owner-only rule on `private/` and on one picture in
`partly/`, and a sub-folder `music/live/`), then runs, in a real headless Chromium (ports 9513 and 9514):

- `media.mjs` logged in at 1300 px: grid, large view and keys, the viewer's details panel, playlist and auto-advance,
  video, mixed and document folders, single files, private folder via blob URLs, blob URLs revoked on leaving,
  reload, pod unchanged.
- `media.mjs 400`: the same views at a true 400 px (`design/viewport.mjs`, CDP device metrics).
- `shell.mjs`: inside the suite shell as the Photos app: the filters and sub-folders in the left column, a photo's
  details in the shell's column beside the viewer, Escape order, the folder's details from (i), 1300 px and a true
  400 px, pod unchanged.
- `logged-out.mjs` at 1300 and a true 400 px: the samples from the suite folder, a private folder and file, a
  private picture in a public folder, pod unchanged.

Screenshots go to `tests/shots/`.

## Credits

Icons: [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), as inline `data:` URIs.

## Not done

- No server thumbnails: each tile loads the whole picture (lazily). A folder of large photos costs their full size.
- A private sound or video is downloaded whole before it plays (a `blob:` URL cannot stream). Fine for clips, slow for films.
- Blob URLs are given back when the pane leaves the page, not when you move between tracks.
- Upstream's playlist pane read `pbo:PlaylistSlot` documents; this one does folders only.
- Upstream's audio pane guessed artist/album/track from the path; this one shows file names.
- No sub-folders inside the gallery, no captions or EXIF, no slideshow timer.

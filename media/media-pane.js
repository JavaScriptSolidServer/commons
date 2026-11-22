// media-pane.js: pictures, sound and video in a pod, shown with the browser's own <img>, <audio> and <video>.
// Read-only: it never writes anything.
//
// One file, no imports. It opens on:
// - a folder (URI ends in "/", children by ldp:contains) holding at least one image, audio or video file:
//   a square photo grid (click a photo to see it large, with previous and next, arrow keys and Escape, and its
//   details beside it) and a playlist of the sound and video files (click to play; the next one plays when one ends).
//   It opens first only when most of the folder is media; otherwise it waits as a tab beside the folder view.
// - one image, audio or video file: shown or played.
//
// Inside the suite shell (context.suite, design/DESIGN.md) it also gives the shell's two side columns:
//   renderNavigation  "All media", "Photos", "Sound and video" (filters on this folder) and its sub-folders
//   renderDetails     one file (name, type, dimensions, size, date, folder, address) or the folder itself
// Alone in the data browser the content stands by itself and the viewer draws the details in its own side panel.
//
// A file is media when its name ends in a known extension, or when the store knows its type
// (an http://www.w3.org/ns/iana/media-types/<type>/<subtype>#Resource class, or its Content-Type header).
//
// Private files: when the folder's WAC-Allow header says the public cannot read it, or a direct load fails,
// the file is fetched with the logged-in session (store.fetcher._fetch) and shown from a blob: URL,
// which is revoked when the pane leaves the page. Public files load straight from their address.
//
// Icons: Material Design Icons (Apache 2.0), as inline data: URIs.

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains'
const MEDIA_TYPES = 'http://www.w3.org/ns/iana/media-types/'
const STAT_SIZE = 'http://www.w3.org/ns/posix/stat#size'
const MODIFIED = 'http://purl.org/dc/terms/modified'
const MTIME = 'http://www.w3.org/ns/posix/stat#mtime'
const EXTENSIONS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v']
}

// Material Design Icons (pictogrammers.com, Apache 2.0): paths in a 24 x 24 box.
const MDI = {
  images: 'M22,16V4A2,2 0 0,0 20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16M11,12L13.03,14.71L16,11L20,16H8M2,6V20A2,2 0 0,0 4,22H18V20H4V6',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  music: 'M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z',
  video: 'M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  left: 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z',
  right: 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z'
}
const svg = (d, fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path${fill ? ` fill="${fill}"` : ''} d="${d}"/></svg>`)

const CSS = `
/* suite:design begin --prefix med --only icon,nav,row,buttons,toast,details,empty */
:where(:root) {
  --sui-primary: #0082c9;
  --sui-primary-element: #00679e;
  --sui-primary-element-hover: #00557f;
  --sui-primary-text: #ffffff;
  --sui-primary-light: #e3eff6;
  --sui-primary-light-hover: #d2e5f0;
  --sui-primary-light-text: #00507b;
  --sui-bg: #ffffff;
  --sui-bg-app: #f5f7f9;
  --sui-bg-hover: #eef1f4;
  --sui-bg-dark: #e3e7eb;
  --sui-text: #1f2328;
  --sui-text-muted: #5c6670;
  --sui-border: #e1e5ea;
  --sui-border-strong: #8a949e;
  --sui-error: #c62828;
  --sui-error-light: #fdecea;
  --sui-warning: #8a5a00;
  --sui-warning-light: #fff3d6;
  --sui-success: #237a38;
  --sui-success-light: #e6f4e9;
  --sui-late: #c62828;
  --sui-surface-dark: #16191d;
  --sui-surface-dark-text: #f1f3f5;
  --sui-surface-dark-muted: #a7b0b9;
  --sui-focus: #0082c9;
  --sui-backdrop: rgba(18, 24, 31, .45);
  --sui-font: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
  --sui-font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
  --sui-text-sm: 13px;
  --sui-text-md: 15px;
  --sui-text-lg: 17px;
  --sui-text-xl: 20px;
  --sui-text-2xl: 24px;
  --sui-line: 1.5;
  --sui-weight: 400;
  --sui-weight-bold: 600;
  --sui-space-1: 4px;
  --sui-space-2: 8px;
  --sui-space-3: 12px;
  --sui-space-4: 16px;
  --sui-space-5: 20px;
  --sui-space-6: 24px;
  --sui-space-8: 32px;
  --sui-space-12: 48px;
  --sui-target: 44px;
  --sui-target-sm: 34px;
  --sui-icon: 20px;
  --sui-avatar: 32px;
  --sui-avatar-lg: 64px;
  --sui-avatar-xl: 96px;
  --sui-header: 50px;
  --sui-nav-width: 290px;
  --sui-details-width: 380px;
  --sui-content-max: 1080px;
  --sui-reading-width: 760px;
  --sui-column-width: 290px;
  --sui-radius-sm: 4px;
  --sui-radius: 8px;
  --sui-radius-lg: 12px;
  --sui-radius-pill: 999px;
  --sui-shadow: 0 1px 3px rgba(16, 24, 40, .12);
  --sui-shadow-lg: 0 8px 28px rgba(16, 24, 40, .18);
  --sui-ease: .15s ease;
}
/* ---- base: put this on a pane's root ---------------------------------------------------------------- */
.med-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.med-root *, .med-root *::before, .med-root *::after { box-sizing: border-box }
.med-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.med-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.med-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.med-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.med-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.med-root [hidden] { display: none !important }
.med-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.med-muted { color: var(--sui-text-muted) }
.med-small { font-size: var(--sui-text-sm) }
.med-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.med-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.med-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.med-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.med-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.med-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --med-i set to url("data:image/svg+xml,...") ---------------------------------- */
.med-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--med-i) center / contain no-repeat; mask: var(--med-i) center / contain no-repeat }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.med-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.med-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.med-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.med-nav-item:hover { background: var(--sui-bg-hover) }
.med-nav-item[aria-current="page"], .med-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.med-nav-item .med-icon { color: var(--sui-text-muted) }
.med-nav-item[aria-current] .med-icon { color: inherit }
.med-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.med-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.med-nav-new { margin-bottom: var(--sui-space-2) }
.med-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.med-list { margin: 0; padding: 0; list-style: none }
.med-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.med-row:hover { background: var(--sui-bg-hover) }
.med-row[aria-selected="true"], .med-row[aria-current="true"] { background: var(--sui-primary-light) }
.med-row-main { flex: 1 1 auto; min-width: 0 }
.med-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.med-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.med-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.med-row-actions { flex: none; display: flex; align-items: center }
.med-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.med-row-icon .med-icon { width: 28px; height: 28px }
.med-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .med-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.med-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.med-btn:hover { background: var(--sui-primary-light-hover) }
.med-btn:disabled, .med-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.med-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.med-btn-primary:hover { background: var(--sui-primary-element-hover) }
.med-btn-tertiary { background: transparent; color: var(--sui-text) }
.med-btn-tertiary:hover { background: var(--sui-bg-hover) }
.med-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.med-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.med-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.med-btn-icon:hover { background: var(--sui-bg-hover) }
.med-btn-wide { width: 100%; justify-content: flex-start }
.med-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.med-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.med-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.med-empty-icon .med-icon { width: 48px; height: 48px }
.med-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.med-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.med-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.med-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.med-toast-error { border-left-color: var(--sui-error) }
.med-toast-success { border-left-color: var(--sui-success) }
.med-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.med-status-error { color: var(--sui-error) }
.med-status-success { color: var(--sui-success) }
.med-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.med-note-error { background: var(--sui-error-light) }
.med-note-warning { background: var(--sui-warning-light) }
.med-note-success { background: var(--sui-success-light) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.med-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.med-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.med-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.med-details-figure .med-icon { width: 36px; height: 36px }
.med-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.med-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.med-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.med-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.med-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.med-tab:hover { color: var(--sui-text) }
.med-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.med-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.med-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.med-props dt { color: var(--sui-text-muted) }
.med-props dd { margin: 0; overflow-wrap: anywhere }
/* suite:design end */
.med.media-pane { max-width: var(--sui-content-max); margin: 0 auto; padding: var(--sui-space-4) var(--sui-space-4) var(--sui-space-8) }
.med-head { display: flex; flex-direction: column; gap: var(--sui-space-1); margin: 0 0 var(--sui-space-4) }
.med-title { overflow-wrap: anywhere }
.med-meta { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.med-section + .med-section { margin-top: var(--sui-space-6) }
.med-section > .med-subheading { margin: 0 0 var(--sui-space-3) }
.med-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--sui-space-2); margin: 0; padding: 0; list-style: none }
.med-grid > li { min-width: 0 }
.med-tile { display: flex; flex-direction: column; gap: var(--sui-space-1); width: 100%; padding: 0; border: 0; border-radius: var(--sui-radius); background: transparent; color: inherit; text-align: left; cursor: zoom-in }
.med-thumb { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; border-radius: var(--sui-radius); background: var(--sui-bg-app); overflow: hidden; color: var(--sui-text-muted); font-size: var(--sui-text-sm); line-height: 1.35; text-align: center }
.med-thumb:not(:has(img)) { padding: var(--sui-space-3) }
.med-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform var(--sui-ease) }
.med-tile:hover .med-thumb img { transform: scale(1.03) }
.med-name { display: block; padding: 0 var(--sui-space-1); color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.med-section .med-note, .med-single .med-note { margin-top: var(--sui-space-3) }
.med-player { display: flex; flex-direction: column; gap: var(--sui-space-3); padding: var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.med-now { margin: 0; font-weight: var(--sui-weight-bold); overflow-wrap: anywhere }
.med-player audio { display: block; width: 100% }
.med-player video { display: block; width: 100%; max-height: min(52vh, 420px); border-radius: var(--sui-radius); background: var(--sui-text) }
.med-tracks { margin-top: var(--sui-space-2) }
.med-track { width: 100%; border: 0; background: transparent; font: inherit; text-align: left }
.med-track[aria-current="true"] .med-row-title { color: var(--sui-primary-light-text) }
.med-single { margin: 0 }
.med-single img { display: block; max-width: 100%; max-height: 75vh; margin: 0 auto; border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.med-single audio { display: block; width: 100% }
.med-single video { display: block; width: 100%; max-height: 70vh; border-radius: var(--sui-radius-lg); background: var(--sui-text) }
.med-cap { margin: var(--sui-space-2) 0 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm); text-align: center; overflow-wrap: anywhere }
.med-details-figure { overflow: hidden }
.med-details-figure img { display: block; width: 100%; height: 100%; object-fit: cover }
.med-props a { overflow-wrap: anywhere }
/* the viewer: one photo large, over everything (a modal), its details in a side panel or the shell's column */
.med-box { position: fixed; inset: 0; top: var(--app-header-height, 0px); z-index: 50; display: flex; flex-direction: column; background: var(--sui-text); color: var(--sui-primary-text) }
.med-box[hidden] { display: none }
.med-bar { flex: none; display: flex; align-items: center; gap: var(--sui-space-1); padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-4) }
.med-bname { flex: 1 1 auto; min-width: 0; font-weight: var(--sui-weight-bold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.med-count { flex: none; margin-right: var(--sui-space-2); color: var(--sui-bg-dark); font-size: var(--sui-text-sm); font-variant-numeric: tabular-nums }
.med-box .med-btn-icon { flex: none; color: var(--sui-primary-text) }
.med-box .med-btn-icon:hover, .med-box .med-btn-icon[aria-pressed="true"] { background: var(--sui-text-muted) }
.med-main { position: relative; flex: 1 1 auto; min-height: 0; display: flex }
.med-stage { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; gap: var(--sui-space-2); padding: 0 var(--sui-space-2) var(--sui-space-4) }
.med-stage .med-btn-icon { background: var(--sui-text-muted) }
.med-stage .med-btn-icon:hover { background: var(--sui-border-strong) }
.med-frame { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center }
.med-frame img { display: block; width: 100%; height: 100%; min-width: 0; object-fit: contain }
.med-side { flex: none; width: var(--sui-details-width); max-width: 100%; overflow-y: auto; background: var(--sui-bg); color: var(--sui-text) }
@media (min-width: 1101px) { .med-box.med-beside { right: var(--sui-details-width) } }
@media (max-width: 1100px) { .med-box.med-beside { z-index: 25 } }
@media (max-width: 600px) { .med-side { position: absolute; inset: 0; width: auto } }
@media (max-width: 520px) {
  .med.media-pane { padding: var(--sui-space-3) var(--sui-space-3) var(--sui-space-6) }
  .med-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--sui-space-1) }
  .med-stage { gap: var(--sui-space-1); padding: 0 var(--sui-space-1) var(--sui-space-3) }
}
`

const el = (dom, tag, cls, text, attrs) => {
  const e = dom.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined && text !== null) e.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}
function icon (dom, path) {
  const span = el(dom, 'span', 'med-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--med-i', `url("${svg(path)}")`)
  return span
}
function iconButton (dom, cls, label, path) {
  const b = el(dom, 'button', 'med-btn med-btn-icon ' + cls, null, { type: 'button', 'aria-label': label, title: label })
  b.appendChild(icon(dom, path))
  return b
}

const fileName = (uri) => {
  const last = uri.replace(/\/$/, '').split('/').pop().split('#')[0].split('?')[0]
  try { return decodeURIComponent(last) } catch { return last }
}

const isFolder = (subject) => !!subject && typeof subject.uri === 'string' && subject.uri.endsWith('/')

// 'image', 'audio', 'video' or null; by the type the store knows, else by the file name.
function kindOf (store, node) {
  if (!node || !node.uri || node.uri.endsWith('/')) return null
  try {
    const types = store.findTypeURIs ? Object.keys(store.findTypeURIs(node)) : []
    for (const t of types) {
      if (!t.startsWith(MEDIA_TYPES)) continue
      const main = t.slice(MEDIA_TYPES.length).split('/')[0]
      if (main in EXTENSIONS) return main
    }
  } catch { /* fall back to the name */ }
  try {
    const headers = store.fetcher && store.fetcher.getHeader && store.fetcher.getHeader(node.doc ? node.doc() : node, 'content-type')
    for (const h of headers || []) {
      const main = String(h).split('/')[0].trim().toLowerCase()
      if (main in EXTENSIONS) return main
    }
  } catch { /* fall back to the name */ }
  const ext = (fileName(node.uri).match(/\.([a-z0-9]+)$/i) || [])[1]
  if (!ext) return null
  for (const kind in EXTENSIONS) if (EXTENSIONS[kind].includes(ext.toLowerCase())) return kind
  return null
}

// The folder's children, sorted by name, split into media and the rest (sub-folders are among the rest).
function folderContents (store, subject) {
  const children = store.each(subject, store.sym(LDP_CONTAINS), null, subject.doc ? subject.doc() : undefined)
  const seen = new Set()
  // Hidden files and access rules (.acl, x.png.acl, .meta) are not the folder's content.
  const hidden = (name) => name.startsWith('.') || /\.(acl|meta)$/i.test(name)
  const all = children.filter(c => c && c.uri && !hidden(fileName(c.uri)) && !seen.has(c.uri) && seen.add(c.uri))
  all.sort((a, b) => fileName(a.uri).localeCompare(fileName(b.uri), undefined, { numeric: true, sensitivity: 'base' }))
  const images = [], tracks = [], other = []
  for (const c of all) {
    const kind = kindOf(store, c)
    if (kind === 'image') images.push(c)
    else if (kind) tracks.push({ node: c, kind })
    else other.push(c)
  }
  return { all, images, tracks, other, folders: other.filter(c => c.uri.endsWith('/')) }
}

function countText ({ images, tracks, other }) {
  const parts = []
  if (images.length) parts.push(images.length + (images.length === 1 ? ' photo' : ' photos'))
  if (tracks.length) parts.push(tracks.length + (tracks.length === 1 ? ' track' : ' tracks'))
  if (other.length) parts.push(other.length + (other.length === 1 ? ' other item' : ' other items') + ' not shown')
  return parts.join(' · ')
}

// Does the public get to read this? From the WAC-Allow header of the folder or file, when known.
function publicCanRead (store, node) {
  try {
    const headers = store.fetcher.getHeader(node.doc ? node.doc() : node, 'wac-allow')
    if (!headers || !headers.length) return null
    const m = String(headers[0]).match(/public\s*=\s*"([^"]*)"/i)
    return m ? /\bread\b/.test(m[1]) : null
  } catch { return null }
}

// What the store already knows about a file: size and date from the folder listing (JSS gives stat:size and
// dcterms:modified for each child), else from the headers of a request the browser made for it.
function factsOf (store, node) {
  const value = (p) => { try { const v = store.any(node, store.sym(p)); return v ? v.value : '' } catch { return '' } }
  const header = (h) => { try { const v = store.fetcher.getHeader(node.doc ? node.doc() : node, h); return v && v.length ? String(v[0]) : '' } catch { return '' } }
  const size = value(STAT_SIZE) || header('content-length')
  let date = null
  const modified = value(MODIFIED) || header('last-modified')
  if (modified) date = new Date(modified)
  else if (value(MTIME)) date = new Date(Number(value(MTIME)) * 1000)
  if (date && isNaN(date.getTime())) date = null
  return { size: size !== '' && !isNaN(Number(size)) ? Number(size) : null, date, type: header('content-type').split(';')[0].trim() }
}
function sizeText (n) {
  if (n === null || n === undefined) return ''
  if (n < 1000) return n + (n === 1 ? ' byte' : ' bytes')
  const units = ['kB', 'MB', 'GB', 'TB']
  let v = n / 1000; let u = 0
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++ }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + units[u]
}
const dateText = (d) => { try { return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return d.toISOString() } }
const KIND_NAME = { image: 'Photo', audio: 'Sound', video: 'Video' }
function typeText (node, kind, type) {
  const ext = (fileName(node.uri).match(/\.([a-z0-9]+)$/i) || [])[1]
  const word = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'sound'
  return (ext ? ext.toUpperCase() + ' ' + word : word) + (type ? ' (' + type + ')' : '')
}
const httpOnly = (uri) => /^https?:\/\//i.test(uri || '')

function props (dom, rows) {
  const dl = el(dom, 'dl', 'med-props')
  for (const [k, v] of rows) {
    if (v === '' || v === null || v === undefined) continue
    dl.appendChild(el(dom, 'dt', null, k))
    const dd = dl.appendChild(el(dom, 'dd'))
    if (typeof v === 'string') dd.textContent = v
    else dd.appendChild(v)
  }
  return dl
}
function link (dom, uri, text) {
  if (!httpOnly(uri)) return text || uri
  const a = el(dom, 'a', null, text || uri, { href: uri, rel: 'noopener', target: '_blank' })
  return a
}
const parentOf = (uri) => uri.replace(/[^/]+\/?$/, '')

// The details of one file: what the pane already knows, plus the picture's size once it has loaded.
// shared: { load(img, uri), dims: Map } from render, when there is one.
function fileDetails (dom, store, node, shared = {}) {
  const kind = kindOf(store, node)
  const name = fileName(node.uri)
  const facts = factsOf(store, node)
  const box = el(dom, 'div', 'med-details-wrap', null, { 'data-uri': node.uri })
  const head = box.appendChild(el(dom, 'div', 'med-details-head'))
  const fig = head.appendChild(el(dom, 'span', 'med-details-figure'))
  fig.appendChild(icon(dom, kind === 'image' ? MDI.image : kind === 'video' ? MDI.video : MDI.music))
  const titles = head.appendChild(el(dom, 'div', 'med-details-titles'))
  titles.appendChild(el(dom, 'h2', 'med-details-title', name))
  titles.appendChild(el(dom, 'p', 'med-details-sub', KIND_NAME[kind] || 'File'))
  const body = box.appendChild(el(dom, 'div', 'med-details-body'))
  const dims = shared.dims && shared.dims.get(node.uri)
  const parent = parentOf(node.uri)
  const dl = body.appendChild(props(dom, [
    ['Type', typeText(node, kind, facts.type)],
    ['Dimensions', dims || ''],
    ['Size', sizeText(facts.size)],
    ['Modified', facts.date ? dateText(facts.date) : ''],
    ['Folder', parent ? link(dom, parent, fileName(parent) || parent) : ''],
    ['Address', link(dom, node.uri)]
  ]))
  if (kind === 'image' && shared.load) {
    const img = el(dom, 'img', null, null, { alt: '' })
    img.addEventListener('load', () => {
      fig.replaceChildren(img)
      const text = img.naturalWidth + ' × ' + img.naturalHeight + ' pixels'
      if (shared.dims) shared.dims.set(node.uri, text)
      if (!dims) { // add the row it could not have before
        const dt = el(dom, 'dt', null, 'Dimensions')
        const dd = el(dom, 'dd', null, text)
        const after = dl.children[2] || null
        dl.insertBefore(dd, after); dl.insertBefore(dt, dd)
      }
    })
    shared.load(img, node.uri)
  }
  return box
}

// The details of the folder: its counts and who can see it.
function folderDetails (dom, store, folder) {
  const c = folderContents(store, folder)
  const facts = factsOf(store, folder)
  const open = publicCanRead(store, folder)
  const box = el(dom, 'div', 'med-details-wrap', null, { 'data-uri': folder.uri })
  const head = box.appendChild(el(dom, 'div', 'med-details-head'))
  head.appendChild(el(dom, 'span', 'med-details-figure')).appendChild(icon(dom, MDI.images))
  const titles = head.appendChild(el(dom, 'div', 'med-details-titles'))
  titles.appendChild(el(dom, 'h2', 'med-details-title', fileName(folder.uri) || folder.uri))
  titles.appendChild(el(dom, 'p', 'med-details-sub', countText(c) || 'No media'))
  const body = box.appendChild(el(dom, 'div', 'med-details-body'))
  body.appendChild(props(dom, [
    ['Photos', String(c.images.length)],
    ['Sound and video', String(c.tracks.length)],
    ['Other items', c.other.length ? String(c.other.length) : ''],
    ['Who can see it', open === true ? 'Anyone with the address' : open === false ? 'Only people given access' : ''],
    ['Modified', facts.date ? dateText(facts.date) : ''],
    ['Address', link(dom, folder.uri)]
  ]))
  return box
}

const pane = {
  name: 'media',
  icon: svg(MDI.images, '#0082c9'),
  audience: [],

  label (subject, context) {
    const store = (context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store)
    if (!store || !subject || !subject.uri) return null
    if (isFolder(subject)) {
      const { images, tracks } = folderContents(store, subject)
      if (images.length && tracks.length) return 'Media'
      if (images.length) return 'Photos'
      if (tracks.length) return 'Playlist'
      return null
    }
    const kind = kindOf(store, subject)
    return kind === 'image' ? 'Image' : kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : null
  },

  // Opens first for a media file, and for a folder only when more than half of what it holds is media.
  shouldGetFocus (subject) {
    const store = globalThis.SolidLogic && globalThis.SolidLogic.store
    if (!store || !subject || !subject.uri) return false
    if (!isFolder(subject)) return !!kindOf(store, subject)
    const { all, images, tracks } = folderContents(store, subject)
    return all.length > 0 && (images.length + tracks.length) * 2 > all.length
  },

  // The shell's left column, for a folder: the media filters, then its sub-folders.
  renderNavigation (subject, context) {
    if (!isFolder(subject)) return null
    const dom = context.dom
    const store = context.session.store
    const suite = context.suite || null
    const state = suite ? suite.state : {}
    if (!state.filter) state.filter = 'all'
    const c = folderContents(store, subject)
    const list = el(dom, 'ul', 'med-nav-list med-shell-nav')
    const filters = [['all', 'All media', c.images.length + c.tracks.length, MDI.images]]
    if (c.images.length) filters.push(['photos', 'Photos', c.images.length, MDI.image])
    if (c.tracks.length) filters.push(['tracks', 'Sound and video', c.tracks.length, MDI.music])
    for (const [id, label, n, path] of filters) {
      const b = list.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'med-nav-item', null, { type: 'button', 'data-filter': id }))
      b.append(icon(dom, path), el(dom, 'span', 'med-nav-label', label), el(dom, 'span', 'med-nav-count', String(n)))
      if (state.filter === id) b.setAttribute('aria-current', 'page')
      b.addEventListener('click', () => {
        state.filter = id
        for (const x of list.querySelectorAll('[data-filter]')) { if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current') }
        if (state.applyFilter) state.applyFilter()
      })
    }
    if (c.folders.length) {
      list.appendChild(el(dom, 'li')).appendChild(el(dom, 'p', 'med-caption', 'Folders'))
      for (const f of c.folders) {
        const b = list.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'med-nav-item', null, { type: 'button', 'data-folder': f.uri, title: f.uri }))
        b.append(icon(dom, MDI.folder), el(dom, 'span', 'med-nav-label', fileName(f.uri)))
        // Stay in Photos when the sub-folder holds media; otherwise let the shell pick (Files), never a dead end.
        b.addEventListener('click', async () => {
          if (!suite) return
          let media = false
          try { await store.fetcher.load(f); const sub = folderContents(store, f); media = sub.images.length + sub.tracks.length > 0 } catch { /* unknown: let the shell pick */ }
          suite.go(f.uri, media ? { pane: 'media' } : {})
        })
      }
    }
    return list
  },

  // The shell's right column: one file (from the viewer, or the shell's (i) on a file), or the folder.
  renderDetails (node, context) {
    if (!node || !node.uri) return null
    const store = context.session.store
    const state = context.suite ? context.suite.state : {}
    if (isFolder(node)) return folderDetails(context.dom, store, node)
    return fileDetails(context.dom, store, node, state.media || {})
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const suite = context.suite && context.suite.version >= 1 ? context.suite : null
    const state = suite ? suite.state : {}
    if (!state.filter) state.filter = 'all'
    const win = dom.defaultView || globalThis
    const webFetch = (store.fetcher && store.fetcher._fetch) || win.fetch.bind(win)
    const root = el(dom, 'div', 'med media-pane med-root')
    root.appendChild(el(dom, 'style', '', CSS))

    // Sources: the file's own address when the public can read it, else a blob: URL from a logged-in fetch.
    const blobs = new Set()
    const sources = new Map() // uri -> Promise of a src
    let gone = false
    const fetchBlob = (uri) => {
      if (!sources.has(uri) || sources.get(uri).direct) {
        const p = webFetch(uri).then(async (response) => {
          if (!response.ok) {
            const why = response.status === 401 ? 'Log in to see this file.' : response.status === 403 ? 'You do not have permission to see this file.' : 'Could not load this file (' + response.status + ').'
            throw new Error(why)
          }
          const blob = await response.blob()
          if (gone) throw new Error('closed')
          const url = win.URL.createObjectURL(blob)
          blobs.add(url)
          return url
        })
        p.catch(() => {})
        sources.set(uri, p)
      }
      return sources.get(uri)
    }
    // Load uri into an <img>/<audio>/<video>: directly when it may be public, falling back to the logged-in fetch.
    const load = (media, uri, folderPublic, onFail) => {
      const tryBlob = () => fetchBlob(uri).then(src => { media.src = src }, error => { if (error.message !== 'closed' && onFail) onFail(error.message) })
      const known = sources.get(uri)
      let fellBack = false
      media.addEventListener('error', () => {
        if (gone) return
        if (fellBack) { if (onFail) onFail('Could not show this file.'); return } // loaded, but cannot be shown
        fellBack = true; tryBlob()
      })
      if ((known && !known.direct) || folderPublic === false) { fellBack = true; tryBlob(); return }
      if (!known) { const direct = Promise.resolve(uri); direct.direct = true; sources.set(uri, direct) }
      media.src = uri
    }
    // What the details (here, or in the shell's column) share with the content: the loader and known sizes.
    const dims = new Map()
    const openOf = (node) => { const own = publicCanRead(store, node); return own !== null ? own : publicCanRead(store, isFolder(subject) ? subject : store.sym(parentOf(node.uri))) }
    const shared = { dims, load: (img, uri) => load(img, uri, openOf(store.sym(uri)), () => {}) }
    state.media = shared
    const noteDims = (img, uri) => img.addEventListener('load', () => { if (img.naturalWidth) dims.set(uri, img.naturalWidth + ' × ' + img.naturalHeight + ' pixels') })

    // Clean up when the pane is taken off the page: revoke blob URLs, drop key handlers.
    const cleanups = []
    let wasOn = false
    const watcher = new win.MutationObserver(() => {
      if (root.isConnected) { wasOn = true; return }
      if (!wasOn) return
      gone = true
      watcher.disconnect()
      for (const fn of cleanups) { try { fn() } catch { /* keep going */ } }
      for (const url of blobs) win.URL.revokeObjectURL(url)
      blobs.clear()
      root.querySelectorAll('audio, video').forEach(m => { try { m.pause() } catch { /* not playing */ } })
    })
    watcher.observe(dom.body || dom.documentElement, { childList: true, subtree: true })

    const note = (where, text, quiet) => { const n = el(dom, 'p', 'med-note' + (quiet ? '' : ' med-note-error'), text); where.appendChild(n); return n }

    if (!isFolder(subject)) {
      renderFile(subject)
      return root
    }
    renderFolder(subject)
    return root

    function renderFile (node) {
      const kind = kindOf(store, node)
      const name = fileName(node.uri)
      root.appendChild(el(dom, 'div', 'med-head')).appendChild(el(dom, 'h2', 'med-heading med-title', name))
      const box = el(dom, 'figure', 'med-single')
      root.appendChild(box)
      const fail = (text) => { media.remove(); note(box, text) }
      let media
      if (kind === 'image') {
        media = el(dom, 'img')
        media.alt = name
        media.decoding = 'async'
      } else {
        media = el(dom, kind === 'video' ? 'video' : 'audio')
        media.controls = true
        media.preload = 'metadata'
      }
      box.appendChild(media)
      const cap = el(dom, 'figcaption', 'med-cap', kind === 'image' ? '' : (kind === 'video' ? 'Video' : 'Sound'))
      box.appendChild(cap)
      if (kind === 'image') {
        noteDims(media, node.uri)
        media.addEventListener('load', () => { cap.textContent = media.naturalWidth + ' × ' + media.naturalHeight + ' pixels' })
      }
      load(media, node.uri, publicCanRead(store, node), fail)
    }

    function renderFolder (folder) {
      const contents = folderContents(store, folder)
      const { images, tracks } = contents
      const open = publicCanRead(store, folder)
      const head = root.appendChild(el(dom, 'div', 'med-head'))
      head.appendChild(el(dom, 'h2', 'med-heading med-title', fileName(folder.uri) || folder.uri))
      head.appendChild(el(dom, 'p', 'med-meta', countText(contents)))
      if (!images.length && !tracks.length) {
        const box = root.appendChild(el(dom, 'div', 'med-empty'))
        box.appendChild(el(dom, 'span', 'med-empty-icon')).appendChild(icon(dom, MDI.images))
        box.appendChild(el(dom, 'h3', 'med-empty-title', 'No photos or sound here'))
        box.appendChild(el(dom, 'p', 'med-empty-text', 'This folder holds no pictures, sound or video. Its other files open in Files.'))
      }
      const playlist = tracks.length ? renderPlaylist(tracks, open) : null
      const gallery = images.length ? renderGallery(images, open) : null
      // The shell's navigation filters what is shown here: all of it, the photos, or the sound and video.
      state.applyFilter = () => {
        const f = state.filter
        if (playlist) {
          playlist.hidden = f === 'photos'
          if (playlist.hidden) playlist.querySelectorAll('audio, video').forEach(m => { try { m.pause() } catch { /* fine */ } })
        }
        if (gallery) gallery.hidden = f === 'tracks'
      }
      state.applyFilter()
    }

    function renderGallery (images, open) {
      const section = el(dom, 'section', 'med-section med-gallery', null, { 'aria-label': 'Photos' })
      if (root.querySelector('.med-playlist')) section.appendChild(el(dom, 'h3', 'med-subheading', 'Photos'))
      const grid = el(dom, 'ul', 'med-grid')
      section.appendChild(grid)
      root.appendChild(section)

      // Thumbnails load when they come near the screen.
      const lazy = new Map()
      const io = 'IntersectionObserver' in win
        ? new win.IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue
            io.unobserve(e.target)
            const start = lazy.get(e.target); lazy.delete(e.target)
            if (start) start()
          }
        }, { rootMargin: '300px' })
        : null
      if (io) cleanups.push(() => io.disconnect())

      images.forEach((node, i) => {
        const name = fileName(node.uri)
        const li = el(dom, 'li')
        const tile = el(dom, 'button', 'med-tile', null, { type: 'button', title: name, 'aria-label': 'Open ' + name })
        const thumb = el(dom, 'span', 'med-thumb')
        const img = el(dom, 'img')
        img.alt = ''
        img.decoding = 'async'
        img.loading = 'lazy'
        noteDims(img, node.uri)
        thumb.appendChild(img)
        tile.appendChild(thumb)
        tile.appendChild(el(dom, 'span', 'med-name', name))
        tile.addEventListener('click', () => show(i))
        li.appendChild(tile)
        grid.appendChild(li)
        const start = () => load(img, node.uri, open, (text) => { img.remove(); thumb.textContent = text })
        if (io) { lazy.set(thumb, start); io.observe(thumb) } else start()
      })

      // The large view, over the page, with the photo's details beside it on request.
      const box = el(dom, 'div', 'med-box', null, { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo' })
      box.hidden = true
      const bar = el(dom, 'div', 'med-bar')
      const bname = el(dom, 'span', 'med-bname')
      const count = el(dom, 'span', 'med-count')
      const info = iconButton(dom, 'med-info', 'Details', MDI.info)
      info.setAttribute('aria-pressed', 'false')
      const close = iconButton(dom, 'med-close', 'Close', MDI.close)
      bar.append(bname, count, info, close)
      const main = el(dom, 'div', 'med-main')
      const stage = el(dom, 'div', 'med-stage')
      const prev = iconButton(dom, 'med-prev', 'Previous photo', MDI.left)
      const next = iconButton(dom, 'med-next', 'Next photo', MDI.right)
      const frame = el(dom, 'div', 'med-frame')
      stage.append(prev, frame, next)
      const side = el(dom, 'aside', 'med-side', null, { 'aria-label': 'Details' }) // alone only; in the shell, its column
      side.hidden = true
      main.append(stage, side)
      box.append(bar, main)
      root.appendChild(box)

      let at = -1
      let opener = null
      let detailsOn = false
      let replacing = false
      let column = null // in the shell: its details column, while it shows this photo
      function setDetails (on) {
        detailsOn = on
        info.setAttribute('aria-pressed', String(on))
        if (!on) { box.classList.remove('med-beside'); column = null }
        // In the shell the details sit outside the viewer: it is not modal while they are open beside it.
        box.setAttribute('aria-modal', String(!(on && suite)))
      }
      function drawDetails () {
        const node = images[at]
        if (suite) {
          box.classList.add('med-beside')
          replacing = true
          const shown = suite.showDetails(node, {
            onClose: () => { if (!replacing) setDetails(false) } // the shell's close button
          })
          replacing = false
          if (!shown) setDetails(false)
          else column = shown.closest('aside') || shown
        } else {
          side.replaceChildren(fileDetails(dom, store, node, shared))
          side.hidden = false
        }
      }
      function closeDetails () {
        if (!detailsOn) return
        setDetails(false)
        if (suite) suite.closeDetails()
        else { side.hidden = true; side.replaceChildren() }
      }
      function show (i) {
        if (!box.hidden && at === i) return
        const wasHidden = box.hidden
        at = (i + images.length) % images.length
        const node = images[at]
        const name = fileName(node.uri)
        bname.textContent = name
        count.textContent = (at + 1) + ' / ' + images.length
        prev.hidden = next.hidden = images.length < 2
        frame.textContent = ''
        const big = el(dom, 'img')
        big.alt = name
        noteDims(big, node.uri)
        frame.appendChild(big)
        load(big, node.uri, open, (text) => { if (!big.isConnected) return; big.remove(); frame.appendChild(el(dom, 'p', 'med-note med-note-error', text)) })
        if (wasHidden) {
          opener = dom.activeElement
          box.hidden = false
          dom.addEventListener('keydown', onKey, true)
          close.focus()
        }
        if (detailsOn) drawDetails()
      }
      function hide () {
        if (box.hidden) return
        closeDetails()
        box.hidden = true
        frame.textContent = ''
        dom.removeEventListener('keydown', onKey, true)
        if (opener && opener.focus && opener.isConnected) opener.focus()
      }
      function onKey (e) {
        if (box.hidden) return
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation() // handled: the shell leaves it alone
          if (detailsOn) closeDetails(); else hide()
        } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1) } else if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1) } else if (e.key === 'Tab') {
          const inside = [...box.querySelectorAll('button, a[href]')]
          if (column && column.isConnected) inside.push(...column.querySelectorAll('button, a[href]'))
          const stops = inside.filter(b => !b.hidden && !b.closest('[hidden]')) // keep focus in the viewer (and its details)
          const i = stops.indexOf(dom.activeElement)
          e.preventDefault()
          stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus()
        }
      }
      prev.addEventListener('click', () => show(at - 1))
      next.addEventListener('click', () => show(at + 1))
      close.addEventListener('click', hide)
      info.addEventListener('click', () => { if (detailsOn) closeDetails(); else { setDetails(true); drawDetails() } })
      stage.addEventListener('click', (e) => { if (e.target === stage || e.target === frame) hide() })
      cleanups.push(() => dom.removeEventListener('keydown', onKey, true))
      return section
    }

    function renderPlaylist (tracks, open) {
      const section = el(dom, 'section', 'med-section med-playlist', null, { 'aria-label': 'Sound and video' })
      const player = el(dom, 'div', 'med-player')
      const now = el(dom, 'p', 'med-now', 'Pick a track to play')
      const slot = el(dom, 'div')
      player.append(now, slot)
      const list = el(dom, 'ol', 'med-list med-tracks')
      section.append(player, list)
      root.appendChild(section)
      const buttons = tracks.map((t, i) => {
        const name = fileName(t.node.uri)
        const li = el(dom, 'li')
        const b = el(dom, 'button', 'med-row med-track', null, { type: 'button', title: name })
        b.appendChild(el(dom, 'span', 'med-row-icon')).appendChild(icon(dom, t.kind === 'video' ? MDI.video : MDI.music))
        const mainText = b.appendChild(el(dom, 'span', 'med-row-main'))
        mainText.append(el(dom, 'span', 'med-row-title med-tname', name), el(dom, 'span', 'med-row-sub med-kind', t.kind === 'video' ? 'Video' : 'Audio'))
        const size = sizeText(factsOf(store, t.node).size)
        if (size) b.appendChild(el(dom, 'span', 'med-row-meta', size))
        b.addEventListener('click', () => play(i, true))
        li.appendChild(b)
        list.appendChild(li)
        return b
      })
      let media = null
      let current = -1
      function play (i, start) {
        current = i
        const t = tracks[i]
        buttons.forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'))
        now.textContent = fileName(t.node.uri)
        if (media) { try { media.pause() } catch { /* fine */ } media.remove() }
        slot.textContent = ''
        if (!start && open === false) { // private: a whole-file download, so only on request
          media = null
          const go = slot.appendChild(el(dom, 'button', 'med-btn med-load', null, { type: 'button' }))
          go.append(icon(dom, t.kind === 'video' ? MDI.video : MDI.music), el(dom, 'span', null, 'Play'))
          go.addEventListener('click', () => play(i, true))
          return
        }
        media = el(dom, t.kind === 'video' ? 'video' : 'audio')
        media.controls = true
        media.preload = 'metadata'
        if (t.kind === 'video') media.playsInline = true
        slot.appendChild(media)
        const mine = media
        mine.addEventListener('ended', () => { if (mine === media && current + 1 < tracks.length) play(current + 1, true) })
        if (start) mine.addEventListener('loadeddata', () => { if (mine === media) mine.play().catch(() => {}) }, { once: true })
        load(mine, t.node.uri, open, (text) => { if (mine === media) { mine.remove(); note(slot, text) } })
      }
      play(0, false)
      return section
    }
  }
}

export default pane

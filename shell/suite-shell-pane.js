// suite-shell-pane.js: the suite's frame. A header bar (app launcher, search box, the person's avatar menu) and an
// app frame with three columns: navigation on the left, content in the middle, details on the right.
//
// Load it by link: <browser>/index.html?pane=<this file>&uri=<anything>. From then on it opens first for every
// address the browser shows, and draws that address with the right app pane inside its frame.
//
// The apps: SUITE_APPS below (the suite's own panes, next to this file as ../<folder>/<folder>-pane.js), plus what
// the person's tool index lists. An app pane gives the content with its usual render(subject, context), and may
// give the left and right columns too (renderNavigation, renderDetails): the contract is in design/DESIGN.md.
//
// It never writes to the pod. It reads the person's profile, preferences file, type indexes and tool index.
// One file, no imports (the app panes are loaded with import() at run time, as the browser itself does).
// Icons: Material Design Icons (Apache 2.0). AGPL-3.0-or-later. Copyright (c) 2026 Melvin Carvalho.

const SHELL_NAME = 'suite-shell'
const CONTRACT = 1 // context.suite.version: bump when the contract in DESIGN.md changes

// ---- the suite's own apps, in launcher order: the one place to add or change an app ----------------------------
// folder: where its pane lives next to this one (../<folder>/<folder>-pane.js); pane: the pane's `name`;
// start: what the app opens on — 'root' (the pod's root folder), 'webid' (the person), or classes to look up in the
// person's type indexes (the first instance or instance container found). The order is also the priority when two
// suite panes both ask to open first on one thing (Dashboard before Files at the pod root, Tasks before Boards on a
// task list): choose() ranks them by their place here, never by load order. menu: shown in the avatar menu, not the
// launcher. file: the file name when it is not <folder>-pane.js. viewer: loaded so its views are offered, but not an app of its own.
const VCARD = 'http://www.w3.org/2006/vcard/ns#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
const SUITE_APPS = [
  { id: 'dashboard', name: 'Dashboard', folder: 'home', pane: 'pod-home', icon: 'dashboard', start: 'root' },
  { id: 'files', name: 'Files', folder: 'folder', pane: 'folder-lab', icon: 'folder', start: 'root' },
  { id: 'activity', name: 'Activity', folder: 'activity', pane: 'suite-activity', icon: 'activity', start: 'root' },
  { id: 'photos', name: 'Photos', folder: 'media', pane: 'media', icon: 'image', start: ['http://schema.org/ImageGallery', 'https://schema.org/ImageGallery'] },
  { id: 'contacts', name: 'Contacts', folder: 'contacts', pane: 'contacts', icon: 'contacts', start: [VCARD + 'AddressBook'] },
  { id: 'tasks', name: 'Tasks', folder: 'tasks', pane: 'suite-tasks', icon: 'tasks', start: [CAL + 'Vtodo'] }, // a task list is a wf:Tracker of cal:Vtodo: before Boards
  { id: 'boards', name: 'Boards', folder: 'issues', pane: 'issues', icon: 'boards', start: ['http://www.w3.org/2005/01/wf/flow#Tracker'] },
  { id: 'notes', name: 'Notes', folder: 'notes', pane: 'notes-reader', icon: 'notes', start: ['http://www.w3.org/ns/iana/media-types/text/markdown#Resource', 'https://schema.org/NoteDigitalDocument'] },
  { id: 'pads', name: 'Pads', folder: 'pad', pane: 'notepad', icon: 'pad', start: ['http://www.w3.org/ns/pim/pad#Notepad'] },
  { id: 'polls', name: 'Polls', folder: 'poll', pane: 'poll', icon: 'poll', start: ['http://www.w3.org/ns/pim/schedule#SchedulableEvent'] },
  { id: 'meetings', name: 'Meetings', folder: 'meeting', pane: 'meeting-page', icon: 'meeting', start: ['http://www.w3.org/ns/pim/meeting#Meeting'] },
  { id: 'profile', name: 'Profile', folder: 'profile-edit', pane: 'profile-edit-lab', icon: 'account', start: 'webid', menu: true },
  { id: 'settings', name: 'Settings', folder: 'settings', pane: 'settings-lab', icon: 'cog', start: 'webid', menu: true },
  { id: 'search', name: 'Search', folder: 'search', pane: 'suite-search', icon: 'search', viewer: true }, // Enter in the header box opens it
  { id: 'sharing', name: 'Sharing', folder: 'sharing', pane: 'sharing-lab', icon: 'share', viewer: true },
  { id: 'document', name: 'Document', folder: 'document', pane: 'document-lab', icon: 'document', viewer: true },
  { id: 'table', name: 'Table', folder: 'table', pane: 'table', icon: 'table', viewer: true },
  { id: 'source', name: 'Source', folder: 'source', pane: 'source-lab', icon: 'code', viewer: true },
  { id: 'data', name: 'Data', folder: 'data', pane: 'data-lab', icon: 'data', viewer: true },
  { id: 'shelf', name: 'Shelf (demo)', folder: 'shell', file: 'suite-shell-demo-pane.js', pane: 'suite-shell-demo', icon: 'notes', viewer: true } // shows the nav/details contract
]
const paneUrl = (app) => new URL('../' + app.folder + '/' + (app.file || app.folder + '-pane.js'), import.meta.url).href

// ---- vocabulary --------------------------------------------------------------------------------------------------
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const PIM = 'http://www.w3.org/ns/pim/space#'
const SOLID = 'http://www.w3.org/ns/solid/terms#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const TOOLS = 'https://pod-os.org/vocab/tools#'
const AC = 'https://www.w3.org/ns/ac#'
const HYDRA = 'http://www.w3.org/ns/hydra/core#'
const SCHEMA = ['https://schema.org/', 'http://schema.org/']
const PANE_MODULE = 'https://mashlib.com/ns/panes#PaneModuleInvocation' // placeholder name, as in the browser's toolIndex.js
const ALLOWED = 'mashlib.panes.allowed' // the browser's list of sites whose panes were allowed (read only)

// ---- icons: Material Design Icons (Apache 2.0), as paths in a 24 x 24 box -------------------------------------
const MDI = {
  apps: 'M16,20H20V16H16M16,14H20V10H16M10,8H14V4H10M16,8H20V4H16M10,14H14V10H10M4,14H8V10H4M4,20H8V16H4M10,20H14V16H10M4,8H8V4H4V8Z',
  menu: 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  views: 'M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z',
  dashboard: 'M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z',
  folder: 'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
  image: 'M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z',
  contacts: 'M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z',
  boards: 'M16,5V18H21V5M4,18H9V5H4M10,18H15V5H10V18Z',
  tasks: 'M3,5H9V11H3V5M5,7V9H7V7H5M11,7H21V9H11V7M11,15H21V17H11V15M5,20L1.5,16.5L2.91,15.09L5,17.17L9.59,12.59L11,14L5,20Z',
  activity: 'M11,15H6L13,1V9H18L11,23V15Z',
  notes: 'M14,10H19.5L14,4.5V10M5,3H15L21,9V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3M5,12V14H19V12H5M5,16V18H14V16H5Z',
  pad: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
  poll: 'M3,22V8H7V22H3M10,22V2H14V22H10M17,22V14H21V22H17Z',
  meeting: 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z',
  account: 'M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z',
  cog: 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z',
  logout: 'M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.58L17 17L22 12M4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z',
  login: 'M10,17V14H3V10H10V7L15,12L10,17M10,2H19A2,2 0 0,1 21,4V20A2,2 0 0,1 19,22H10A2,2 0 0,1 8,20V18H10V20H19V4H10V6H8V4A2,2 0 0,1 10,2Z',
  share: 'M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z',
  document: 'M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z',
  table: 'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,8V12H11V8H5M13,8V12H19V8H13M5,14V18H11V14H5M13,14V18H19V14H13Z',
  code: 'M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z',
  data: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z',
  pane: 'M20.5,11H19V7C19,5.89 18.1,5 17,5H13V3.5A2.5,2.5 0 0,0 10.5,1A2.5,2.5 0 0,0 8,3.5V5H4A2,2 0 0,0 2,7V10.8H3.5C5,10.8 6.2,12 6.2,13.5C6.2,15 5,16.2 3.5,16.2H2V20A2,2 0 0,0 4,22H7.8V20.5C7.8,19 9,17.8 10.5,17.8C12,17.8 13.2,19 13.2,20.5V22H17A2,2 0 0,0 19,20V16H20.5A2.5,2.5 0 0,0 23,13.5A2.5,2.5 0 0,0 20.5,11Z',
  openNew: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z',
  alert: 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z'
}
const svgUri = (path, fill = '#000') => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`)
const ICON = svgUri(MDI.apps, '#0082c9')

// ---- CSS: the design sheet (embedded by design/embed.mjs), then the frame -----------------------------------
const CSS = `
/* suite:design begin --prefix sh --provider */
:root {
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
.sh-root { box-sizing: border-box; color: var(--sui-text); background: var(--sui-bg); font-family: var(--sui-font); font-size: var(--sui-text-md); line-height: var(--sui-line); text-align: left; -webkit-font-smoothing: antialiased }
.sh-root *, .sh-root *::before, .sh-root *::after { box-sizing: border-box }
.sh-root :focus-visible { outline: 2px solid var(--sui-focus); outline-offset: 2px }
.sh-root :where(a) { color: var(--sui-primary-element) }
/* The data browser styles bare elements (header margins, button padding and weight): undo that inside the root. */
.sh-root :where(header, nav, main, aside, section, form, h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0 }
.sh-root :where(button, [role="button"], input, select, textarea) { font: inherit; font-weight: inherit; letter-spacing: inherit; min-width: 0; transition: none }
/* ...and draws every [role=status] as a green box (and [role=alert] as a red one): live regions here are plain. */
.sh-root :where([role="status"], [role="alert"]) { display: revert; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; box-shadow: none }
.sh-root [hidden] { display: none !important }
.sh-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.sh-muted { color: var(--sui-text-muted) }
.sh-small { font-size: var(--sui-text-sm) }
.sh-late { color: var(--sui-late); font-weight: var(--sui-weight-bold) }
.sh-reading { max-width: var(--sui-reading-width); margin-left: auto; margin-right: auto }
.sh-title { margin: 0; font-size: var(--sui-text-2xl); font-weight: var(--sui-weight-bold); line-height: 1.25 }
.sh-heading { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold); line-height: 1.3 }
.sh-subheading { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35 }
.sh-caption { margin: 0; padding: 0 var(--sui-space-3); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-primary-element); line-height: var(--sui-target-sm) }
/* ---- icon: a span with --sh-i set to url("data:image/svg+xml,...") ---------------------------------- */
.sh-icon { flex: none; display: inline-block; width: var(--sui-icon); height: var(--sui-icon); background: currentColor; -webkit-mask: var(--sh-i) center / contain no-repeat; mask: var(--sh-i) center / contain no-repeat }
/* ---- header bar ----------------------------------------------------------------------------------------- */
.sh-header { display: flex; align-items: center; gap: var(--sui-space-1); height: var(--sui-header); padding: 0 var(--sui-space-1); background: var(--sui-primary); color: var(--sui-primary-text) }
.sh-header-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-width: var(--sui-target); height: var(--sui-target); padding: 0 var(--sui-space-2); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: inherit; font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer; text-decoration: none }
.sh-header-btn:hover, .sh-header-btn[aria-expanded="true"] { background: rgba(255, 255, 255, .16) }
.sh-header-btn:focus-visible { outline: 2px solid var(--sui-primary-text); outline-offset: -2px }
.sh-header-app { flex: 0 0 auto; max-width: 40%; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); padding: 0 var(--sui-space-2) }
.sh-header-apps { display: flex; gap: var(--sui-space-1); min-width: 0; overflow: hidden }
.sh-header-apps .sh-header-btn { opacity: .78 }
.sh-header-apps .sh-header-btn[aria-current="page"], .sh-header-apps .sh-header-btn:hover { opacity: 1 }
.sh-header-apps .sh-header-btn[aria-current="page"] { box-shadow: inset 0 -3px 0 var(--sui-primary-text); border-radius: 0 }
.sh-header-spacer { flex: 1 1 auto; min-width: 0 }
.sh-header-search { flex: 0 1 320px; min-width: 0; display: flex; align-items: center; gap: var(--sui-space-2); height: var(--sui-target-sm); padding: 0 var(--sui-space-3); border-radius: var(--sui-radius-pill); background: rgba(255, 255, 255, .18); color: var(--sui-primary-text) }
.sh-header-search:focus-within { background: var(--sui-bg); color: var(--sui-text) }
.sh-header-search input { flex: 1 1 auto; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: inherit; font: inherit }
.sh-header-search input::placeholder { color: inherit; opacity: .85 }
/* ---- menu: popover menu (avatar menu, row actions) ------------------------------------------------------------ */
.sh-popover { position: absolute; z-index: 40; min-width: 220px; max-width: calc(100vw - 16px); padding: var(--sui-space-1); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-text); box-shadow: var(--sui-shadow-lg); border: 1px solid var(--sui-border) }
.sh-menu { margin: 0; padding: 0; list-style: none }
.sh-menu-head { display: flex; align-items: center; gap: var(--sui-space-3); padding: var(--sui-space-2) var(--sui-space-3) var(--sui-space-3); border-bottom: 1px solid var(--sui-border); margin-bottom: var(--sui-space-1); min-width: 0 }
.sh-menu-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.sh-menu-item:hover, .sh-menu-item:focus-visible { background: var(--sui-bg-hover); outline: none }
.sh-menu-item .sh-icon { color: var(--sui-text-muted) }
/* ---- launcher: the app launcher, a grid of tiles in a popover --------------------------------------------------------- */
.sh-launcher { width: 360px; padding: var(--sui-space-3) }
.sh-launcher-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sui-space-1); margin: 0; padding: 0; list-style: none }
.sh-launcher-tile { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); width: 100%; min-height: 88px; padding: var(--sui-space-3) var(--sui-space-1); border: 0; border-radius: var(--sui-radius-lg); background: transparent; color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); text-align: center; text-decoration: none; cursor: pointer; overflow-wrap: anywhere }
.sh-launcher-tile:hover, .sh-launcher-tile:focus-visible { background: var(--sui-bg-hover); outline: none }
.sh-launcher-tile[aria-current="page"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text) }
.sh-launcher-tile[aria-disabled="true"] { opacity: .5; cursor: default }
.sh-launcher-badge { display: inline-flex; align-items: center; justify-content: center; width: var(--sui-target); height: var(--sui-target); border-radius: var(--sui-radius-lg); background: var(--sui-primary-element); color: var(--sui-primary-text) }
.sh-launcher-badge .sh-icon { width: 24px; height: 24px }
.sh-launcher-badge.sh-alt { background: var(--sui-bg-dark); color: var(--sui-text) }
/* ---- nav: navigation list (left) ---------------------------------------------------------------------------- */
.sh-nav { display: flex; flex-direction: column; gap: 2px; width: var(--sui-nav-width); max-width: 100%; padding: var(--sui-space-2); background: var(--sui-bg-app) }
.sh-nav-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none }
.sh-nav-item { display: flex; align-items: center; gap: var(--sui-space-3); width: 100%; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius); background: transparent; color: var(--sui-text); font: inherit; text-align: left; text-decoration: none; cursor: pointer }
.sh-nav-item:hover { background: var(--sui-bg-hover) }
.sh-nav-item[aria-current="page"], .sh-nav-item[aria-current="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.sh-nav-item .sh-icon { color: var(--sui-text-muted) }
.sh-nav-item[aria-current] .sh-icon { color: inherit }
.sh-nav-label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.sh-nav-count { flex: none; min-width: 24px; padding: 0 var(--sui-space-2); border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font-size: var(--sui-text-sm); line-height: 22px; text-align: center }
.sh-nav-new { margin-bottom: var(--sui-space-2) }
.sh-nav-foot { margin-top: auto; padding-top: var(--sui-space-2); border-top: 1px solid var(--sui-border) }
/* ---- toolbar: content toolbar and breadcrumbs ---------------------------------------------------------------------- */
.sh-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sui-space-2); min-height: calc(var(--sui-target) + var(--sui-space-3)); padding: var(--sui-space-1) var(--sui-space-3) }
.sh-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: var(--sui-text-lg) }
.sh-crumbs li { display: flex; align-items: center; min-width: 0 }
.sh-crumbs li + li::before { content: "›"; padding: 0 var(--sui-space-1); color: var(--sui-text-muted) }
.sh-crumbs a { display: inline-flex; align-items: center; min-height: var(--sui-target); padding: 0 var(--sui-space-2); border-radius: var(--sui-radius); color: var(--sui-text-muted); text-decoration: none; overflow-wrap: anywhere }
.sh-crumbs a:hover { background: var(--sui-bg-hover) }
.sh-crumbs [aria-current="page"] { color: var(--sui-text); font-weight: var(--sui-weight-bold) }
/* ---- row: list row ------------------------------------------------------------------------------------------- */
.sh-list { margin: 0; padding: 0; list-style: none }
.sh-row { display: flex; align-items: center; gap: var(--sui-space-3); min-height: 56px; padding: var(--sui-space-1) var(--sui-space-2) var(--sui-space-1) var(--sui-space-3); border-radius: var(--sui-radius); color: var(--sui-text); text-decoration: none; cursor: pointer }
.sh-row:hover { background: var(--sui-bg-hover) }
.sh-row[aria-selected="true"], .sh-row[aria-current="true"] { background: var(--sui-primary-light) }
.sh-row-main { flex: 1 1 auto; min-width: 0 }
.sh-row-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: var(--sui-weight-bold) }
.sh-row-sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-row-meta { flex: none; color: var(--sui-text-muted); font-size: var(--sui-text-sm); white-space: nowrap }
.sh-row-actions { flex: none; display: flex; align-items: center }
.sh-row-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--sui-radius); color: var(--sui-primary-element) }
.sh-row-icon .sh-icon { width: 28px; height: 28px }
.sh-row-check { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px }
@media (max-width: 520px) { .sh-row-meta { display: none } }
/* ---- buttons ---------------------------------------------------------------------------------------------- */
.sh-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sui-space-2); min-height: var(--sui-target); max-width: 100%; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-primary-light); color: var(--sui-primary-light-text); font: inherit; font-weight: var(--sui-weight-bold); line-height: 1.2; text-align: center; text-decoration: none; cursor: pointer; transition: background var(--sui-ease) }
.sh-btn:hover { background: var(--sui-primary-light-hover) }
.sh-btn:disabled, .sh-btn[aria-disabled="true"] { opacity: .5; cursor: default }
.sh-btn-primary { background: var(--sui-primary-element); color: var(--sui-primary-text) }
.sh-btn-primary:hover { background: var(--sui-primary-element-hover) }
.sh-btn-tertiary { background: transparent; color: var(--sui-text) }
.sh-btn-tertiary:hover { background: var(--sui-bg-hover) }
.sh-btn-danger { background: var(--sui-error); color: var(--sui-primary-text) }
.sh-btn-danger:hover { background: var(--sui-error); filter: brightness(.9) }
.sh-btn-icon { width: var(--sui-target); padding: 0; background: transparent; color: var(--sui-text) }
.sh-btn-icon:hover { background: var(--sui-bg-hover) }
.sh-btn-wide { width: 100%; justify-content: flex-start }
.sh-btns { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
/* ---- input ------------------------------------------------------------------------------------------------ */
.sh-field { display: flex; flex-direction: column; gap: var(--sui-space-1); min-width: 0 }
.sh-label { font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); color: var(--sui-text) }
.sh-hint { font-size: var(--sui-text-sm); color: var(--sui-text-muted) }
.sh-input { width: 100%; min-width: 0; min-height: var(--sui-target); padding: 0 var(--sui-space-4); border: 1px solid var(--sui-border-strong); border-radius: var(--sui-radius-pill); background: var(--sui-bg); color: var(--sui-text); font: inherit }
.sh-input:hover { border-color: var(--sui-primary-element) }
.sh-input:focus { outline: none; border-color: var(--sui-primary-element); box-shadow: 0 0 0 1px var(--sui-primary-element) }
.sh-input[aria-invalid="true"] { border-color: var(--sui-error); box-shadow: 0 0 0 1px var(--sui-error) }
textarea.sh-input { min-height: 96px; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius-lg); resize: vertical; line-height: var(--sui-line) }
.sh-search { position: relative; display: flex; align-items: center; min-width: 0 }
.sh-search .sh-icon { position: absolute; left: var(--sui-space-3); color: var(--sui-text-muted); pointer-events: none }
.sh-search .sh-input { padding-left: 42px }
/* select: <span class="ui-select"><select class="ui-input">…</select></span> (the wrapper draws the chevron) */
.sh-select { position: relative; display: block; min-width: 0 }
.sh-select select { -webkit-appearance: none; appearance: none; padding-right: 44px; cursor: pointer; background: var(--sui-bg) }
.sh-select::after { content: ""; position: absolute; top: 50%; right: var(--sui-space-4); width: var(--sui-icon); height: var(--sui-icon); margin-top: -10px; background: var(--sui-text-muted); pointer-events: none; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z%27/%3E%3C/svg%3E") center / contain no-repeat }
/* file input: <label class="ui-btn ui-file">icon Upload<input type="file"></label> (a button that opens the picker) */
.sh-file { position: relative; overflow: hidden }
.sh-file input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer }
.sh-file:focus-within { outline: 2px solid var(--sui-focus); outline-offset: 2px }
/* checkbox: <label class="ui-checkbox"><input class="ui-check" type="checkbox"><span>Text</span></label>; alone in a row: .sh-row-check */
.sh-checkbox { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.sh-check { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 22px; height: 22px; margin: 0; border: 2px solid var(--sui-border-strong); border-radius: var(--sui-radius-sm); background: var(--sui-bg); cursor: pointer }
.sh-check-round { border-radius: 50% }
.sh-check:hover { border-color: var(--sui-primary-element) }
.sh-check:checked { border-color: var(--sui-primary-element); background: var(--sui-primary-element) }
.sh-check:checked::after { content: ""; position: absolute; inset: 1px; background: var(--sui-primary-text); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z%27/%3E%3C/svg%3E") center / contain no-repeat }
.sh-check:disabled { opacity: .5; cursor: default }
/* segmented control: <div class="ui-segmented" role="group"><button class="ui-segment" aria-pressed="true">…</button>…</div> */
.sh-segmented { display: inline-flex; gap: 2px; max-width: 100%; min-height: var(--sui-target); padding: 2px; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); overflow-x: auto }
.sh-segment { flex: none; min-height: 40px; padding: 0 var(--sui-space-4); border: 0; border-radius: var(--sui-radius-pill); background: transparent; color: var(--sui-text); font: inherit; font-weight: var(--sui-weight-bold); white-space: nowrap; cursor: pointer }
.sh-segment:hover { background: var(--sui-bg-hover) }
.sh-segment[aria-pressed="true"], .sh-segment[aria-selected="true"] { background: var(--sui-bg); color: var(--sui-primary-light-text); box-shadow: var(--sui-shadow) }
/* ---- switch: <label class="ui-switch"><input type="checkbox" role="switch"><span>Text</span></label> ---------- */
.sh-switch { display: inline-flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); cursor: pointer }
.sh-switch input { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 40px; height: 22px; margin: 0; border-radius: var(--sui-radius-pill); background: var(--sui-border-strong); cursor: pointer; transition: background var(--sui-ease) }
.sh-switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--sui-bg); transition: transform var(--sui-ease) }
.sh-switch input:checked { background: var(--sui-primary-element) }
.sh-switch input:checked::after { transform: translateX(18px) }
.sh-switch input:disabled { opacity: .5 }
/* ---- chip ------------------------------------------------------------------------------------------------- */
.sh-chips { display: flex; flex-wrap: wrap; gap: var(--sui-space-2) }
.sh-chip { display: inline-flex; align-items: center; gap: var(--sui-space-1); max-width: 100%; min-height: 28px; padding: 0 var(--sui-space-3); border: 0; border-radius: var(--sui-radius-pill); background: var(--sui-bg-dark); color: var(--sui-text); font: inherit; font-size: var(--sui-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none }
button.sh-chip { cursor: pointer }
button.sh-chip:hover { background: var(--sui-primary-light-hover) }
.sh-chip-primary, .sh-chip[aria-pressed="true"] { background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-weight: var(--sui-weight-bold) }
.sh-chip-success { background: var(--sui-success-light); color: var(--sui-success) }
.sh-chip-warning { background: var(--sui-warning-light); color: var(--sui-warning) }
.sh-chip-error { background: var(--sui-error-light); color: var(--sui-error) }
/* ---- avatar: a span with initials, or an <img class="ui-avatar"> -------------------------------------------- */
.sh-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar); height: var(--sui-avatar); border-radius: 50%; overflow: hidden; background: var(--sui-primary-light); color: var(--sui-primary-light-text); font-size: var(--sui-text-sm); font-weight: var(--sui-weight-bold); line-height: 1; object-fit: cover; text-transform: uppercase; user-select: none }
.sh-avatar-lg { width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); font-size: var(--sui-text-xl) }
.sh-avatar-xl { width: var(--sui-avatar-xl); height: var(--sui-avatar-xl); font-size: var(--sui-text-2xl) }
.sh-header .sh-avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7) }
/* ---- empty state ------------------------------------------------------------------------------------------ */
.sh-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sui-space-2); max-width: 440px; margin: var(--sui-space-12) auto; padding: 0 var(--sui-space-4); text-align: center }
.sh-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; margin-bottom: var(--sui-space-2); border-radius: 50%; background: var(--sui-bg-app); color: var(--sui-text-muted) }
.sh-empty-icon .sh-icon { width: 48px; height: 48px }
.sh-empty-title { margin: 0; font-size: var(--sui-text-xl); font-weight: var(--sui-weight-bold) }
.sh-empty-text { margin: 0 0 var(--sui-space-2); color: var(--sui-text-muted) }
/* ---- toast: toast (floating) and status line (inline) ----------------------------------------------------------- */
.sh-toasts { position: fixed; z-index: 60; left: 50%; bottom: var(--sui-space-4); transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--sui-space-2); width: max-content; max-width: calc(100vw - 32px); pointer-events: none }
.sh-toast { display: flex; align-items: center; gap: var(--sui-space-3); min-height: var(--sui-target); padding: var(--sui-space-2) var(--sui-space-4); border-radius: var(--sui-radius-lg); background: var(--sui-text); color: var(--sui-primary-text); box-shadow: var(--sui-shadow-lg); pointer-events: auto; border-left: 4px solid var(--sui-primary) }
.sh-toast-error { border-left-color: var(--sui-error) }
.sh-toast-success { border-left-color: var(--sui-success) }
.sh-status { display: flex; align-items: center; gap: var(--sui-space-2); min-height: 28px; margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-status-error { color: var(--sui-error) }
.sh-status-success { color: var(--sui-success) }
.sh-note { display: flex; gap: var(--sui-space-3); align-items: flex-start; padding: var(--sui-space-3) var(--sui-space-4); border-radius: var(--sui-radius); background: var(--sui-primary-light); color: var(--sui-text) }
.sh-note-error { background: var(--sui-error-light) }
.sh-note-warning { background: var(--sui-warning-light) }
.sh-note-success { background: var(--sui-success-light) }
/* ---- modal: Escape — the shell acts last, so a modal that closes on Escape calls event.preventDefault() and has aria-modal="true" (DESIGN.md) ---------------------------------------------------------------------------------------------- */
.sh-backdrop { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: var(--sui-space-4); background: var(--sui-backdrop) }
.sh-modal { display: flex; flex-direction: column; width: 100%; max-width: 480px; max-height: calc(100vh - 32px); overflow: auto; border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-text); box-shadow: var(--sui-shadow-lg) }
.sh-modal-head { display: flex; align-items: center; gap: var(--sui-space-2); padding: var(--sui-space-3) var(--sui-space-2) 0 var(--sui-space-6) }
.sh-modal-head .sh-heading { flex: 1 1 auto; min-width: 0 }
.sh-modal-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-3) var(--sui-space-6) var(--sui-space-4) }
.sh-modal-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sui-space-2); padding: 0 var(--sui-space-6) var(--sui-space-5) }
/* ---- details: details sidebar (right) ------------------------------------------------------------------------------ */
.sh-details { display: flex; flex-direction: column; width: var(--sui-details-width); max-width: 100%; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.sh-details-head { display: flex; align-items: flex-start; gap: var(--sui-space-3); padding: var(--sui-space-4) 56px var(--sui-space-3) var(--sui-space-4); background: var(--sui-bg-app) }
.sh-details-figure { flex: none; display: inline-flex; align-items: center; justify-content: center; width: var(--sui-avatar-lg); height: var(--sui-avatar-lg); border-radius: var(--sui-radius-lg); background: var(--sui-bg); color: var(--sui-primary-element) }
.sh-details-figure .sh-icon { width: 36px; height: 36px }
.sh-details-titles { flex: 1 1 auto; min-width: 0; padding-top: var(--sui-space-1) }
.sh-details-title { margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold); line-height: 1.35; overflow-wrap: anywhere }
.sh-details-sub { margin: 0; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-tabs { display: flex; gap: var(--sui-space-1); padding: 0 var(--sui-space-3); border-bottom: 1px solid var(--sui-border); overflow-x: auto }
.sh-tab { flex: none; min-height: var(--sui-target); padding: 0 var(--sui-space-3); border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--sui-text-muted); font: inherit; font-weight: var(--sui-weight-bold); cursor: pointer }
.sh-tab:hover { color: var(--sui-text) }
.sh-tab[aria-selected="true"] { border-bottom-color: var(--sui-primary-element); color: var(--sui-text) }
.sh-details-body { display: flex; flex-direction: column; gap: var(--sui-space-4); padding: var(--sui-space-4) }
.sh-props { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--sui-space-2) var(--sui-space-3); margin: 0; font-size: var(--sui-text-sm) }
.sh-props dt { color: var(--sui-text-muted) }
.sh-props dd { margin: 0; overflow-wrap: anywhere }
/* ---- fields: a labelled field list with icons (a contact card, a details panel) ----------------------------- */
.sh-fields { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none }
.sh-field-row { display: grid; grid-template-columns: var(--sui-icon) minmax(0, 1fr) auto; align-items: start; gap: 2px var(--sui-space-3); padding: var(--sui-space-2) 0 }
.sh-field-row > .sh-icon { grid-row: span 2; margin-top: 2px; color: var(--sui-text-muted) }
.sh-field-row-label { grid-column: 2; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-field-row-value { grid-column: 2; min-width: 0; overflow-wrap: anywhere }
.sh-field-row-action { grid-column: 3; grid-row: 1 / span 2; align-self: center }
/* ---- card: a section card (dashboard widgets, settings and profile sections) ---------------------------------- */
.sh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--sui-space-4) }
.sh-card { min-width: 0; padding: var(--sui-space-4) var(--sui-space-5); border: 1px solid var(--sui-border); border-radius: var(--sui-radius-lg); background: var(--sui-bg) }
.sh-card-head { display: flex; align-items: center; gap: var(--sui-space-2); min-height: var(--sui-target-sm); margin: 0 0 var(--sui-space-3) }
.sh-card-head > .sh-icon { color: var(--sui-primary-element) }
.sh-card-title { flex: 1 1 auto; min-width: 0; margin: 0; font-size: var(--sui-text-lg); font-weight: var(--sui-weight-bold) }
.sh-card-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sui-space-2); margin-top: var(--sui-space-3) }
/* ---- board: columns of cards (Boards); scrolls sideways inside itself, never the page ----------------------- */
.sh-board { display: flex; align-items: flex-start; gap: var(--sui-space-3); max-width: 100%; overflow-x: auto; padding-bottom: var(--sui-space-2) }
.sh-column { flex: none; width: var(--sui-column-width); max-width: calc(100vw - 48px); padding: var(--sui-space-2); border-radius: var(--sui-radius-lg); background: var(--sui-bg-app) }
.sh-column-head { display: flex; align-items: center; gap: var(--sui-space-2); min-height: var(--sui-target); padding: 0 var(--sui-space-2); font-weight: var(--sui-weight-bold) }
.sh-column-card { display: block; margin: 0 0 var(--sui-space-2); padding: var(--sui-space-3); border-radius: var(--sui-radius); background: var(--sui-bg); box-shadow: var(--sui-shadow); color: var(--sui-text); text-decoration: none }
.sh-column-card:hover { box-shadow: var(--sui-shadow-lg) }
/* ---- viewer: a dark surface for photos and media (a full-screen viewer, a player bar) ------------------------- */
.sh-viewer { background: var(--sui-surface-dark); color: var(--sui-surface-dark-text) }
.sh-viewer-muted { color: var(--sui-surface-dark-muted) }
.sh-viewer .sh-btn-icon, .sh-viewer .sh-btn-tertiary { color: var(--sui-surface-dark-text) }
.sh-viewer .sh-btn-icon:hover, .sh-viewer .sh-btn-tertiary:hover { background: rgba(255, 255, 255, .14) }
.sh-viewer :focus-visible { outline-color: var(--sui-surface-dark-text) }
/* suite:design end */
.sh-wordmark { font-weight: 700; font-size: 17px; letter-spacing: .01em; color: var(--sui-primary-text); padding: 0 var(--sui-space-3) 0 var(--sui-space-1); white-space: nowrap; flex: none }
@media (max-width: 900px) { .sh-wordmark { display: none } }
.sh.suite-shell-pane { position: fixed; z-index: 20; top: var(--app-header-height, 0px); left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; max-width: none; margin: 0; overflow: hidden }
.sh.suite-shell-pane.sh-paused { display: none }
.sh-top { position: relative; flex: none }
.sh-header .sh-header-app { flex: 0 1 auto }
.sh-header-apps { flex: 0 1 auto }
.sh-launch-btn .sh-icon { width: 24px; height: 24px }
.sh-launcher, .sh-account { top: calc(var(--sui-header) - 2px) }
.sh-launcher { left: var(--sui-space-1) }
.sh-account { right: var(--sui-space-1); width: 280px }
.sh-launcher-section + .sh-launcher-section { margin-top: var(--sui-space-3); padding-top: var(--sui-space-3); border-top: 1px solid var(--sui-border) }
.sh-launcher-section > .sh-caption { margin-bottom: var(--sui-space-1) }
.sh-who { min-width: 0 }
.sh-who b, .sh-who span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
.sh-who span { color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-login { padding: 0 var(--sui-space-4); background: var(--sui-primary-text); color: var(--sui-primary-element) }
.sh-login:hover { background: var(--sui-primary-light) }
.sh-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; background: var(--sui-bg) }
.sh-navcol { flex: none; width: var(--sui-nav-width); overflow-y: auto; padding: var(--sui-space-2); background: var(--sui-bg-app); border-right: 1px solid var(--sui-border) }
.sh-navcol, .sh-main, .sh-detcol { overscroll-behavior: contain }
.sh-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; background: var(--sui-bg) }
.sh-bar { position: sticky; top: 0; z-index: 5; flex: none; display: flex; align-items: center; gap: var(--sui-space-1); min-height: 52px; padding: var(--sui-space-1) var(--sui-space-2); background: var(--sui-bg) }
.sh-bar-title { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sui-text-muted); font-size: var(--sui-text-sm) }
.sh-content { flex: 1 0 auto; min-width: 0 }
.sh-content > * { max-width: 100% }
.sh-views { right: var(--sui-space-2); top: 48px }
.sh-detcol { position: relative; flex: none; width: var(--sui-details-width); overflow-y: auto; background: var(--sui-bg); border-left: 1px solid var(--sui-border) }
.sh-detcol > .sh-details-close { position: absolute; z-index: 2; top: var(--sui-space-2); right: var(--sui-space-2) }
.sh-scrim { display: none }
.sh-loading { padding: var(--sui-space-6); color: var(--sui-text-muted) }
@media (max-width: 1100px) {
  .sh-header-apps { display: none }
  .sh-detcol { position: absolute; z-index: 30; top: 0; right: 0; bottom: 0; width: min(var(--sui-details-width), 100%); box-shadow: var(--sui-shadow-lg) }
}
@media (min-width: 1101px) { .sh-header .sh-header-app { display: none } }
@media (max-width: 900px) {
  .sh-navcol { position: absolute; z-index: 31; top: 0; left: 0; bottom: 0; width: min(var(--sui-nav-width), calc(100% - 56px)); box-shadow: var(--sui-shadow-lg) }
  .sh.suite-shell-pane[data-nav="open"] .sh-scrim, .sh.suite-shell-pane[data-details="open"] .sh-scrim { display: block; position: absolute; z-index: 29; inset: 0; background: var(--sui-backdrop) }
}
@media (max-width: 600px) {
  .sh-header-search { flex: 1 1 auto }
  .sh-detcol { width: 100% }
  .sh-header .sh-header-app { display: none }
  .sh-login span:not(.sh-icon) { display: none }
  .sh-login { width: var(--sui-target); padding: 0 }
}
`

// ---- small helpers -----------------------------------------------------------------------------------------------
function el (dom, tag, cls, text, attrs) {
  const node = dom.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined && text !== null && text !== '') node.textContent = text
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v)
  return node
}
function icon (dom, name) {
  const span = el(dom, 'span', 'sh-icon', null, { 'aria-hidden': 'true' })
  span.style.setProperty('--sh-i', `url("${svgUri(MDI[name] || MDI.pane)}")`)
  return span
}
const httpOnly = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '' } catch { return '' } }
const sameThing = (a, b) => !!a && !!b && a.replace(/\/$/, '') === b.replace(/\/$/, '')
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function currentUser (context) {
  const places = [
    context && context.session && context.session.logic && context.session.logic.authn,
    globalThis.SolidLogic && globalThis.SolidLogic.authn,
    globalThis.UI && globalThis.UI.authn
  ]
  for (const authn of places) {
    try { const me = authn && authn.currentUser && authn.currentUser(); if (me) return me } catch { /* try the next */ }
  }
  return null
}
const ownPane = (registry, name) => state.own.get(name) || registry.byName(name) || null
const registryOf = (context) => (context && context.session && context.session.paneRegistry) || globalThis.panes

// ---- module state: kept across the shell's re-renders on one page ----------------------------------------------
const state = {
  loaded: null, // promise: the suite's panes imported and registered
  own: new Map(), // pane name → the module this shell imported for a SUITE_APPS entry
  wanted: null, // { uri, name }: the pane to show that address with (set by the launcher, the views menu, suite.go)
  starts: new Map(), // app id → address it opens on, per person
  person: null, // { webid, name, photo, root }
  toasts: [], // { text, kind, until }: still showing; a toast raised just before suite.go() is drawn again after it
  carryQuery: '' // the header search text, kept when Enter opens the search app (a new render, a new box)
}

// The suite's own module is always the one used for a SUITE_APPS pane, even when another pane with the same name
// (say, a published copy from the person's tool index) got into the browser's registry first: state.own keeps the
// module this shell imported, keyed by the pane's name, and ownPane() prefers it to the registry's entry.
async function loadSuitePanes (registry) {
  const one = async (app) => {
    try {
      const pane = (await import(paneUrl(app))).default
      if (!pane || !pane.name || typeof pane.render !== 'function' || typeof pane.label !== 'function') return
      state.own.set(pane.name, pane)
      if (!registry.byName(pane.name)) registry.register(pane)
    } catch (error) { console.warn('[suite] pane not loaded: ' + app.folder + ': ' + (error && error.message)) }
  }
  await Promise.race([Promise.all(SUITE_APPS.map(one)), wait(8000)])
}

// ---- the person: profile, pod root, type indexes, tool index (read only) ---------------------------------------
async function readPerson (store, me) {
  const sym = (u) => store.sym(u)
  const load = async (node) => { try { await store.fetcher.load(node); return true } catch { return false } }
  await load(me.doc())
  const pick = (preds) => { for (const p of preds) { const v = store.any(me, sym(p)); if (v) return v.value } return '' }
  const name = pick([VCARD + 'fn', FOAF + 'name']) || ''
  const photo = httpOnly(pick([VCARD + 'hasPhoto', FOAF + 'img']))
  const storage = store.any(me, sym(PIM + 'storage'))
  const root = (storage && storage.value) || new URL('..', me.doc().uri).href
  return { webid: me.uri, name, photo, root }
}

async function typeIndexInstances (store, me, classes) {
  const sym = (u) => store.sym(u)
  const load = async (node) => { try { await store.fetcher.load(node); return true } catch { return false } }
  const indexes = []
  for (const p of [SOLID + 'publicTypeIndex', SOLID + 'privateTypeIndex']) for (const i of store.each(me, sym(p))) indexes.push(i)
  for (const prefs of store.each(me, sym(PIM + 'preferencesFile'))) {
    if (await load(prefs)) for (const p of [SOLID + 'publicTypeIndex', SOLID + 'privateTypeIndex']) for (const i of store.each(null, sym(p), null, prefs.doc())) indexes.push(i)
  }
  for (const index of indexes) {
    if (!await load(index.doc())) continue
    for (const cls of classes) {
      for (const reg of store.each(null, sym(SOLID + 'forClass'), sym(cls), index.doc())) {
        const found = store.any(reg, sym(SOLID + 'instance'), null, index.doc()) || store.any(reg, sym(SOLID + 'instanceContainer'), null, index.doc())
        if (found && httpOnly(found.value)) return found.value
      }
    }
  }
  return ''
}

async function toolIndexEntries (store, me) {
  const sym = (u) => store.sym(u)
  const load = async (node) => { try { await store.fetcher.load(node); return true } catch { return false } }
  const schema = (s, term) => { for (const ns of SCHEMA) { const v = store.any(s, sym(ns + term)); if (v) return v.value } return '' }
  const out = { panes: [], apps: [] }
  for (const prefs of store.each(me, sym(PIM + 'preferencesFile'), null, me.doc())) {
    if (!await load(prefs)) continue
    for (const index of store.statementsMatching(null, sym(TOOLS + 'toolIndex'), null, prefs.doc()).map(st => st.object)) {
      if (index.termType !== 'NamedNode' || !await load(index.doc())) continue
      const doc = index.doc()
      for (const reg of store.each(index, sym(TOOLS + 'registration'), null, doc)) {
        for (const cap of store.each(reg, sym(AC + 'capability'), null, doc)) {
          for (const inv of store.each(cap, sym(AC + 'invocation'), null, doc)) {
            const types = store.each(inv, sym(RDF_TYPE), null, doc).map(t => t.value)
            const name = schema(reg, 'name')
            if (types.includes(PANE_MODULE)) {
              const url = httpOnly(schema(inv, 'url'))
              if (url) out.panes.push({ name: name || url, url })
            } else if (types.includes(AC + 'UriTemplateInvocation')) {
              const template = store.any(inv, sym(HYDRA + 'template'), null, doc) || store.any(inv, sym(AC + 'template'), null, doc)
              if (!template) continue
              let variable = 'url'
              for (const m of store.each(inv, sym(HYDRA + 'mapping'), null, doc)) { const v = store.any(m, sym(HYDRA + 'variable'), null, doc); if (v) variable = v.value }
              out.apps.push({ name: name || template.value, template: template.value, variable })
            }
          }
        }
      }
    }
  }
  return out
}
const appAddress = (app, resource) => { const filled = app.template.split('{' + app.variable + '}').join(encodeURIComponent(resource)); return filled.includes('{') ? '' : httpOnly(filled) }

// ---- the pane --------------------------------------------------------------------------------------------------
const shell = {
  name: SHELL_NAME,
  icon: ICON,
  // The browser (~/ideas/dynamic, 22 Nov 2026): frame: drawn for every subject, with the pane it would otherwise
  // have chosen in context.framedPane and a failed load in context.loadError; chrome 'none': its own bar is hidden,
  // so the suite's header is the only top bar. Older browsers ignore both.
  frame: true,
  chrome: 'none',
  label (subject) { return subject && subject.termType === 'NamedNode' && /^https?:/.test(subject.uri) ? 'Commons' : null },
  shouldGetFocus (subject) { return !!shell.label(subject) },

  render (subject, context) {
    const dom = context.dom
    const win = dom.defaultView || globalThis
    const store = context.session.store
    const registry = registryOf(context)
    const outliner = () => context.getOutliner(dom)
    const root = el(dom, 'div', 'sh suite-shell-pane sh-root', null, { 'data-nav': 'closed', 'data-details': 'closed' })
    root.appendChild(el(dom, 'style', null, CSS))
    const me = currentUser(context)
    root.dataset.loggedIn = me ? 'yes' : 'no'

    // ---- header bar
    const top = root.appendChild(el(dom, 'div', 'sh-top'))
    const header = top.appendChild(el(dom, 'header', 'sh-header', null, { role: 'banner' }))
    const launchBtn = header.appendChild(el(dom, 'button', 'sh-header-btn sh-launch-btn', null, { type: 'button', 'aria-label': 'Apps', title: 'Apps', 'aria-haspopup': 'true', 'aria-expanded': 'false' }))
    launchBtn.appendChild(icon(dom, 'apps'))
    header.appendChild(el(dom, 'span', 'sh-wordmark', 'Commons'))
    const appsRow = header.appendChild(el(dom, 'nav', 'sh-header-apps', null, { 'aria-label': 'Apps' }))
    const appName = header.appendChild(el(dom, 'span', 'sh-header-app'))
    header.appendChild(el(dom, 'span', 'sh-header-spacer'))
    const searchForm = header.appendChild(el(dom, 'form', 'sh-header-search', null, { role: 'search' }))
    searchForm.appendChild(icon(dom, 'search'))
    const searchInput = searchForm.appendChild(el(dom, 'input', null, null, { type: 'search', placeholder: 'Search', 'aria-label': 'Search', autocomplete: 'off', enterkeyhint: 'search' }))
    let accountBtn
    if (me) {
      accountBtn = header.appendChild(el(dom, 'button', 'sh-header-btn sh-account-btn', null, { type: 'button', 'aria-label': 'Your account', title: 'Your account', 'aria-haspopup': 'true', 'aria-expanded': 'false' }))
    } else {
      accountBtn = header.appendChild(el(dom, 'button', 'sh-header-btn sh-login', null, { type: 'button', title: 'Log in' }))
      accountBtn.appendChild(icon(dom, 'login'))
      accountBtn.appendChild(el(dom, 'span', null, 'Log in'))
    }
    const launcher = top.appendChild(el(dom, 'div', 'sh-popover sh-launcher', null, { role: 'dialog', 'aria-label': 'Apps', hidden: true }))
    const accountMenu = top.appendChild(el(dom, 'div', 'sh-popover sh-account', null, { role: 'menu', 'aria-label': 'Your account', hidden: true }))

    // ---- app frame
    const body = root.appendChild(el(dom, 'div', 'sh-body'))
    const navCol = body.appendChild(el(dom, 'nav', 'sh-navcol', null, { 'aria-label': 'App navigation', hidden: true }))
    const main = body.appendChild(el(dom, 'main', 'sh-main'))
    const bar = main.appendChild(el(dom, 'div', 'sh-bar'))
    const navToggle = bar.appendChild(el(dom, 'button', 'sh-btn sh-btn-icon sh-nav-toggle', null, { type: 'button', 'aria-label': 'Show navigation', title: 'Navigation', hidden: true, 'aria-expanded': 'false' }))
    navToggle.appendChild(icon(dom, 'menu'))
    const barTitle = bar.appendChild(el(dom, 'span', 'sh-bar-title'))
    const viewsBtn = bar.appendChild(el(dom, 'button', 'sh-btn sh-btn-icon sh-views-btn', null, { type: 'button', 'aria-label': 'Other views', title: 'Other views', hidden: true, 'aria-haspopup': 'true', 'aria-expanded': 'false' }))
    viewsBtn.appendChild(icon(dom, 'views'))
    const detailsBtn = bar.appendChild(el(dom, 'button', 'sh-btn sh-btn-icon sh-details-btn', null, { type: 'button', 'aria-label': 'Details', title: 'Details', hidden: true, 'aria-expanded': 'false' }))
    detailsBtn.appendChild(icon(dom, 'info'))
    const viewsMenu = main.appendChild(el(dom, 'div', 'sh-popover sh-views', null, { role: 'menu', 'aria-label': 'Other views', hidden: true }))
    const content = main.appendChild(el(dom, 'div', 'sh-content'))
    content.appendChild(el(dom, 'p', 'sh-loading', 'Loading…'))
    const detCol = body.appendChild(el(dom, 'aside', 'sh-detcol', null, { 'aria-label': 'Details', hidden: true }))
    const scrim = body.appendChild(el(dom, 'div', 'sh-scrim'))
    const toasts = root.appendChild(el(dom, 'div', 'sh-toasts', null, { 'aria-live': 'polite' }))

    // ---- popovers: one open at a time; outside click and Escape close
    const popovers = [[launcher, launchBtn], [accountMenu, accountBtn], [viewsMenu, viewsBtn]]
    const closePopovers = () => { for (const [p, b] of popovers) { p.hidden = true; b.setAttribute('aria-expanded', 'false') } }
    const toggle = (pop, btn) => { const open = pop.hidden; closePopovers(); pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) { const first = pop.querySelector('button, a'); if (first) first.focus() } }
    const onDocClick = (event) => {
      if (!root.isConnected) { dom.removeEventListener('click', onDocClick, true); dom.removeEventListener('keydown', onKey); return }
      if (!popovers.some(([p, b]) => p.contains(event.target) || b.contains(event.target))) closePopovers()
    }
    // Escape: the shell acts last (document, bubble phase), so a pane's own modal or menu closes first. It does
    // nothing when the event was already handled (defaultPrevented, or propagation stopped so it never gets here),
    // or when it comes from inside a pane's open modal or menu ([aria-modal="true"], role menu/listbox/dialog).
    // Then: its own popover, else the details column, else the navigation drawer. (Rule in design/DESIGN.md.)
    const onKey = (event) => {
      if (!root.isConnected || event.key !== 'Escape' || event.defaultPrevented) return
      const open = popovers.find(([p]) => !p.hidden)
      if (open) { closePopovers(); open[1].focus(); return }
      const from = event.target && event.target.closest ? event.target : null
      if (from && from.closest('[aria-modal="true"], [role="menu"], [role="listbox"], [role="dialog"]')) return
      if ([...content.querySelectorAll('[aria-modal="true"]'), ...detCol.querySelectorAll('[aria-modal="true"]')].some(m => m.getClientRects().length)) return
      if (root.dataset.details === 'open') { suite.closeDetails(); detailsBtn.focus() } else if (root.dataset.nav === 'open' && narrow('900')) { setNav(false); navToggle.focus() }
    }
    dom.addEventListener('click', onDocClick, true)
    dom.addEventListener('keydown', onKey)
    launchBtn.addEventListener('click', () => toggle(launcher, launchBtn))
    viewsBtn.addEventListener('click', () => toggle(viewsMenu, viewsBtn))
    if (me) accountBtn.addEventListener('click', () => toggle(accountMenu, accountBtn))
    else accountBtn.addEventListener('click', () => logIn())

    // ---- the browser asks about a pane in a box above the outline: step aside while it is open
    const ask = dom.getElementById('browseAsk')
    if (ask && win.MutationObserver) {
      const follow = () => root.classList.toggle('sh-paused', !ask.hidden)
      new win.MutationObserver(follow).observe(ask, { attributes: true, attributeFilter: ['hidden'] })
      follow()
    }

    // ---- toasts
    // A toast lives in module state until it times out, so one raised just before suite.go() (or any re-render)
    // is drawn again in the new frame for the time it has left.
    function drawToast (entry) {
      const { text, kind } = entry
      const t = el(dom, 'div', 'sh-toast' + (kind === 'error' ? ' sh-toast-error' : kind === 'success' ? ' sh-toast-success' : ''), null, { role: kind === 'error' ? 'alert' : 'status' })
      t.appendChild(el(dom, 'span', null, String(text)))
      toasts.appendChild(t)
      if (entry.until) setTimeout(() => t.remove(), Math.max(0, entry.until - Date.now()))
      return t
    }
    function toast (text, { kind = 'info', timeout = 4000 } = {}) {
      const entry = { text: String(text), kind, until: timeout ? Date.now() + timeout : 0 }
      if (entry.until) {
        state.toasts = state.toasts.filter(e => e.until > Date.now())
        state.toasts.push(entry)
        setTimeout(() => { state.toasts = state.toasts.filter(e => e !== entry) }, timeout)
      }
      return drawToast(entry)
    }
    for (const entry of state.toasts) if (entry.until > Date.now() + 300) drawToast(entry)

    // ---- navigation column and details column
    const narrow = (px) => !!(win.matchMedia && win.matchMedia(`(max-width: ${px}px)`).matches)
    function setNav (open) {
      root.dataset.nav = open ? 'open' : 'closed'
      navCol.hidden = !open
      navToggle.setAttribute('aria-expanded', String(open))
      navToggle.setAttribute('aria-label', open ? 'Hide navigation' : 'Show navigation')
    }
    navToggle.addEventListener('click', () => setNav(root.dataset.nav !== 'open'))
    // Crossing the drawer breakpoint: narrowing closes the drawer (so the first press of the toggle opens it);
    // widening shows the column again when the app has one.
    if (win.matchMedia) {
      const drawer = win.matchMedia('(max-width: 900px)')
      const follow = () => {
        if (!root.isConnected && root.dataset.ready) { drawer.removeEventListener('change', follow); return }
        if (navToggle.hidden) return
        setNav(!drawer.matches)
      }
      drawer.addEventListener('change', follow)
    }
    // On a narrow screen the column is a drawer: following a link or button in it closes it.
    navCol.addEventListener('click', (event) => { if (narrow('900') && event.target.closest && event.target.closest('a, button')) setTimeout(() => setNav(false), 0) })
    scrim.addEventListener('click', () => { if (root.dataset.details === 'open') suite.closeDetails(); else setNav(false) })

    let showing = null // { pane, ctx, onDetailsClose }
    const suite = {
      version: CONTRACT,
      shell: SHELL_NAME,
      subject,
      app: null,
      state: {},
      query: '',
      go (target, options = {}) {
        const uri = typeof target === 'string' ? target : target && target.uri
        if (!httpOnly(uri)) return
        if (options.pane) state.wanted = { uri, name: options.pane }
        if (sameThing(uri, subject.uri)) { mountFor(subject); return }
        outliner().GotoSubject(store.sym(uri), true, shell, true, undefined)
      },
      showDetails (node, { onClose } = {}) {
        if (!showing || typeof showing.pane.renderDetails !== 'function') return null
        let inner = null
        try { inner = showing.pane.renderDetails(node, showing.ctx) } catch (error) { console.warn('[suite] renderDetails failed', error); toast('The details could not be shown.', { kind: 'error' }) }
        if (showing.onDetailsClose) { const f = showing.onDetailsClose; showing.onDetailsClose = null; try { f() } catch {} }
        if (!inner) { suite.closeDetails(); return null }
        detCol.replaceChildren()
        const close = detCol.appendChild(el(dom, 'button', 'sh-btn sh-btn-icon sh-details-close', null, { type: 'button', 'aria-label': 'Close details', title: 'Close' }))
        close.appendChild(icon(dom, 'close'))
        close.addEventListener('click', () => suite.closeDetails())
        detCol.appendChild(inner)
        detCol.hidden = false
        root.dataset.details = 'open'
        detailsBtn.setAttribute('aria-expanded', 'true')
        showing.onDetailsClose = onClose || null
        return inner
      },
      closeDetails () {
        detCol.hidden = true
        detCol.replaceChildren()
        root.dataset.details = 'closed'
        detailsBtn.setAttribute('aria-expanded', 'false')
        if (showing && showing.onDetailsClose) { const f = showing.onDetailsClose; showing.onDetailsClose = null; try { f() } catch {} }
      },
      refreshNavigation () { if (showing) fillNavigation(showing.pane, showing.ctx) },
      toast (text, options) { return toast(text, options) }
    }
    detailsBtn.addEventListener('click', () => { if (root.dataset.details === 'open') suite.closeDetails(); else suite.showDetails(subject) })
    root.suiteApi = suite // the same object panes get as context.suite; for tests and the console

    function fillNavigation (pane, ctx) {
      let nav = null
      if (typeof pane.renderNavigation === 'function') {
        try { nav = pane.renderNavigation(subject, ctx) } catch (error) { console.warn('[suite] renderNavigation failed', error) }
      }
      navCol.replaceChildren()
      if (nav) navCol.appendChild(nav)
      navToggle.hidden = !nav
      setNav(!!nav && !narrow('900'))
    }

    // ---- which pane draws the content
    const safeLabel = (pane, node) => { try { return pane.label(node, context) } catch { return null } }
    const suiteNames = new Set(SUITE_APPS.map(a => a.pane))
    function relevantPanes () {
      const seen = new Set()
      const list = [...registry.list.map(p => (p && state.own.get(p.name)) || p), ...state.own.values()].filter(p => p && !seen.has(p) && seen.add(p))
      return list.filter(p => p.name !== SHELL_NAME && !p.global && safeLabel(p, subject))
    }
    function choose (relevant) {
      const w = state.wanted
      if (w && sameThing(w.uri, subject.uri)) {
        const forced = relevant.find(p => p.name === w.name) || ownPane(registry, w.name)
        if (forced) return forced
      }
      const focus = (p) => { try { return !!(p.shouldGetFocus && p.shouldGetFocus(subject, context)) } catch { return false } }
      // Suite panes in SUITE_APPS order (not the order their files happened to load in), then the rest as listed.
      const rank = (p) => { const i = SUITE_APPS.findIndex(a => a.pane === p.name); return i < 0 ? SUITE_APPS.length : i }
      const ours = relevant.filter(p => suiteNames.has(p.name)).sort((a, b) => rank(a) - rank(b))
      return ours.find(focus) || relevant.find(focus) ||
        ours.find(p => !appOf(p).viewer) || ours[0] || relevant[0] || null
    }
    const appOf = (pane) => pane && SUITE_APPS.find(a => a.pane === pane.name)

    function setCurrentApp (app, pane) {
      const label = app ? app.name : pane ? (safeLabel(pane, subject) || pane.name) : ''
      appName.textContent = label
      suite.app = app ? { id: app.id, name: app.name } : null
      root.dataset.app = app ? app.id : ''
      for (const b of appsRow.querySelectorAll('[data-app]')) { if (app && b.dataset.app === app.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') }
      for (const b of launcher.querySelectorAll('[data-app]')) { if (app && b.dataset.app === app.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') }
    }

    function emptyState (title, text, action, iconName) {
      const box = el(dom, 'div', 'sh-empty')
      const ic = box.appendChild(el(dom, 'span', 'sh-empty-icon'))
      ic.appendChild(icon(dom, iconName || 'alert'))
      box.appendChild(el(dom, 'h2', 'sh-empty-title', title))
      if (text) box.appendChild(el(dom, 'p', 'sh-empty-text', text))
      if (action && action.label) {
        const b = box.appendChild(el(dom, 'button', 'sh-btn sh-btn-primary', action.label, { type: 'button' }))
        b.addEventListener('click', action.run)
      }
      return box
    }

    function mount (pane) {
      closePopovers()
      suite.closeDetails()
      const app = appOf(pane)
      setCurrentApp(app, pane)
      suite.state = {}
      const ctx = Object.assign({}, context, { suite })
      showing = { pane, ctx, onDetailsClose: null }
      barTitle.textContent = subject.uri
      let inner
      try {
        inner = pane.render(subject, ctx)
      } catch (error) {
        console.warn('[suite] render failed', error)
        inner = emptyState('This could not be shown', (pane.name || 'The pane') + ' stopped with an error: ' + (error && error.message ? error.message : error))
      }
      content.replaceChildren(inner || emptyState('Nothing to show', ''))
      fillNavigation(pane, ctx)
      detailsBtn.hidden = typeof pane.renderDetails !== 'function'
      main.scrollTop = 0
      // Other views of the same thing: every other pane that says it can show it.
      const others = relevantPanes().sort((a, b) => (suiteNames.has(b.name) ? 1 : 0) - (suiteNames.has(a.name) ? 1 : 0))
      viewsMenu.replaceChildren()
      const list = viewsMenu.appendChild(el(dom, 'ul', 'sh-menu'))
      for (const p of others) {
        const li = list.appendChild(el(dom, 'li'))
        const a = appOf(p)
        const b = li.appendChild(el(dom, 'button', 'sh-menu-item', null, { type: 'button', role: 'menuitemradio', 'aria-checked': String(p === pane), 'data-pane': p.name }))
        b.appendChild(a ? icon(dom, a.icon) : icon(dom, 'pane'))
        b.appendChild(el(dom, 'span', 'sh-nav-label', (safeLabel(p, subject) || p.name) + (a && !a.viewer ? ' · ' + a.name : '')))
        b.addEventListener('click', () => { state.wanted = { uri: subject.uri, name: p.name }; mount(p) })
      }
      viewsBtn.hidden = others.length < 2
    }

    function mountEmpty (app, title, text, action) {
      closePopovers()
      suite.closeDetails()
      setCurrentApp(app, null)
      showing = null
      barTitle.textContent = ''
      content.replaceChildren(emptyState(title, text, action, app ? app.icon : 'alert'))
      navCol.replaceChildren(); navToggle.hidden = true; setNav(false)
      detailsBtn.hidden = true; viewsBtn.hidden = true
    }

    function mountFor () {
      const failed = context.loadError
      if (failed && !(state.wanted && sameThing(state.wanted.uri, subject.uri))) {
        const status = failed.status
        if (status === 401 && !currentUser(context)) { mountEmpty(null, 'This is private', 'Log in to see ' + subject.uri + '.', { label: 'Log in', icon: 'login', run: () => logIn() }); return }
        if (status === 401 || status === 403) { mountEmpty(null, 'You do not have access', 'Your account may not open ' + subject.uri + '. Ask its owner to share it with you.'); return }
        if (status === 404) { mountEmpty(null, 'Not found', 'Nothing is at ' + subject.uri + '.', { label: 'Open Files', icon: 'folder', run: () => openApp(SUITE_APPS.find(a => a.id === 'files')) }); return }
        mountEmpty(null, 'This could not be loaded', (failed.message || 'The server did not answer') + ' (' + subject.uri + ')')
        return
      }
      const relevant = relevantPanes()
      const framed = context.framedPane && context.framedPane.name !== SHELL_NAME ? context.framedPane : null
      const pane = choose(relevant) || framed
      const w = state.wanted
      if (w && sameThing(w.uri, subject.uri) && pane && pane.name === w.name && !safeLabel(pane, subject)) {
        const app = appOf(pane)
        mountEmpty(app, (app ? app.name : pane.name) + ' has nothing to show here', 'It does not open ' + subject.uri + '.', { label: 'Show it as usual', icon: app ? app.icon : 'pane', run: () => { state.wanted = null; mountFor() } })
        return
      }
      if (!pane) { mountEmpty(null, 'Nothing can show this', 'No app or pane opens ' + subject.uri + '.'); return }
      mount(pane)
    }

    // ---- opening an app from the launcher
    async function startOf (app) {
      const who = currentUser(context)
      if (!who) return ''
      const key = who.uri + ' ' + app.id
      if (state.starts.has(key)) return state.starts.get(key)
      let uri = ''
      if (app.start === 'webid') uri = who.uri
      else if (app.start === 'root') uri = (state.person && state.person.webid === who.uri ? state.person : await readPerson(store, who)).root
      else if (Array.isArray(app.start)) uri = await typeIndexInstances(store, who, app.start)
      if (uri) state.starts.set(key, uri)
      return uri
    }
    async function openApp (app) {
      closePopovers()
      if (!currentUser(context)) {
        mountEmpty(app, 'Log in to open ' + app.name, app.name + ' shows what is on your pod, so it needs to know who you are.', { label: 'Log in', icon: 'login', run: () => logIn() })
        return
      }
      const uri = await startOf(app)
      if (!uri) {
        mountEmpty(app, 'No ' + app.name.toLowerCase() + ' yet', 'Nothing in your type indexes is for ' + app.name + '. Open one from Files, and it opens here.', { label: 'Open Files', icon: 'folder', run: () => openApp(SUITE_APPS.find(a => a.id === 'files')) })
        return
      }
      suite.go(uri, { pane: app.pane })
    }

    function appTile (app, tag = 'button') {
      const b = el(dom, tag, 'sh-launcher-tile', null, { type: tag === 'button' ? 'button' : null, 'data-app': app.id })
      const badge = b.appendChild(el(dom, 'span', 'sh-launcher-badge'))
      badge.appendChild(icon(dom, app.icon))
      b.appendChild(el(dom, 'span', null, app.name))
      b.addEventListener('click', () => openApp(app))
      return b
    }
    function fillLauncher (tools) {
      launcher.replaceChildren()
      const sec = launcher.appendChild(el(dom, 'section', 'sh-launcher-section'))
      sec.appendChild(el(dom, 'h2', 'sh-caption', 'Apps'))
      const grid = sec.appendChild(el(dom, 'ul', 'sh-launcher-grid'))
      for (const app of SUITE_APPS.filter(a => !a.menu && !a.viewer)) grid.appendChild(el(dom, 'li')).appendChild(appTile(app))
      if (tools && (tools.panes.length || tools.apps.length)) {
        const sec2 = launcher.appendChild(el(dom, 'section', 'sh-launcher-section sh-tools'))
        sec2.appendChild(el(dom, 'h2', 'sh-caption', 'From your tool index'))
        const grid2 = sec2.appendChild(el(dom, 'ul', 'sh-launcher-grid'))
        for (const entry of tools.panes) {
          const b = grid2.appendChild(el(dom, 'li')).appendChild(el(dom, 'button', 'sh-launcher-tile', null, { type: 'button', 'data-tool-pane': entry.url }))
          const badge = b.appendChild(el(dom, 'span', 'sh-launcher-badge sh-alt'))
          badge.appendChild(icon(dom, 'pane'))
          b.appendChild(el(dom, 'span', null, entry.name))
          b.addEventListener('click', () => openToolPane(entry))
        }
        for (const app of tools.apps) {
          const address = appAddress(app, subject.uri)
          if (!address) continue
          const a = grid2.appendChild(el(dom, 'li')).appendChild(el(dom, 'a', 'sh-launcher-tile', null, { href: address, target: '_blank', rel: 'noopener noreferrer', 'data-tool-app': app.name, title: 'Open this in ' + app.name + ' (a new tab)' }))
          const badge = a.appendChild(el(dom, 'span', 'sh-launcher-badge sh-alt'))
          badge.appendChild(icon(dom, 'openNew'))
          a.appendChild(el(dom, 'span', null, app.name))
        }
      }
      setCurrentApp(suite.app && SUITE_APPS.find(a => a.id === suite.app.id), showing && showing.pane)
    }
    // A pane from the tool index: the browser has loaded it already when its site is allowed. Show what is on
    // show with it, if it can; otherwise say so. (A pane the browser has not loaded is not run from here.)
    // A tool-index pane's module, only from the page's own site or a site the browser was told to allow (the
    // browser has usually imported it already, so this is the same module, not a second run).
    async function trustedModule (address) {
      try {
        const url = new URL(address)
        const allowed = (() => { try { return JSON.parse(win.localStorage.getItem(ALLOWED)) || [] } catch { return [] } })()
        if (url.origin === win.location.origin || allowed.includes(url.origin)) return (await import(url.href)).default || null
      } catch { /* not loaded */ }
      return null
    }
    // The tool index may list another copy of a suite app (the published notes pane, say): no second tile for it.
    async function withoutSuiteCopies (tools) {
      const own = new Set(SUITE_APPS.map(paneUrl))
      const keep = []
      for (const entry of tools.panes) {
        if (own.has(entry.url)) continue
        const pane = await trustedModule(entry.url)
        if (pane && suiteNames.has(pane.name)) continue
        keep.push(entry)
      }
      return { panes: keep, apps: tools.apps }
    }
    async function openToolPane (entry) {
      closePopovers()
      const pane = await trustedModule(entry.url)
      if (!pane || !pane.name) { toast(entry.name + ' is not loaded: allow its site in the browser first.', { kind: 'error' }); return }
      const live = ownPane(registry, pane.name) || pane
      if (!safeLabel(live, subject)) { toast(entry.name + ' has nothing to show for this.'); return }
      state.wanted = { uri: subject.uri, name: live.name }
      mount(live)
    }
    function fillHeaderApps () {
      appsRow.replaceChildren()
      for (const app of SUITE_APPS.filter(a => !a.menu && !a.viewer)) {
        const b = appsRow.appendChild(el(dom, 'button', 'sh-header-btn', null, { type: 'button', 'data-app': app.id, 'aria-label': app.name, title: app.name }))
        b.appendChild(icon(dom, app.icon))
        b.addEventListener('click', () => openApp(app))
      }
    }

    // ---- the avatar menu
    function avatar (person, cls = 'sh-avatar') {
      const initials = (person.name || person.webid.replace(/^https?:\/\/(www\.)?/, '')).split(/[\s.@/-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('')
      if (person.photo) {
        const img = el(dom, 'img', cls, null, { src: person.photo, alt: '' })
        img.addEventListener('error', () => img.replaceWith(el(dom, 'span', cls, initials || '?', { 'aria-hidden': 'true' })))
        return img
      }
      return el(dom, 'span', cls, initials || '?', { 'aria-hidden': 'true' })
    }
    function fillAccount (person) {
      accountBtn.replaceChildren(avatar(person))
      accountMenu.replaceChildren()
      const head = accountMenu.appendChild(el(dom, 'div', 'sh-menu-head'))
      head.appendChild(avatar(person))
      const who = head.appendChild(el(dom, 'div', 'sh-who'))
      who.appendChild(el(dom, 'b', null, person.name || 'You'))
      who.appendChild(el(dom, 'span', null, person.webid, { title: person.webid }))
      const list = accountMenu.appendChild(el(dom, 'ul', 'sh-menu'))
      const item = (name, label, run, data) => {
        const b = list.appendChild(el(dom, 'li', null, null, { role: 'none' })).appendChild(el(dom, 'button', 'sh-menu-item', null, { type: 'button', role: 'menuitem', 'data-action': data }))
        b.appendChild(icon(dom, name))
        b.appendChild(el(dom, 'span', null, label))
        b.addEventListener('click', run)
      }
      for (const app of SUITE_APPS.filter(a => a.menu)) item(app.icon, app.name, () => openApp(app), app.id)
      item('logout', 'Log out', () => logOut(), 'logout')
    }

    async function logOut () {
      closePopovers()
      const authn = globalThis.SolidLogic && globalThis.SolidLogic.authn
      const browser = globalThis.mashlib
      try {
        if (browser && typeof browser.logout === 'function') await browser.logout() // the browser's own: reloads the page
        else if (authn && typeof authn.logout === 'function') await authn.logout()
        else if (authn && authn.authSession && typeof authn.authSession.logout === 'function') await authn.authSession.logout()
        else throw new Error('no log out here')
        state.starts.clear(); state.person = null
      } catch (error) {
        toast('Could not log out: ' + (error && error.message ? error.message : error), { kind: 'error' })
      }
    }
    // Logging in is the browser's: its public mashlib.login() (the issuer dialog, then the IdP), or in an older
    // browser, press its own button (top right of the page).
    function logIn () {
      const browser = globalThis.mashlib
      if (browser && typeof browser.login === 'function') {
        Promise.resolve().then(() => browser.login()).catch(error => toast('Could not log in: ' + (error && error.message ? error.message : error), { kind: 'error' }))
        return
      }
      const deep = (sel, node = dom) => { const f = node.querySelector(sel); if (f) return f; for (const e of node.querySelectorAll('*')) if (e.shadowRoot) { const g = deep(sel, e.shadowRoot); if (g) return g } return null }
      try {
        const account = deep('solid-ui-account')
        const button = account && account.shadowRoot && account.shadowRoot.querySelector('solid-ui-login-button solid-ui-button')
        const inner = button && button.shadowRoot && button.shadowRoot.querySelector('button')
        if (inner) { inner.click(); return }
      } catch { /* fall through */ }
      toast('Use the Log in button at the top right of the page.')
    }

    // ---- search box: as you type, the pod-wide search (../search/search-pane.js, loaded on first use) shows its
    // dropdown and the app may filter in place (pane.search); Enter opens an address, or else the search page
    // (suite-search, in SUITE_APPS) on the pod root with the words kept in the box.
    let finder = null
    const findIn = () => finder || (finder = import(new URL('../search/search-pane.js', import.meta.url).href)
      .then(m => m.default.headerSearch({ input: searchInput, form: searchForm, context, suite }))
      .catch(error => { console.warn('[suite] search not loaded', error); return null }))
    let typing = 0
    searchInput.addEventListener('input', () => {
      const mine = ++typing
      setTimeout(() => {
        if (mine !== typing) return
        suite.query = searchInput.value
        findIn().then(f => { if (f && mine === typing) f.query(suite.query) })
        root.dispatchEvent(new win.CustomEvent('suite-search', { bubbles: true, detail: { query: suite.query, submit: false } }))
        if (showing && typeof showing.pane.search === 'function') { try { showing.pane.search(suite.query, showing.ctx) } catch (error) { console.warn('[suite] search failed', error) } }
      }, 250)
    })
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault()
      const q = searchInput.value.trim()
      suite.query = q
      if (!q) return
      const ev = new win.CustomEvent('suite-search', { bubbles: true, cancelable: true, detail: { query: q, submit: true } })
      if (!root.dispatchEvent(ev)) return
      if (/^https?:\/\/\S+$/i.test(q)) { suite.go(q); return }
      if (showing && showing.pane.name === 'suite-search') return // the search page already filters from the box
      if (ownPane(registry, 'suite-search')) {
        const folder = (state.person && state.person.webid === (me && me.uri) && state.person.root) || (subject.uri.endsWith('/') ? subject.uri : new URL('.', subject.uri).href)
        state.carryQuery = q
        suite.go(folder, { pane: 'suite-search' })
        return
      }
      if (showing && typeof showing.pane.search === 'function') return
      toast('Search is not loaded. Paste an address to open it.')
    })

    // Enter opened the search app: the new frame's box keeps the words, and the search page reads suite.query.
    if (state.carryQuery) { searchInput.value = state.carryQuery; suite.query = state.carryQuery; state.carryQuery = '' }

    // ---- start: load the suite's panes and the person, then draw
    fillHeaderApps()
    fillLauncher(null)
    ;(async () => {
      if (!state.loaded) state.loaded = loadSuitePanes(registry)
      await state.loaded
      if (!root.isConnected && !dom.contains(root)) { /* not on the page yet: draw anyway, the outliner inserts it */ }
      mountFor()
      if (me) {
        try {
          if (!state.person || state.person.webid !== me.uri) state.person = await readPerson(store, me)
          fillAccount(state.person)
        } catch { fillAccount({ webid: me.uri, name: '', photo: '' }) }
        try { fillLauncher(await withoutSuiteCopies(await toolIndexEntries(store, me))) } catch { /* no tool index: the suite's apps only */ }
      }
      root.dataset.ready = 'yes'
    })()

    return root
  }
}

export default shell

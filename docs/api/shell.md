# API: `js/ui/shell.js` → `DSL.ui.shell` and `js/app.js` (owner: design-system)

The shell is the page chrome: a sticky glass top bar (brand, section navigation with scrollspy and a
sliding indicator, theme toggle, «Menú» sheet on phones) and the footer with credits. Styles live in
`css/shell.css` (layer `shell`, prefix `sh-`); landmarks (`.app-header`, `.app-main`, `.app-section`,
`.skip-link`, `.app-error`) are in `css/base.css`. `app.js` boots the page. Components are in [`ui.md`](ui.md).

Tests: `tests/unit/ui.test.mjs` (fake DOM) and `tests/e2e/shell.spec.mjs` (Chromium on
`tests/pages/ui-kitchen-sink.html`, plus one check on `index.html`).

## `DSL.ui.shell`

| Member | Description |
|---|---|
| `mountHeader(el) → { destroy() }` | `el` is `<header class="app-header" data-mount="shell-header">`. Builds the bar, appends the «Menú» sheet and its scrim to `<body>` (outside the bar's glass), starts the scrollspy and the top sentinel, and listens to the bus. Throws if a header is already mounted. |
| `mountFooter(el) → { destroy() }` | `el` is `<footer class="app-footer" data-mount="shell-footer">`. Name with the brand mark, a note on offline use, «Créditos» and «Volver al inicio». Chart.js and KaTeX versions are read from `window.Chart.version` / `window.katex.version` when loaded. |
| `scrollTo(id, { focus = false, instant = false }) → boolean` | Scrolls to `#id` (smooth; instant with reduced motion or `instant`), leaving the section under the bar (`scroll-margin-top: var(--header-h)` on `.app-section`, kept while the section is focused). Updates the hash with `history.replaceState`. With `focus`, gives the section `tabindex="-1"` and focuses it with `preventScroll`. Then it **settles** the target (see below). Returns `false` if the id does not exist. |
| `active() → string \| null` | Section chosen by the scrollspy (`'inicio'`, `'conceptos'`, …), or `null` before the first measure. |
| `menu.open()`, `menu.close({ restoreFocus = true })`, `menu.isOpen()` | Programmatic control of the phone sheet. |
| `SECTIONS` | `[{ id, label, nav }]` in navigation order: inicio (brand only, `nav: false`), conceptos «Conceptos», modelado «Modelado», galeria «Galería», transferencia «Función de transferencia». |
| `helpers.pickActive(ids, visibleMap)` | Pure: the last id, in document order, whose section crosses the top band. |

### Behaviour

- **Bar**: `.sh-bar` holds `a.sh-brand[href="#inicio"]` (mark: s-plane axes, a conjugate pole pair ×
  and a zero ○; wordmark «Laboratorio de» «Sistemas Dinámicos» in Bricolage), `nav.sh-nav[aria-label="Secciones"]`
  with 4 links `a.sh-link[data-section]`, the theme button and the menu button.
- **Transparent at the top**: a sentinel before the content toggles `.is-at-top` on the header. At the top
  the bar has no fill and no blur; once the page scrolls it becomes tier-A glass (14 px blur).
- **Scrollspy**: one IntersectionObserver over the five sections with root margin
  `-(header height + 1)px 0 -55% 0`. The active link gets `aria-current="true"` (the sheet link too) and
  `section:change { id }` is emitted. «Inicio» has no bar link, so no link is current there.
- **Indicator**: `.sh-indicator` (2 px accent bar on the bar's bottom edge) slides with `transform`
  (`--ind-x`, `--ind-s`) under the text of the current link; it is measured again on resize and when fonts load.
  In forced colours it is painted in `Highlight` (and the current sheet link gets a `Highlight` left border).
- **Very narrow phones (below 390 px)**: «Menú» stays as the button's accessible name but is visually hidden
  (a 44 × 44 icon button), the wordmark may shrink (down to 13 px), and the footer becomes a single column whose
  children have `min-width: 0` and `overflow-wrap: anywhere`. From 390 px up nothing changes.
- **Settle (integrator)**: sections initialise lazily and grow by several hundred pixels while the page
  scrolls past them, so a scroll to `#galeria` could end far from it. After the scroll ends (`scrollend`, or a
  timeout without it) the target is re-aligned (up to 4 times); then, for 1.5 s, every document size change
  (and a 200 ms check) re-aligns it instantly. Any wheel, touch, key or pointer gesture, or any scroll the
  shell did not make, cancels it. If focus moved inside the section (concepts:open focuses a card and scrolls
  to it), it does not pull the page back up to the section's top.
- **Header state on jumps**: `scrollTo()` removes `.is-at-top` **before** it scrolls when the destination is
  more than 8 px down (the sentinel's observer would report one or two frames late, with the page already
  moved). The sentinel (8 px tall) keeps deciding for ordinary scrolling and for jumps back to the top.
- **`<html data-jumping>`**: set by `scrollTo()` and kept while the jump and its settle run (removed when
  the settle ends or is cancelled). `css/components.css` shows every `.ds-reveal` in its final state with no
  transition meanwhile, so a jump never lands on blank, half-faded cards. When the attribute is removed, the
  `.ds-reveal` elements in view are marked `is-revealed` (they do not fade out and in again).
- **Reading position on width changes**: while the visitor scrolls, the shell records the topmost section
  whose bottom is below the bar and how far into it the bar's bottom edge is (a fraction of its height). When
  the **width** changes (a height-only resize, such as a phone's toolbar, is ignored), it restores that
  position after layout (double rAF) and once more 450 ms later, after lazy growth. It does nothing while a
  settle is running, while the «Menú» sheet is open, before the first scroll, or after a wheel, touch, key or
  pointer gesture during the resize.
- **Initial hash**: when the page loads with `#conceptos`, `#modelado`, `#galeria` or `#transferencia`, the
  shell calls `scrollTo(id, { instant: true })` after `load`, so the section ends under the bar even though
  the sections above grow after the browser's own jump.
- **Anchors**: any click on `a[href="#<section id>"]` anywhere in the page (bar, sheet, footer, section
  calls to action) is handled by `scrollTo(id, { focus: true })`. Modified clicks and other anchors are
  left to the browser. The skip link («Saltar al contenido» → `#contenido`) is the first Tab stop.
- **Theme**: `.sh-theme` is an icon button named «Tema claro» or «Tema oscuro» (`aria-label` and
  `data-tip`, `data-mode`). It calls `DSL.prefs.toggleTheme()` (which persists `dsl.v1.theme` inside
  try/catch and emits `theme:change`), inside `document.startViewTransition` when available and motion is
  allowed (a 260 ms crossfade; the bar is excluded). Rejected transition promises are caught.
- **Menu sheet** (below 768 px the nav hides and «Menú» shows): `div.sh-sheet[role="dialog"][aria-modal="true"][aria-label="Menú"]`.
  Opening sets `aria-expanded`, names the button «Cerrar menú», makes `.app-main` and `.app-footer`
  `inert`, locks scrolling (`html.sh-lock`) and focuses the current link (or the first). Tab and
  Shift+Tab cycle between the menu button and the links. Esc, the scrim, a link or widening past the
  breakpoint close it; focus returns to the button (not after a link). The sheet reveals with `clip-path`
  and staggered items (opacity only with reduced motion).
- **Focus never under the bar**: `.app-main :focus` gets `scroll-margin-top: calc(var(--header-h) + 12px)`
  (WCAG 2.4.11). There is deliberately no `scroll-padding-top` on `<html>`: with it, focusing a control in
  the sticky bar scrolled the page half a screen each time.

### Bus

| Listens | Effect |
|---|---|
| `tf:open` | `scrollTo('transferencia', { focus: true })` |
| `gallery:open` | `scrollTo('galeria', { focus: true })` |
| `concepts:open` | `scrollTo('conceptos', { focus: true })` |
| `theme:change` | Renames the theme button. |

| Emits | Payload |
|---|---|
| `section:change` | `{ id }` |

### Test ids

`sh-brand`, `sh-nav-conceptos`, `sh-nav-modelado`, `sh-nav-galeria`, `sh-nav-transferencia`,
`sh-theme-toggle`, `sh-menu-toggle`, `sh-sheet`, `sh-sheet-<id>`, `sh-footer`, `sh-credits`, `sh-footer-top`.

## `js/app.js`

On DOM ready:

1. `DSL.ui.init(document)` (falls back to `DSL.ui.tooltips.init`); a failure here is logged and does not
   stop the boot.
2. Every `[data-mount]` in document order, each inside try/catch:
   `shell-header` / `shell-footer` → `DSL.ui.shell.mountHeader` / `mountFooter`; any other name →
   `DSL.sections[name].mount(el)`. A missing module counts as a failure.
3. A failure paints an error card in place of the part and the rest keeps loading:
   `div.app-error[role="alert"][data-testid="app-error-<name>"]` with a warning icon,
   «No se pudo cargar la parte «Galería».», the recovery hint «El resto de la página funciona. Recargue
   la página para intentarlo de nuevo.» and the technical detail. It also logs
   `console.error('[app] No se pudo montar «<name>»:', err)`.
4. `DSL.app.handles[name]` keeps each mount's return value; then `DSL.app.ready = true`,
   `<html data-ready="true">` and `app:ready { mounted, failed }`.

**First paint (`css/base.css`).** While `html.js` has no `data-ready`, `.app-header`, `.app-main` and
`.app-footer` are `visibility: hidden`: the half-built page (empty bar, section shells that grow when they
mount) is never painted, so it causes no layout shift. When `data-ready` arrives they fade in once
(`opacity` 0.01 → 1, `--dur-reveal`; no fade with reduced motion). The fade starts at 0.01, not 0: Chromium
never counts as a Largest Contentful Paint candidate what it first paints at opacity 0, so in the single
file (fonts inline, everything painted during the fade) the page would report no LCP at all. A keyframe makes them visible after 3 s if
`data-ready` never comes. Without JavaScript (`html` has no `js` class) nothing is hidden and the
`<noscript>` text shows.

Spanish part names: hero «Inicio», concepts «Conceptos», wizard «Modelado», gallery «Galería», tfengine
«Función de transferencia», shell-header «Barra superior», shell-footer «Pie de página».

## Layout hooks (`css/base.css`)

- `.app-section`: full width, `padding: var(--section-pad) var(--gutter)`, `scroll-margin-top: var(--header-h)`.
  Its `> [data-mount]` child is the container (`max-width: var(--container-max)`, centred). A section that
  needs full bleed overrides `.app-section:has(> [data-mount="…"])` in its own layer.
- Backdrop: `body::before` draws the static s-plane (axes, 160 px major and 32 px minor rulings, a soft lift)
  and `body::after` the grain, both fixed and behind the content; no runtime cost.

## Deviations from docs/ARCHITECTURE.md

- The file `js/ui/shell.js` holds the shell (architect's note); `app.js` only boots.
- The nav has 4 links; «Inicio» is reached through the brand and «Volver al inicio». The scrollspy covers
  all five sections. The third link reads «Galería» (PRODUCT_SPEC §2.4), not «Simulaciones» (SKILLS_BRIEF §2).
- Extra API: `active()`, `menu`, `SECTIONS`, `helpers`.
- The bar is transparent over the top of the page and turns to glass once scrolled.
- The theme change uses a View Transition when available.
- Content focus uses `scroll-margin-top` on focused elements instead of `scroll-padding-top` on `<html>`.

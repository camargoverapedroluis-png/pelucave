# API: `js/ui/components.js` → `DSL.ui` (owner: design-system)

The design system: tokens (`css/tokens.css`), base styles (`css/base.css`), components
(`css/components.css`, layer `components`, prefix `ds-`) and the component factories in
`js/ui/components.js`. The shell (top bar, scrollspy, menu sheet, footer) is documented in
[`shell.md`](shell.md).

- Classic script, IIFE on `window.DSL`, `'use strict'`. Load order: `ns.js` → `icons-data.js` →
  `components.js` → `shell.js` → … → `app.js`.
- Loading only defines functions. Nothing touches the DOM, timers or storage until a factory runs.
- Every factory returns real DOM nodes built with `DSL.util.h`. No `innerHTML` with user text.
- UI text is Spanish; identifiers are English. Displayed numbers use a decimal point (`DSL.util.formatNumber`).
  Inputs also accept `,` (`DSL.util.parseNumber`). A non-breaking space (U+00A0) separates number and unit.
- Tests: `tests/unit/ui.test.mjs` (fake DOM) and `tests/e2e/shell.spec.mjs` (Chromium, on
  `tests/pages/ui-kitchen-sink.html`, which shows every component in both themes).

## Factories

| Signature | Returns | Notes |
|---|---|---|
| `icon(name, { size = 20, label?, className?, strokeWidth = 1.75 })` | `<svg class="ds-icon" data-icon>` | Lucide markup from `DSL.iconsData`. Decorative (`aria-hidden`) unless `label` is given (`role="img"` + `aria-label`). An unknown name returns an empty svg and warns once per name. |
| `button({ label?, icon?, iconEnd?, variant = 'secondary' \| 'primary' \| 'ghost', iconOnly?, ariaLabel?, title?, onClick(e, pressed?), testid?, pressed?, size?: 'sm', disabled?, className?, type = 'button' })` | `<button class="ds-btn ds-btn--…">` | `pressed: true/false` makes it a toggle with `aria-pressed`; `onClick` then receives the new state. `title` becomes an accessible tooltip (`data-tip`), never a native `title`. `iconOnly` without `ariaLabel`/`label` warns. |
| `help(text, { label?, testid?, side? })` | `<button class="ds-help">` | Small «?» button with `aria-label` «Explicación de «label»» and `data-tip=text`. On touch, a tap toggles the tooltip; Enter or Space (a click without a pointer, `detail === 0`) also toggles it. It stays open until Esc, blur or a second activation. `side` sets `data-tip-side`. |
| `slider(opts)` | `{ el, input, value, set(v, { silent }), setRange({ min, max, step }), setDisabled(b), reset(), destroy() }` | See *Slider*. |
| `segmented({ options: [{ value, label?, icon?, title?, ariaLabel? }], value, onChange(value), label?, testid?, equal = true, className? })` | `{ el, value, set(v, { silent }), destroy() }` | `role="radiogroup"`; options are `role="radio"` buttons with roving tabindex. Arrows (wrapping), Home and End select and focus. The selection pill `.ds-seg__thumb` slides with `transform` (`--seg-x`, `--seg-w`, 220 ms) and carries a 2 px bottom bar in `--accent` (at least 3:1 against the track and the pill in both themes); the chosen label is weight 600, and each label reserves its 600 width (`data-text`), so choosing never shifts the row. `equal: false` sizes columns to content. |
| `tabs({ tabs: [{ id, label, icon?, panel }], value?, onChange(id), label?, testid?, placePanels = true, className? })` | `{ el, tablist, value, select(id, { silent }), destroy() }` | ARIA tabs with automatic activation. ←/→ (wrapping), Home and End. Panels get `role="tabpanel"`, `aria-labelledby` and `tabindex="0"`; a panel's own `id` is kept. Panels fade in 150 ms (no directional slide). The indicator slides with `transform` (`--tab-x`, `--tab-s`). `placePanels: false` leaves the panels where the caller puts them. |
| `tooltips.init(root = document)` | — | Delegated tooltips for every `[data-tip]` inside `root`. Idempotent per root. |
| `tooltips.show(el)` / `hide()` / `refresh(el?)` / `isOpen()` / `place(o)` | — | `refresh` updates the text and position of the open tooltip (of `el`, or any). `place` is the pure placement function (below). |
| `tooltip(el, text)` | `el` | Sets or removes (`''`/`null`) `data-tip` and refreshes an open tooltip. |
| `transport({ onPlay, onPause, onReset, onSpeed(x), speeds = [0.25, 0.5, 1, 2, 4], speed = 1, playing = false, timeLabel = 't', timeUnit = 's', timeDecimals = 2, label = 'Controles de la simulación', testidPrefix?, className? })` | `{ el, playing, speed, setPlaying(b), setTime(t), setSpeed(x), destroy() }` | See *Transport*. |
| `toggle({ label, checked = false, onChange(checked), testid?, description?, className? })` | `{ el, button, checked, set(b, { silent }), destroy() }` | `el` is the wrapper `.ds-toggle-field`; the control is `<button role="switch" aria-checked>`. `description` is linked with `aria-describedby`. |
| `collapsible({ title, content, open = false, number?, headingLevel = 3, onToggle(isOpen), testid?, className? })` | `{ el, button, open(), close(), toggle(), isOpen(), setContent(node \| text \| list), destroy() }` | A heading `h2`…`h6` that contains a button with `aria-expanded` and `aria-controls`. The region opens with `grid-template-rows: 0fr → 1fr`; under reduced motion (`prefers-reduced-motion` or `[data-motion="reduce"]`) it takes its final height in the same frame, app-wide. `number` shows a numbered disc (for ordered derivation steps). |
| `card({ title?, icon?, body, footer?, as = 'article', headingLevel = 3, className?, testid?, interactive?, spotlight? })` | element | Tier-B surface. `interactive` adds hover/focus-within states. `spotlight` (`data-spotlight`) adds a pointer-following highlight (mouse only, off with reduced motion). |
| `chip({ label, tone = 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'info', icon?, title?, testid?, className? })` | `<span class="ds-chip">` | Tone always comes with text. `title` becomes `data-tip` plus screen-reader text. |
| `readout({ label, tex?, value, unit = '', digits = 3, live = false, layout = 'stack' \| 'inline', tone?, tip?, testid?, className? })` | `{ el, set(value, { unit? }), destroy() }` | Numbers via `formatNumber(v, digits)` with tabular figures; `null` shows «—», strings are shown as they are («Calculando…»). `tex` is drawn with `window.katex` (`strict: 'ignore'`, plain text if KaTeX is missing). `live: true` adds `role="status"` + `aria-live="polite"`; use it only for key results, never for per-frame values. `set` skips identical text. Markup of the value: `.ds-readout__num`, a plain space text node, `.ds-readout__unit` (the unit alone; the space is empty without a unit and an empty unit is not displayed). A flex container does not paint that space, so the visible separation is the value's `column-gap` (`--ds-readout-sep`, one unit-font space: `--text-sm` × 0.2143 = 3 px), and a unit that wraps under a long number starts flush with it. `textContent` and screen readers still get «3.16 rad/s» (audit round 2; the unit used to start with U+00A0, which indented a wrapped unit by 3 px). `tip`: a short explanation of the result; adds a `help()` «?» button inside the label (named «Explicación de «label»», `data-tip=tip`, test id `<testid>-help`) and the same text as `.sr-only`. Without `tip` the markup does not change. In the shown label a digit and a following « %» are joined by U+00A0 («2 %» never breaks before «%»); the accessible name keeps the label as given. In a row of stacked readouts the label row absorbs the spare height and the value row reserves one figure line, so values start at the same height even when a label wraps or a value is text. |
| `toast(message, { tone = 'neutral', action?: { label, onClick }, duration = 5000, testid = 'ds-toast', returnFocus? })` | `{ el, dismiss() }` | Floating tier-A notice in `section.ds-toasts[aria-label="Avisos"]`. The timer pauses while the pointer is over it or focus is inside; on resume it gets at least 800 ms. `duration: 0` (or `Infinity`) never auto-closes. The text is announced through the shared live region. At most 3 open toasts (the oldest leaves). Exit takes 180 ms. **Keyboard**: when the toast has an action and was created within 1 s of a key press (see `inputModality()`), its action button takes focus (`preventScroll`), so «Deshacer» is one key away. Esc inside the toast dismisses it. When it is dismissed with focus inside (action, close, Esc), focus returns to `returnFocus` (an element, or a function returning one) if it is still in the document, otherwise to the element that had focus before the toast. Pointer-created toasts do not move focus and keep the 5 s timer. |
| `reveal(el, { delay = 0, stagger = 0, items? })` | `stop()` | One-time reveal (opacity + `--travel-rise`, transform only) when `el` enters the viewport. `items` is a simple selector of children to stagger. Does nothing under reduced motion or without IntersectionObserver. Use sparingly (SKILLS_BRIEF §1: no fade-up on every section). |
| `announce(text)` | — | Shared polite live region `[data-testid="ds-live"]`. It clears first and writes 60–120 ms later, so the same text is read again. |
| `inputModality()` | `'keyboard' \| 'pointer' \| null` | The last way the visitor interacted (document `keydown` / `pointerdown`, capture phase, tracked from `init`). Modifier keys alone do not count. `null` before `init` or before the first input. |
| `init(root = document)` | — | Called by `app.js`. Runs `tooltips.init(root)`, creates the live region, keeps `<html data-motion="reduce">` in sync with `DSL.prefs.reducedMotion` (`motion:change`), starts the input-modality tracking and enables the card spotlight. Idempotent. |
| `helpers` | `{ place, makeScale, sigRound, snapTo, decimalsOf, slug, renderTex }` | Pure helpers exposed for tests. |

### Slider

```js
DSL.ui.slider({
  label: 'Masa', symbol: 'm', unit: 'kg',
  min: 0.1, max: 10, step: 0.1, value: 1, defaultValue: 1,
  scale: 'linear',            // or 'log' (0 < min < max)
  tooltip: 'Inercia del bloque…',
  format: (v) => '…',         // optional; default formatNumber with the decimals of step
  numberField: true,          // false shows a static readout instead of the input
  disabled: false,
  testid: 'ms-m',
  onInput(v, { final }) {},   // while dragging: at most once per frame, final: false
  onChange(v) {},             // on release, keyboard, number entry, reset, non-silent set
  onEditStart() {},           // first keystroke of an edit in the number field
});
```

- Structure: a head row (`label[for]` with name and `.ds-sym` symbol, optional help, reset, value) and
  a control row (rail, fill, native `input[type=range]`, `<output class="ds-slider__bubble">`).
- The native range keeps all keyboard behaviour; `aria-valuetext` carries value and unit («1.0 kg»).
- `--pos` (0…1) on `el` drives the fill (`clip-path`) and the bubble (`left` in % of the control, plus
  `translateX(-50%)`). The rail spans the full width, so its edges line up with the label and the value.
  (Integrator: the bubble used `100cqw` inside `transform`; Chromium could keep a value computed for an
  earlier container width, and the invisible bubble overflowed the page at 390 px in the single-file build.)
- Long names wrap (with hyphenation) instead of being cut with an ellipsis (integrator, tfengine's request).
- The value bubble shows only while dragging. With the keyboard the value is read in the number field.
- Number field: `,` or `.` accepted; Enter commits; Esc reverts; ↑/↓ step (Shift ×10); invalid text sets
  `aria-invalid`, shows the message in `.ds-slider__error` (linked with `aria-describedby`) and reverts on blur.
  - The error element is `role="alert"` and always present (empty, it takes no space), so the message
    «Escriba un número entre 0.1 y 10 kg. Se acepta la coma decimal.» is spoken when it appears. A unit that
    already ends in «.» (u.a.) gets no second period.
  - Out-of-range input is clamped to the limit and explained for about 4 s by a polite note
    `.ds-slider__note[role="status"]`: «Se ajustó a 50 N/m (máximo).» (or «(mínimo)»). An in-range commit or an
    error clears it.
  - `onEditStart()` fires on the first keystroke of each edit, so a caller can pause whatever updates the
    value (for example a playing simulation). While the field is focused and being edited,
    `set(v, { silent: true })` changes the value but leaves the typed text alone; Enter commits what was typed.
    A non-silent `set` still replaces the text.
- Without `onChange`, a commit calls `onInput(v, { final: true })`.
- Log scale: integer positions, 60 per decade (at least 100); values rounded to 3 significant figures.
- The reset button is hidden (and disabled) while the value equals the default. Its name is
  «Restablecer «Masa» a 1.0 kg». If it has focus when it becomes disabled (Enter on it), focus first moves to
  the slider's range input (`preventScroll`), so it never falls to `<body>`.
- Test ids: `<testid>` (root), `-input`, `-value` (bubble), `-number` or `-readout`, `-reset`, `-help`,
  `-error`, `-note`.

### Transport

- One play/pause button `.ds-btn--primary.ds-btn--icon.ds-transport__play`. It swaps `aria-label`
  («Reproducir» / «Pausar») and `data-state` (`paused` / `playing`). The glyph morphs with `clip-path` in 120 ms.
- Reset is a ghost icon button «Reiniciar» with a short counter-clockwise spin (none under reduced motion).
- Speed is a `segmented` («0.25×» … «4×», `data-tip="Velocidad"`); `setSpeed` is silent.
- Time readout `role="timer"`: `t = 0.00 s` with tabular figures; `setTime` writes only when the text changes.
- `.ds-transport` is a size container (`container-type: inline-size`). It fills its parent's width. Below
  34 rem it hides the separator, puts the time next to the buttons and gives the speed control a full row.
- Test ids with `testidPrefix: 'p'`: `p-transport`, `p-play`, `p-reset`, `p-speed`, `p-speed-0-25`,
  `p-speed-1`, …, `p-time`.

### Tooltips

- One `div.ds-tooltip[role=tooltip][data-testid=ds-tooltip]` appended to `<body>`, with
  `data-state="closed|measure|open"` and `data-side`. It is positioned with `--tip-x` / `--tip-y`.
- Pointer hover opens after 280 ms. Within 400 ms of a close, the next one opens at once. A 120 ms grace
  lets the pointer move onto the tooltip, which stays open while hovered (WCAG 1.4.13).
- Keyboard focus (`:focus-visible`) opens at once. Esc closes it; the key is consumed only when a tooltip
  was open. Scroll and resize close it. On touch only `.ds-help` reacts to a tap. Enter or Space on a
  `.ds-help` button toggles its tooltip (focus: open, Esc: closed, Enter: open, Enter: closed).
- `aria-describedby` is added only when the tip differs from the anchor's accessible name.
- Anchors inside `.app-header` always open below the bar (no glass on glass).
- `place({ anchor, tip: { width, height }, viewport: { width, height }, side = 'top', offset = 8, margin = 8 })
  → { top, left, side }`: flips to the opposite side when it does not fit (left/right fall back to
  top/bottom), then clamps inside the viewport margin.

## Test-id conventions

`slug(value)` turns values into ids: `0.25 → '0-25'`, `'Escalón' → 'escalon'`. Segmented options are
`<testid>-<slug(value)>`, tabs `<testid>-<slug(id)>`, collapsible `-toggle` / `-region`, readout value
`-value`, toast action `-action` and close `-close`. Shared nodes: `ds-tooltip`, `ds-live`, `ds-toasts`.

## CSS hooks (`css/components.css`, layer `components`)

| Hook | Use |
|---|---|
| `.ds-panel` | Tier B, frosted without blur: content panels, derivation, concept cards. |
| `.ds-glass`, `.ds-glass--overlay` | Tier A, real `backdrop-filter`: only fixed or overlay layers (dock 14 px, sheet/dialog 20 px). At most 3 on screen; never glass on glass. |
| `.ds-plot` | Tier C, solid: chart plot areas and canvases. Data never sits on blur. |
| `.ds-btn`, `--primary`, `--ghost`, `--icon`, `--sm`, `[aria-pressed]` | Buttons (press scale .97, hover only inside `(hover: hover)`). |
| `.ds-help`, `.ds-chip--<tone>`, `.ds-kbd` | Help button, chips, key caps. |
| `.ds-field`, `.ds-label`, `.ds-hint`, `.ds-error`, `.ds-input`, `.ds-select` | Form fields. `.ds-select` is a wrapper `<span class="ds-select"><select>…</select></span>` that draws the chevron. `[aria-invalid="true"]` styles errors. |
| `.ds-table` | Data tables (numeric cells right-aligned, tabular figures). |
| `.ds-callout`, `--accent`, `--success`, `--warning`, `--danger` | Inline notices (icon + text). |
| `.ds-cluster`, `.ds-stack` | Wrapping row / vertical rhythm helpers. |
| `.ds-sym` | Inline italic symbol in KaTeX_Math (`m`, `ζ`, `ω_n`); add `translate="no"`. |
| `.ds-math`, `.ds-math-block`, `.ds-math-lg`, `.ds-math-xl` | KaTeX wrappers: inline size, block (scrolls horizontally if too wide), larger sizes. |
| `.ds-term`, `.ds-term.is-hl` | Linkable terms inside KaTeX (`\htmlClass{ds-term}{…}`, needs `trust`); `.is-hl` highlights with colour and background only. |
| `.ds-tex-in`, `-out`, `-state`, `-pole`, `-zero`, `-accent`, `-muted` | Semantic colours for `\htmlClass` inside formulas (input, output, state, pole, zero). |
| `.ds-reveal` / `.is-revealed` | Set by `reveal()`; only active under `html.js` and never with `data-motion="reduce"`. While `<html data-jumping>` is set (a shell jump), every `.ds-reveal` shows its final state with no transition. |
| `.sr-only`, `.ds-visually-hidden` | Visually hidden text (base layer). |
| `.app-error` | Error card painted by `app.js` (danger-soft surface, inset bar, icon). |

KaTeX's own CSS is unlayered, so it wins over every layer. Style formulas through the wrappers above,
never by overriding `.katex` rules.

### Tabs on phones

Below 768 px every `.ds-tabs__tab` takes an equal share of the row and its label may wrap to two lines,
so the list never scrolls sideways or cuts the first tab (integrator, at hero-concepts' and tfengine's
request; it generalises tfengine's local variant).

## Themes, motion and transparency

- Tokens are scoped by `[data-theme="dark"]` / `[data-theme="light"]`, so any subtree can switch theme
  (the kitchen-sink page uses this for its side-by-side panes). `DSL.prefs.setTheme` changes `<html>`.
- `prefers-reduced-motion: reduce` or `<html data-motion="reduce">` (kept in sync by `init`) zeroes the
  travel tokens; components keep only opacity changes; `reveal` hides nothing; the transport reset does
  not spin; the base safety net sets `animation-iteration-count: 1` and `scroll-behavior: auto`.
- `prefers-reduced-transparency: reduce` and browsers without `backdrop-filter` replace glass with solid
  surfaces and remove the grain.
- Focus: `:focus-visible` ring from `--focus-ring` everywhere; the slider moves the ring to the thumb.
- Coarse pointers: compact controls grow to 44 px (`--control-h-sm`), including `.ds-seg__opt` and the
  slider's number field. Fine-pointer sizes do not change.
- Forced colours (Windows high contrast): what is drawn with backgrounds is repainted with system colours.
  The play glyph uses `ButtonText`; the selected segment gets a 2 px `Highlight` outline and bar; the tab
  indicator and the slider fill use `Highlight`; the switch track has a 1 px `ButtonText` outline and a
  `ButtonText` thumb, and when on, a `Highlight` track with a `HighlightText` thumb. KaTeX keeps its own
  colours (`forced-color-adjust: none`, `CanvasText`), so accent backplates never hide the base letter of
  `\dot{x}` (unlayered rule in `css/base.css`).

## Tokens added by design-system

`--bg-lift`, `--bg-grid-major`, `--grain`, `--grain-opacity` (backdrop); `--glass-b-hover`, `--scrim`,
`--mask-fill`, `--spotlight`, `--spotlight-edge`; `--fw-display`, `--section-pad`; `--slider-thumb`,
`--slider-rail`, `--tip-max`; `--dur-reveal`, `--travel-pop`. All 151 original names are kept.
The grain is a base64 SVG data URI held in a token, so it costs nothing at runtime and survives the
single-file build.

## Deviations from docs/ARCHITECTURE.md

- Extra API: `help`, `init`, `helpers`, `tooltips.refresh/isOpen/place`.
- The slider's `onInput(v, { final: true })` fires only when no `onChange` is given; with `onChange`,
  commits go to `onChange` alone.
- The value bubble appears only while dragging (on keyboard focus it would cover the label).
- KaTeX is styled through wrapper classes because the vendor stylesheet is unlayered.
- Number–unit separator is U+00A0 in component text (`aria-valuetext`, slider bubble). Readouts instead put a plain space between the number and unit elements and space them with `column-gap` (audit round 2, see `readout`).

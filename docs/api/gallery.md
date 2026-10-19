# API: `js/sections/gallery.js` (owner: gallery)

Section `#galeria` (PRODUCT_SPEC §2.4). Classic script (IIFE on `window.DSL`, `'use strict'`), works from
`file://`. Styles live in `css/sections/gallery.css` (prefix `gl-`, `@layer sections`, tokens only, no id
selectors, no `!important`). Icons are listed in `tools/icons/gallery.list`. Tests:
`tests/unit/gallery.test.mjs` (pure helpers, node) and `tests/e2e/gallery.spec.mjs` (Playwright; screenshots
in `test-results/gallery/shots/`; the audit regressions GAL-01…GAL-13 are the last `describe`).

**Numbers come from the engine.** Every value on screen comes from `DSL.systems` (`Simulator`, `describe`,
`simulate`, `model.readouts`, `model.derivation`, `model.linearization`, `model.domain`). The section never
computes physics.

---

## `DSL.sections.gallery`

```js
DSL.sections.gallery = { mount(el) → handle, helpers };
```

`mount(el)` is cheap. It renders the heading, the lead, the rail and a **skeleton** of the stage
(`div.gl-skel`, test id `gl-skeleton`, `aria-hidden`) with the final geometry of the viewer: header,
scene box, two chart frames and the dock. Until the stage is built, `.gl-stage` has the class
`is-pending`, `aria-busy="true"` and a `min-height` per breakpoint equal to the measured height of the
built mass-spring stage, so the page below does not move when it is built.

**Lazy init in phases** (each ≲ 50 ms): rail plate → stage DOM (removes the skeleton) → scene → chart
plan and predicted ranges → chart 1 → chart 2 → parameters and input → readouts → G(s) row → first frame.
With `DSL.util.lazyInit` (FND-07) one phase runs per idle callback after the load, and all remaining phases
run at once when the gallery comes within 200 px of the viewport; the root gets `data-lazy="done"` (or
`"error"`). Without `lazyInit`, everything is built by `util.onVisible(root, …, { once: true, rootMargin:
'200px' })`. `gallery:open` and `handle.select()` complete the remaining phases at once.

### DOM

```
div.gl[data-lazy]
├─ div.gl-head
│  ├─ h2#galeria-title           «Galería de ejemplos interactivos»
│  └─ p.gl-lead
├─ div.gl-rail[role=tablist]                       data-testid gl-rail
│  ├─ span.gl-rail__plate[aria-hidden]             gl-rail-plate   (sliding selection plate)
│  └─ button.gl-sys[role=tab] × 5                  gl-system-<modelId>
│     ├─ .gl-sys__top > .gl-sys__icon + .ds-chip.gl-sys__cat
│     ├─ .gl-sys__name
│     └─ .gl-sys__sum
│     aria-labelledby = category chip + name + summary (the visible text, in order). Spaces between the
│     three parts (invisible in the grid) separate the words of the visible text (axe
│     label-content-name-mismatch, WCAG 2.5.3).
└─ div.gl-stage[role=tabpanel][aria-labelledby=<name of the selected tab>]    gl-stage
   ├─ div.gl-skel (gl-skeleton)    only before the lazy init
   └─ div.gl-system
      ├─ div.gl-shead
      │  ├─ .gl-shead__icon
      │  ├─ .gl-shead__main > h3.gl-shead__title (gl-title), .gl-seg-wrap > variant segmented (gl-variant-<id>),
      │  │                    p.gl-shead__summary (gl-summary)
      │  └─ .gl-shead__chips > gl-chip-category, gl-chip-linear («Lineal»/«No lineal»),
      │                        gl-chip-time («Tiempo continuo»/«Tiempo discreto»)
      └─ div.gl-bodyhost > div.gl-body[data-variant]
         ├─ div.gl-viewer (gl-viewer)
         │  ├─ div.gl-main
         │  │  ├─ div.sc-stage.gl-scene (gl-scene-box) > scene SVG (gl-scene)
         │  │  └─ div.gl-charts[data-count] (gl-charts) > .ch-frame.gl-chart > canvas (gl-chart-1, gl-chart-2)
         │  ├─ div.ds-callout--warning.gl-halt[role=status][hidden]  (gl-halt)
         │  ├─ div.ds-callout.gl-note[role=status][hidden]          (gl-note)
         │  └─ div.gl-dock.ds-glass (gl-dock) > ui.transport (gl-play, gl-reset, gl-speed-<x>, gl-time, gl-transport)
         ├─ div.gl-data (gl-data)          «Ver datos» toggles of each chart (charts.dataToggle:
         │                                  gl-chart-N-data-toggle, gl-chart-N-data)
         ├─ div.gl-panels
         │  ├─ section.ds-panel.gl-panel--params  «Parámetros» + gl-params-restore + sliders gl-param-<key>
         │  ├─ section.ds-panel.gl-panel--input   «Entrada» + segmented gl-input-<type> + gl-input-desc
         │  │                                      + sliders gl-inparam-<key>
         │  └─ section.ds-panel.gl-panel--read    «Lecturas en vivo» > .gl-readouts > gl-readout-<id>
         │                                         (with the model's tip: gl-readout-<id>-help)
         └─ div.gl-tf (gl-tf)
            ├─ with G(s):    button gl-tf-open «Ver G(s) paso a paso», segmented gl-tf-output-<key>
            │                (only when the model has several TF pairs), p.gl-tf__note (gl-tf-note)
            └─ without G(s): .ds-callout.gl-notf (gl-notf): why there is no G(s) (derivation step
                             'nolineal' or 'sings'), collapsible «Ver la vista linealizada» (gl-notf-linear-*)
                             when model.linearization() is not null, and button gl-notf-concepts
```

Slider sub-test-ids follow `ui.slider`: `<id>-input`, `<id>-number`, `<id>-help`.
Sliders of `live: false` parameters get the class `gl-slider--restart` and the tooltip ends in
«Cambiarlo reinicia la simulación.». Text readouts (régimen, estabilidad…) get `gl-readout--text`.
Readouts pass the model's `tip` (CORE-13) to `ui.readout`, which adds the «?» button and the same text as
`sr-only`. In the gallery the label flows as text: the symbol and the name are atomic boxes, so the name moves
whole to the next line when it does not fit beside the symbol. The «?» sits in the card's top-right corner
(out of flow; same DOM and tab order), and a 1 px float reserves its width on the first label line only, so
a long name (ωn, ζ, ts…) never leaves the «?» alone on a line between the name and the value.

### Behaviour

- **One loop, gated on the viewer.** `util.loop(tick)` runs only while the system is playing **and** the
  viewer (scene + charts + dock) is within 64 px of the viewport (`util.onVisible(viewer, …, { rootMargin:
  '64px' })`); the loop also stops when the tab is hidden. With the viewer scrolled away the simulation
  pauses even if the panels are still on screen, and resumes where it was (no catch-up). When the viewer
  leaves, its charts are flushed (`handle.flush()`), so the last samples are drawn at once and no deferred
  off-screen render happens while the loop is stopped. Each frame calls
  `sim.step(dt)` in `ceil(speed·2)` chunks (at most 8), pushes chart samples (decimated to `horizon/1200`,
  `maxPoints` 2400), renders the scene with a reused frame object and updates the time readout. Charts
  stream with a scrolling window equal to the model horizon (`hints.duration`).
- **Play state.** Every new system or variant starts playing from t = 0. With reduced motion it starts
  paused and shows the whole trajectory (`advance(horizon)` + `setData`); a param change while at the end
  recomputes it. «Reproducir» after the end or after a halt restarts first.
- **Params.** Live params apply during play (`sim.setParams`) without resetting; `live: false` params
  apply on commit and reset. The scene receives params throttled to ≤ 1 rebuild / 150 ms.
  «Restablecer parámetros» (disabled while everything is at its default) restores the defaults and shows a
  toast (gl-toast) with «Deshacer». When the button is disabled while it has the focus, the focus moves to
  the first parameter's range input first (never to `<body>`); the toast gets `returnFocus` = that input,
  so with the keyboard the focus goes to «Deshacer» and comes back to the first parameter when the toast
  closes (FND-15). With the pointer the toast does not take the focus.
- **Announcements.** After a committed parameter change, the first two readouts are announced through
  `ui.announce` once, 450 ms after the control stops moving (one announcement for a run of arrow keys).
  Every announced or displayed sentence goes through `sentence()`, so no text ends in «..».
- **Inputs.** Input values are remembered per model/variant/type. Changing type rebuilds the input sliders;
  the charts are rebuilt only if the chart plan changes.
- **Charts.** Outputs keep the model's `dash` (e.g. Torricelli's `h_lin`, «Nivel lineal (aprox.)», drawn
  dashed next to `h`); the input series is always dashed. Charts share the scene height in `auto` rows with
  a plot area of at least 160 px (`--gl-plot-min`), so the y-axis title is never clipped.
- **Y axes.** A batch `S.simulate` over the horizon (truncated at the first `model.domain()` exit)
  predicts each chart range, merged with the observed range, so axes do not jump while the curve grows.
  Each chart is created with that range (`yRange`); the charts layer builds its first Chart.js config from
  it, so even the draw made on construction uses it (`seedAxis()` remains as a no-op guard). A chart with only the input includes 0. When a curve would touch the frame edge the axis gains
  one tick.
- **Halt.** On `sim` 'halt' the warning callout appears, playback pauses and the message is announced (a
  readout announcement still pending from a parameter change is cancelled first, so it can never replace the
  halt message in the live region). For
  a domain exit (`kind` 'dominio' in the 'halt' payload or in `halted`, or «dominio» in the reason as a
  fallback) the callout shows the
  model's reason and what to change: for the cobweb «Baje d por debajo de b (o acerque P₀ a P*) y pulse
  «Reiniciar».» when d ≥ b, otherwise «Acerque P₀ a P* y pulse «Reiniciar».». After «Reiniciar» following a
  halt, while paused, the info callout `gl-note` says the simulation is back at t = 0 / k = 0 and paused
  («Pulse «Reproducir» para simularla de nuevo.»); it hides on play.
- **Switching.** Rail click or ←/→/Inicio/Fin (roving tabindex; with arrows the system is built 180 ms
  after focus stops). The stage fades out completely (`.is-leaving`, `--dur-fast`): the build waits for its
  `transitionend` (fallback timer: duration + 250 ms), because the animation clock only advances with
  rendered frames and a fixed timer could start the build with the fade half done (the fade-in was then
  reversed, shortened or skipped). The new system is then built in short tasks (`DSL.util.yieldTask`
  between them): DOM, scene, chart plan and prediction, chart 1, chart 2, parameters and input, readouts,
  G(s) row, first frame; the panel steps lay out what they add, so no single frame pays for the whole
  stage. Finally `.is-leaving` is removed and the stage fades in (`--dur-popover-in`). A variant switch does
  the same on `.gl-bodyhost`. A new selection during a switch cancels the pending work. The plate slides
  with `--dur-tab` / `--ease-tab`.

### Bus

| Direction | Event | Payload |
|---|---|---|
| listens | `gallery:open` | `{ systemId, variant? }`; unknown or unlisted ids are ignored. Works before lazy init. |
| emits | `tf:open` | `{ systemId, variant, params, outputKey }` (params is a copy of `sim.params`) |
| emits | `concepts:open` | `{ card: 'linealidad', tab: 'superposicion' }` (SIR, nonlinear) or `{ card: 'ecuaciones' }` (discrete cobweb) |

### Handle

```js
const g = DSL.app.handles.gallery;
g.select(systemId, variant?)   // like gallery:open, without scrolling; completes the lazy init if needed
g.state() → {
  ready, switching, systemId, variant, playing, running, viewerVisible, t, speed, params, input, halted,
  horizon, atEnd, tfKey, readouts: [id],
  initPhases: [ms],            // duration of each lazy-init phase run so far
  switchSteps: [ms],           // duration of each build step of the last system/variant switch
  charts: [{ testid, series: [key], dashed: [key], yLabel, yRange: [lo, hi], points, pushes, updates }]
}
g.destroy()                    // cancels a pending switch, stops the loop, destroys sim, scene, charts,
                               // sliders and listeners
```

`running` is `loop.isActive()` (playing, viewer on screen and tab visible). `viewerVisible` is the last
state reported by the viewer's observer. `updates` counts Chart.js redraws (`handle.stats()`).

---

## `helpers` (pure, unit-tested)

| Function | Purpose |
|---|---|
| `texPlain(tex)` | Simple TeX → Unicode (Greek, sub/superscripts, `\bar`) for chart legends. |
| `timeDecimals(duration, discrete)` | Decimals of the time readout: 15 s → 1, 0.12 s → 3, 150 s → 0, discrete → 0. |
| `displayOf(spec)` | `{ unit, factor }` from `ParamSpec.display` (e.g. mH ×1000). |
| `scaleNum(x, f)` | `x·f` without binary noise (12 significant digits). |
| `niceRange(lo, hi)` | Nice y bounds containing `[lo, hi]` (via `charts.helpers.niceBounds`), plus one tick when a curve touches an edge (not at 0). `null` without data. |
| `chartPlan(desc, inputType, modelId)` | Up to two charts: outputs grouped by unit (each keeps its `dash`); the input (dashed, `--c-in`) joins the group of its unit or gets its own chart if there is room. `[{ id, unit, noun, yLabel, series: [{ key, label, color, dash, unit, kind, factor }] }]` |
| `planSignature(plan)` | String that changes only when the charts must be rebuilt. |
| `horizonOf(hints)` | `hints.duration` or 10. |
| `readoutValue(r)` | Number, text or `null` for a model readout. |
| `sentence(s)` | Trims trailing spaces and adds a final «.» only when the text does not already end in `.`, `!`, `?` or `…` (`'u.m. '` → `'u.m.'`, `''` → `''`). |
| `isDomainHalt(halted)` | `true` for a domain exit (`kind` 'dominio' / 'domain', or «dominio» in the reason). |
| `INPUT_KEY` | `'entrada'`, the chart key of the input series. |

---

## CSS hooks

- Layout: `.gl-main` is `7fr / 5fr` (scene | charts) at ≥ 1024 px and stacks below; the scene stretches
  to the row. `.gl-charts` has `--gl-rows` (set from JS) `auto` rows; each `.gl-chart` has
  `--ch-plot-min-height: var(--gl-plot-min)` (160 px plot + 68 px of axes). `.gl-panels` is Parámetros |
  Entrada with the readouts as a full-width strip; one column on phones. The rail scrolls horizontally with
  snap on phones.
- Before the build: `.gl-stage.is-pending` (`align-content: start`, `min-height` per breakpoint: ≥ 1280,
  1024–1279, 768–1023, 600–767, 360–599 and < 360 px) and `.gl-skel`, `.gl-skel__head`, `__icon`,
  `__lines`, `__line`, `__scene`, `__charts`, `__chart`, `__dock` (surfaces and lines from tokens).
- Glass: tier A only on the sticky `.gl-dock`; tier B on the rail and panels; scene and charts are solid (C).
- `.gl-scene` has `min-width: 15rem` so a scene never measures narrower than it can draw.
- Callouts: `.gl-halt` (warning) and `.gl-note` (info, `--info` / `--info-soft`); both `display: none`
  when `[hidden]`. `.gl-notf` and its concepts button wrap at 320 px instead of widening the section.
- Narrow widths: `.gl-seg-wrap` options may break into two lines and keep their min-content width (the wrap
  scrolls only if the words still do not fit); below 480 px segments take the width of their text with a
  smaller inline padding. Slider heads in `.gl-sliders` wrap: the value moves to its own line, right
  aligned, instead of squeezing the parameter name.
- Tablet (768–1023 px): `.gl-sys__top` stacks icon and category chip, so the chip is never clipped.
- Forced colours: the plate is hidden and the selected card gets `outline: 2px solid Highlight` and an
  underlined name.
- States: `.gl-stage.is-pending`, `.gl-stage.is-leaving`, `.gl-bodyhost.is-leaving`, `.gl-rail.is-ready`,
  `.gl-sys.is-selected`.

## Deviations

- Test ids use the raw model ids (`gl-system-massSpring`, `gl-variant-telarana`).
- The input series is charted only when it shares a unit with an output group or fits as a second chart, so
  the mass-spring force F is not plotted (its value is in the scene).
- The run does not stop at the horizon: it keeps streaming with a scrolling window.
- Extra handle members `select()` and `state()` for integration and tests.
- Rail tab names: the audit suggested category + name as the name and the summary as the description, but
  axe `label-content-name-mismatch` still fails that way (the summary is visible text of the tab and must be
  part of its name). The tab is named by category + name + summary, in visible order; the tab panel is
  named by the system name alone.

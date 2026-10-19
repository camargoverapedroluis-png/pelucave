# API: `js/viz/charts.js` (owner: charts)

`charts.js` is the chart layer on top of Chart.js 4.5.1 (UMD, `window.Chart`). It fills
`DSL.viz.charts`. It is a classic script (IIFE, `'use strict'`), loaded after
`vendor/chart.js/chart.umd.min.js`, `js/core/ns.js` and, optionally, `js/ui/icons-data.js`, and before
the sections. Its styles are `css/charts.css` (`@layer charts`, tokens only).

Tests: `tests/unit/charts.test.mjs` (node:vm with a fake Chart.js that runs the drawing plugin) and
`tests/e2e/charts.spec.mjs` (Playwright on `tests/pages/charts.html`).

## Differences from `docs/ARCHITECTURE.md` §10

The contract in §10 holds. These are additions or precisions:

1. **Extra handle members:** `tableSpec()`, `stats()`, `flush()`, `frame`, `frames`, `testid`, `alive` on every
   handle; `setData(samples)` on the time chart; `setXRange(range)` on the XY chart. `resize()` exists on every
   handle, not only the time chart.
2. **Extra options:** `testid`, `legend`, `dataToggle` on every factory; `markers` and `color` on Bode;
   `xUnit`, `xSymbol`, `fps` on the time and step charts; `ghost: false` on step and Bode hides the «Anterior» legend item.
3. **DOM:** the layer wraps the canvas in `div.ch-plot` inside its `.ch-frame` and adds an HTML legend,
   a glass tooltip and two screen-reader nodes there. `destroy()` puts everything back.
   With Bode in two frames, the shared legend goes just before the magnitude frame (outside both frames).
4. **Interaction is our own:** Chart.js runs with `events: []`, `animation: false`, its tooltip and legend
   plugins off. Hover, touch, keyboard, crosshair and tooltip are drawn by the layer (see «Interaction»).
5. **Off screen:** a chart that is not visible does not animate. It applies the final state to its data at
   once and draws **once**, 400 ms after the last change (each change postpones it, but never more than 1 s
   after the first one), for every chart kind. Resizes while off screen do not redraw either (Chart.js still
   resizes the canvas; the drawing waits for that same render). A chart with pending changes draws at once
   when it comes back into view. `DSL.viz.charts.flush()` and the window's `beforeprint` draw everything
   pending immediately, so a print or a full-page capture never shows stale data or a chart half-way.
6. **Step legend grouping:** the step chart legend has four items, not one per annotation: the curves,
   «Anterior», «y∞ ± 2 %» (final-value line and band) and «Pico y tiempos» (peak, tp, ts and tr).
7. **Annotations:** the step chart also accepts the shape of `DSL.core.tf.stepInfo` (`peak` as a number with
   `peakTime`, `riseTimes`, `settleBand`, `overshootPct`), besides `peak: { t, y }`, `riseTime`, `band`.
8. **Ghost lifetime:** the ghost is the curve from before the current interaction. A run of `'drag'` updates
   keeps the ghost from before the drag started, and the `'release'` that ends the drag keeps it too.
9. **Complex numbers** in tooltips and summaries use the typographic minus: `p1 = −1.00 + 2.00j`.
10. **Frame sizing:** `.ch-frame` keeps `aspect-ratio: var(--ch-aspect, 16 / 9)`, and `.ch-plot` has a minimum
    height (`--ch-plot-min-height`, 190 px). On narrow screens the frame grows rather than squeezing the plot.

## Markup

```html
<div class="ch-frame"><canvas data-testid="step-main"></canvas></div>
```

- `.ch-frame` reserves the space with `aspect-ratio` (`--ch-aspect`, default 16/9). Modifiers:
  `.ch-frame--wide` (21/9), `.ch-frame--square` (1/1), `.ch-frame--bode` (5/2). A section may set
  `--ch-aspect` or `--ch-plot-min-height` on the frame. If the parent has no `.ch-frame` class, the
  layer adds it (and removes it on `destroy()`).
- Bode takes two canvases. Put each one in its own frame (stacked), or both in one frame.
- `data-testid` on the canvas, or `opts.testid`, gives the test ids listed under «Test ids».

## Common to every factory

**Options (all optional):**

| Option | Meaning |
|---|---|
| `ariaLabel` | Title of the chart. Starts the automatic summary in `aria-label`. Defaults: «Serie temporal», «Respuesta al escalón», «Mapa de polos y ceros», «Diagrama de Bode», «Gráfica» |
| `testid` | Base for the test ids. Default: the canvas `data-testid` |
| `legend` | `false`: no legend. An `Element`: the legend goes inside it. Default: inside the frame, above the plot |
| `dataToggle` | `true`: adds the «Ver datos» button and table after the (last) frame. An `Element`: put it there |

**Handle:**

| Member | Description |
|---|---|
| `destroy()` | Destroys Chart.js, removes listeners, observers, timers, legend, tooltip and «Ver datos». Restores the canvas attributes. Every method is a no-op afterwards |
| `resize()` | Asks Chart.js to measure again (normally automatic) |
| `describe(text)` | Fixes `aria-label` to `text` (Bode adds « (magnitud)» / « (fase)»). `describe(null)` returns to the automatic summary |
| `tableSpec()` | `{ caption, columns: [{ key, label, unit?, digits? }], rows }` for `dataTable()` |
| `flush()` | Draws now the final state of this chart's pending changes (tweens completed, a pending off-screen render done and cancelled). Nothing pending: no draw. The gallery calls it when its viewer leaves the screen, so no deferred render happens with the loop stopped |
| `stats()` | `{ updates, pushes, points, tweening, reveal, introPending }` (for tests and performance checks). `reveal` is the left-to-right wipe progress (0…1, 1 when nothing is wiping); `introPending` is true while the first reveal waits for the chart's first appearance on screen |
| `chart` | The Chart.js instance (`null` after `destroy()`). Bode: `charts` = `[magnitude, phase]` |
| `frame`, `frames`, `testid`, `alive` | Read-only |

**Accessibility.** Each canvas gets `role="img"`, `tabindex="0"`, an `aria-label` summary that follows the
data (e.g. «Respuesta al escalón: valor final 1, sobrepaso 16 %, tiempo de pico 1.2 s, … establecimiento 4 s
(criterio 2 %).»), and `aria-describedby` pointing to a hidden keyboard hint: «Con el teclado: flechas para recorrer los datos
(Mayús: de uno en uno), Inicio y Fin para los extremos, Escape para ocultar el detalle. Con lector de
pantalla, active el modo de foco o use «Ver datos».» (`role="img"` is kept, so a screen reader in browse mode
does not pass the arrows to the chart; the hint says how to reach the data). A polite live region
announces the point reached with the keyboard. The time chart updates its summary at most once per second.

**Interaction.**

- Pointer: crosshair (or the nearest mark) plus a glass tooltip (`.ch-tooltip`, tier A). The tooltip stays inside the plot.
- Touch: a tap shows the tooltip; a tap outside the chart hides it.
- Keyboard on the focused canvas: `←`/`→` (and `↓`/`↑`) move through the data in steps of 1/40;
  with `Shift` one sample at a time; `PageUp`/`PageDown` 1/8; `Home`/`End` the ends; `Escape` hides the detail.
  Focus with the keyboard (`:focus-visible`) shows the first point (the last sample on the time chart).
  On the pole-zero map the keys move from marker to marker.
- Legend items are `button[aria-pressed]` (44 px touch target). Pressing one hides or shows that series or annotation.
  A dashed series draws its own pattern in the 22 px key (and in the tooltip key): an array `dash` keeps its
  proportions, scaled so at least two periods fit; `dash: true` is the reference «4 3».

**Theme.** Colours are token names (`'--c-out'`, `'c-out'`, `'var(--c-out)'`). The layer reads them with
`DSL.util.cssVar` and listens to `theme:change` (re-reads every token, `applyDefaults()`, redraws). Curve and
series colours are resolved once per theme and memoised inside the controller's theme object, so `update()`
never calls `getComputedStyle` (which forced a style recalculation after DOM changes); `theme:change` rebuilds
the theme object and with it the memo. Legend and tooltip keys are SVG with `var(--token)`, so they follow the
theme by themselves.

**Motion.** Morph durations come from `--dur-morph` (release, 300 ms) and `--dur-morph-drag` (drag, 120 ms).
The first data set is revealed left to right in 650 ms; poles and zeros fade in over 300 ms. That first
reveal (or fade) **waits for the chart's first appearance on screen** and plays then, once: a chart built
below the fold is still revealed when the visitor reaches it. Until then, off screen, it is drawn complete (for
captures and print). The reveal clip covers every layer drawn under the datasets (stems, bands, annotations
under the curve), so stems never appear before the curve. Later updates morph. With
`DSL.prefs.reducedMotion` there is no reveal, morph or fade, and `motion:change` to reduced finishes what is running.
Chart.js itself never animates (`update('none')`).

**Without Chart.js** every factory returns an inert handle (`inert: true`, every method a no-op, `chart: null`)
and warns once: «[charts] Chart.js no está cargado: las gráficas quedan inertes.»

**Axes.** Linear axes get «nice» ticks anchored at 0 (multiples of 1, 2, 2.5 or 5 × 10ᵏ). A fixed range keeps
its limits but places the ticks on those multiples (`[−15000, 10000]` gives −15000, −10000, …, 10000). The step is
computed by the layer at every render from the range on screen and applied in `afterBuildTicks` (the time, step,
XY and Bode charts no longer pass Chart.js a `ticks.stepSize`; the pole-zero map's shared step is also derived from
the range on screen), so a morph between very different scales never logs «… ticks. Limiting to 1000». Integer axes (`discrete`) never
get steps below 1. Labels with \|v\| ≥ 1e5 anywhere on the axis are compact («−5×10⁵», «2.5×10⁶»; at most 7
characters). The y axis reserves the width of its widest measured label (beyond the 60 px gutter when needed), so
the rotated title never overprints the labels; on Bode both charts take the wider of the two, keeping the plot
edges aligned.

## Theme helpers

| Signature | Returns / notes |
|---|---|
| `theme()` | `{ theme, ink, muted, subtle, grid, axis, plotBg, line, accent, font, fontSize, colors: { in, out, state, pole, zero, ghost, s1…s6 }, stableRegion, unstableRegion, ghostOpacity, lineWidth, refLineWidth, refDash, markerSize, tooltip: { bg, border, blur }, morph: { release, drag } }`, read from the tokens now |
| `color(token)` | Canvas colour for a token; a literal colour passes through; an unknown token gives `'GrayText'` |
| `applyDefaults()` | Sets `Chart.defaults` font, ink, grid colour and line defaults from the tokens. Idempotent; returns `false` without Chart.js |

## `createTimeChart(canvas, opts)`

Real-time series. Samples are kept in the layer's own arrays; Chart.js gets copies when it redraws, at most
`fps` (30) times per second. Pushing never touches Chart.js arrays (Chart.js intercepts `push`/`splice` on its
data and re-processes every element per call). Decimation `min-max` is on.

`opts`: `series: [{ key, label, color = '--c-series-n', dash?, unit? }]` (at most 6), `xLabel = 'Tiempo t (s)'`
(`'Periodo k'` if `discrete`), `xSymbol = 't'`, `xUnit = 's'`, `yLabel`, `window = 10` (seconds; `null` = all),
`yRange = 'auto'` (grows only, never shrinks while running) or `[min, max]`, `maxPoints = 2000`, `discrete = false`
(markers and thin joins), `fps = 30`. A fixed `yRange` already shapes the Chart.js config, so the draw that
Chart.js makes on construction uses that range and its ticks (`'auto'` starts at −1…1 until data arrives).

| Method | Description |
|---|---|
| `push(t, { [key]: number })` | Buffers one sample. A missing or non-finite value is a gap. A `t` smaller than the last one starts a new run (clears) |
| `pushMany(samples)` | `[{ t, values }]`, `[{ t, outputs }]`, `[{ t, x: …, v: … }]` or a ring buffer with `toArray()` |
| `setData(samples)` | Clears, loads and reveals left to right (for a run that is not streaming) |
| `setSeries(series)` | New series (clears) |
| `setWindow(seconds \| null)`, `setYRange('auto' \| [min, max])`, `clear()` | |

With `window`, the x axis is `[max(t0, tLast − window), … + window]`. Without it, the history is thinned by
half whenever it passes `1.1 × maxPoints` (the last sample is kept). Legend for ≥ 2 series (`s:<key>`).
Tooltip: «t = 2.35 s» and one row per series with its unit.

## `createStepChart(canvas, opts)`

`opts`: `xLabel = 'Tiempo t (s)'`, `yLabel = 'Amplitud'`, `xSymbol`, `xUnit`, `showBand = true`, `ghost`.

`update(curves, { ghost = true, annotations, mode = 'release' | 'drag' })`, `clearGhost()`.

- `curves`: `[{ key, label = 'Respuesta y(t)', t: number[], y: number[], color = '--c-out', dash? }]`.
- Morph: the y values go from what is on screen to the new curve (resampled on the new t grid) in
  `--dur-morph` or `--dur-morph-drag`. Axes move with the curve.
- Ghost: the previous curve in the same hue at `--ghost-opacity`, dashed (`--chart-ref-dash`).
- `annotations`: `{ finalValue, band = 0.02, peak: { t, y }, overshootPct?, settlingTime, riseTime: { t10, t90 } }`
  or the `stepInfo` shape. Drawn: y∞ dashed line and label «y∞ = 1», ±2 % band, peak dot with dashed drop
  line, «Mp = 16.3 %» (or «pico …» without `overshootPct`; hidden below 0.05 %), «tp = 1.2 s»,
  «ts = 4 s (2 %)», rise bracket at 0.5·y∞ with «tr = 0.47 s». Labels never overlap: on a small plot the
  less important ones (ts, tp, tr) are left out (the tooltip, summary and table still give them).
  Labels also keep off the current curve: placement first looks for a spot clear of the drawn trace
  (`curveObstacles`, 4 px columns); an optional label with no such spot is left out, a required one (y∞, Mp)
  falls back to the old placement. The drawn labels are kept on the Chart.js instance as `chart.$labels`
  (`[{ text, rect }]`) for tests. The Bode markers («−3 dB: …», «0 dB: …») follow the same rule.
- Legend ids: `c:<key>`, `ghost`, `final`, `marks`.

## `createPoleZeroChart(canvas, opts)`

`update({ poles, zeros }, { mode })`. Roots are numbers or `{ re, im }`.

- Equal 1:1 scale, axes through the origin, jω axis emphasised, left half-plane `--c-stable-region` with
  «Región estable», right half-plane `--c-unstable-region` with «Región inestable».
- Range: symmetric, `1.25 × max |re|, |im|` rounded to a nice step. The grid step is shared by both axes,
  anchored at 0 and at least 24 px; if the measured labels do not fit, one tick in 2, 5, 10, … is labelled
  (0 always), so labels never collide, and the grid stays square (1/(s+1000): steps of 500 with «−1000, 0, 1000»).
- Poles × (`--c-pole`), zeros ○ (`--c-zero`), `--chart-marker-size`, with a halo of the plot colour. Repeated
  roots show a count («2»).
- Motion: roots are sorted (real part descending, then imaginary part descending) and matched by index;
  they move together with the range. New roots fade in.
- Tooltip: «Polo» / «Polos (doble)», rows like «p1 = −1.00 + 2.00j» with «ωn = …, ζ = …» (complex pole),
  «τ = … s» (real, stable), «polo en el origen (integrador)» or «semiplano derecho: modo inestable».
  Summary ends with the verdict: stable, marginally stable or unstable.
- Legend ids: `poles`, `zeros`.

## `createBodeChart(magCanvas, phaseCanvas, opts)`

`opts`: `markers: { minus3dB = false, crossover = false }`, `color = '--c-out'`, `ghost`.

`update({ omega, magDb, phaseDeg }, { ghost = true, mode, markers })`.

- Both charts share a logarithmic ω axis (same min, max and plot left/right edges). Ticks: every 1–9 × 10^k,
  labels on decades only (0.001 … 10000 as plain numbers, beyond that 10⁵, 10⁻⁴), every other decade past
  8 decades, on the phase chart only; minor grid at half alpha. Less than a decade: 2 and 5 are labelled too.
- Magnitude axis «Magnitud (dB)» with nice steps; phase axis «Fase (°)» with steps of 15, 30, 45, 90 or 180°.
- Morph in log ω, ghost of the previous curves, shared crosshair: the tooltip shows ω, magnitude and phase
  (and the previous values while the ghost is visible).
- Markers: «−3 dB: ω = … rad/s» (3 dB below the first, low-frequency magnitude) and «0 dB: ω = … rad/s»
  (first crossing, ignoring a start that already sits at 0 dB), with «∠G = …°» on the phase chart.
- Legend ids: `current`, `ghost`, `minus3dB`, `crossover`.

## `createXYChart(canvas, opts)`

`opts`: `xLabel`, `yLabel`, `aspect = 'auto' | 'equal'`, `xRange`, `yRange`.

`update(datasets, { mode })` with `datasets: [{ key, label, kind = 'line' | 'points' | 'stems' | 'steps' |
'segments', points: [{ x, y }], color, alpha?, dash?, fill?, endMarker? }]`.

- `segments`: consecutive pairs of points are separate segments (the cobweb). `stems`: a stem from y = 0 to each
  point plus a dot. `steps`: a stair line. `endMarker`: a dot on the last point (equilibrium of a portrait).
- Points and stems get their own x margin, so the first and last samples never sit on the axis.
- With the same shape as before (same kinds and lengths) the points morph; otherwise they are replaced.
- Legend for ≥ 2 data sets (`d:<key>`). Tooltip: nearest point within 24 px.
- `setXRange([min, max] | null)` changes the fixed x frame without rebuilding the chart (an open «Ver datos»
  panel stays open). The axes tween like `update()`, and an `update()` right after continues from the frame on
  screen. `null` returns to the automatic frame; the same frame again does nothing. `#conceptos` «Ecuaciones»
  uses it when T changes.

## «Ver datos»

- `dataTable(container, { caption, columns: [{ key, label, unit?, digits? }], rows, maxRows = 200, groupKey? })` →
  `table.ch-table`, replacing the container content (`container` may be `null`). The first column is a row
  header. With no rows: «Todavía no hay datos: ejecute la simulación o cambie un parámetro.»
  - **More rows than `maxRows`.** When the rows carry a series column (`groupKey`, or else the first column
    with text values, as long as it has 2 to 12 distinct values), rows are sampled **per series**: every series
    with at most 60 rows is kept whole and the remaining budget is spread over the dense series (at least 2
    rows each, first and last included). The caption gives the count per series: «… · se muestran 200 de 319
    filas (muestreo por serie: Entrada u = 1 2 de 2; Continuo y(t) 182 de 301; Discreto y[k] 16 de 16)».
    Otherwise rows are sampled uniformly and the caption says «(muestreo uniforme)».
- `dataToggle(handle, { container, label = 'Ver datos', hideLabel = 'Ocultar datos', spec, testid })` →
  `{ el, button, panel, refresh(), open(), close(), toggle(), isOpen(), destroy() }`. The button has
  `aria-expanded` and `aria-controls` and the `table` icon. The table is built when it opens.
  - **An open table follows its chart.** Every data call on the handle (`update`, `setData`, `setSeries`,
    `push`, `pushMany`, `clear`, `setWindow`, `setYRange`) schedules a refresh of the open tables of that chart
    (the one from `opts.dataToggle` and any made with `dataToggle(handle, …)`, own `spec` included): 150 ms
    after the last call, and at most twice per second for a streaming time chart. `refresh()` keeps the panel's
    scroll position and focus and does nothing when the text did not change, so calling it explicitly (as the
    gallery does) is harmless. A closed table costs nothing.

## `flush()`

`DSL.viz.charts.flush()` draws now the final state of every live chart: tweens are completed, pending
off-screen renders happen at once (and are cancelled), and a first reveal still waiting is shown complete (it
will still play when the chart is first seen). The layer calls it on `beforeprint`.

## `helpers` (pure, for tests)

`parseColor`, `withAlpha`, `tokenName`, `niceNum`, `niceBounds`, `phaseBounds`, `symmetricRange`, `logTicks`,
`fmtDecade`, `resample`, `sampleIndices`, `findCrossing`, `sortRoots`, `groupRoots`, `classifyPoles`,
`fmtComplex`, `placeLabels(labels, bounds, avoid?, soft?)`, `curveObstacles(chart, area, pick)`, `normalizeAnnotations`, `lerpAnnotations`, `easeOutCubic`, `nearestIndex`, `liveCount`,
`anchoredTicks(min, max, step, limit, phase) → { step, ticks }`, `tickLabel(value, index, ticks)`,
`compactNumber(v, step)`, `keyDash(dash) → 'a b' | null`, `sampleRows(rows, columns, maxRows, groupKey) → { idx, groups }`.

## CSS hooks

`.ch-frame` (`--ch-aspect`, `--ch-plot-min-height`), `.ch-plot`, `.ch-canvas`, `.ch-legend`,
`.ch-legend--outside`, `.ch-legend__item[aria-pressed]`, `.ch-legend__item.is-unavailable`, `.ch-key`,
`.ch-tooltip.is-visible`, `.ch-tooltip__title|__rows|__row|__value|__label`, `.ch-data`, `.ch-data__toggle`,
`.ch-data__panel`, `.ch-table`, `.ch-sr`. Forced colours use system colours.

## Test ids

With `testid = X`: `X-legend`, `X-legend-<item id with non-word characters as '-'>` (e.g. `X-legend-s-v`),
`X-tooltip` (Bode phase chart: `X-1-tooltip`), `X-data-toggle`, `X-data`.

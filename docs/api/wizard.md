# API: `DSL.sections.wizard` (owner: wizard)

Section 3, `#modelado` («Pasos para modelar un sistema»). It is an animated four-step wizard that
follows one running example, chosen from mass-spring, RLC, tank or SIR. The steps are:

1. «Delimitar el sistema»
2. «Aplicar leyes físicas o principios de conservación»
3. «Formular el modelo matemático»
4. «Simular y validar»

The content comes from each model's `wizard` data in `DSL.systems`. The diagrams are this section's
own SVG.

## Files and dependencies

- **Files:**
  - `js/sections/wizard.js`
  - `css/sections/wizard.css` (`@layer sections`, prefix `wz-`, tokens only)
  - `tools/icons/wizard.list`
- **Required:**
  - `DSL.util`: `h`, `svg`, `uid`, `onVisible`, `observeSize`, `raf`, `cancelRaf`, `formatNumber`, `cssVar`.
    `util.lazyInit` (FND-07) is used when present; without it the wizard falls back to `onVisible`
  - `DSL.ui`: `segmented`, `button`, `slider`, `readout`, `chip`, `collapsible`, `icon`, `announce`
  - `DSL.systems`: `get`, `describe`, `simulate`, `syntheticData`
  - `DSL.bus`
- **Optional:**
  - `DSL.viz.charts.createXYChart`. Without it, step 4 shows no charts and the numbers still work.
  - `DSL.viz.charts.dataToggle`. Without it, the residual chart has no «Ver datos» table.
  - `window.katex`. Without it, rendering falls back to `DSL.core.latex.render`, then to plain text.
  - `DSL.prefs.reducedMotion`
- **Script type:** a classic script (IIFE, `'use strict'`). It defines functions only at load time and
  works from `file://`.
- **Icons:**
  - `activity`, `zap`, `droplets`, `virus`
  - `arrow-left`, `arrow-right`
  - `play`, `pause`, `step-forward`, `list-ordered`, `rotate-ccw`
  - `square-function`, `book-open`
  - `chart-line`, `chart-spline`
  - `circle-check`, `circle-alert`, `info`
- **Tests:**
  - `tests/unit/wizard.test.mjs`: 13 tests on node:test with the fake DOM.
  - `tests/e2e/wizard.spec.mjs`: 33 Playwright tests. Screenshots go to `test-results/wizard/`.
    Fifteen cover the base behaviour. The block «correcciones de la auditoría» holds 18 regression
    tests for WZ-01 … WZ-08:
    - frame-sampled step changes:
      - the target step is prebuilt;
      - the click does at most 30 ms of synchronous work;
      - the animation starts within 250 ms (the browser's first paint of the panel);
      - the change is over 400 ms after the animation starts;
      - the two steps never show together;
    - reduced motion;
    - the stage position after «Ir a…»;
    - term names (axe `button-name`);
    - focus in step 3;
    - the debounced RMSE announcement;
    - the residual table;
    - pixel-sampled and axe contrast in both themes;
    - 44 px coarse-pointer markers;
    - step intros;
    - the height delta when step 1 is built;
    - a stable anchor jump 5 s after load.

## Contract

```js
const handle = DSL.sections.wizard.mount(el);   // el = <div data-mount="wizard"> inside section#modelado
handle.destroy();                                 // stops timers, autoplay, charts, observers; empties el
```

`mount` is cheap. It renders the header, the rail and four empty panels, including
`<h2 id="modelado-title">`.

The current step is initialised in two phases: **build** (`ensureBuilt`) and **enter** (`enterStep`,
which starts the timers and autoplay).

- **With `util.lazyInit`:** the phases are queued as `util.lazyInit(root, [build, enter], { rootMargin: '400px' })`.
  - They run one per idle turn after `app:ready`.
  - If the section comes within 400 px of the viewport first, both run at once.
  - `lazyInit` sets `data-lazy="done"` on the root when it has finished.
- **Without it:** both phases run when the section comes within 400 px (`util.onVisible`, `once`).
- **Height reservation:** while step 1's body is still empty, `.wz-step__body:empty` reserves its measured
  height.
  - The reservation is a `min-height` per container width, fitted to the mass-spring step 1.
  - Building the step therefore changes the section height by only a few pixels, so an anchor jump to a
    later section lands where it should.
  - Building step 1 takes about 6–10 ms.

Each step is built lazily for the current example. If the example changes, the current step is rebuilt
behind a 150 ms fade, and the other steps are rebuilt when the user next enters them.

**Neighbour prebuild:** after a step is entered, its neighbours are built while still hidden, the next
step first and then the previous one.
- Each one is built in its own idle callback (`requestIdleCallback`, timeout 1500 ms; without it, a 200 ms timer).
- The prebuild never runs during a step change; it waits until the change is over.
- A click on «Siguiente» or on an adjacent rail marker therefore builds nothing. A jump to a step that is not adjacent still builds that step on entry.

### Extra handle members (beyond `destroy`)

| Member | Meaning |
|---|---|
| `goTo(i)` | Goes to step `i`, 0-based and clamped to 0–3. Same transition and announcement as the rail, but it does not scroll the page |
| `setExample(id)` | `'massSpring'`, `'rlc'`, `'tanks'` or `'sir'`. Ignores unknown ids |
| `state` | A copy of `{ step, example, fit }`, where `fit[id] = { value, method, dtMul }` |
| `ready` | `true` once the deferred initialisation has run |
| `init()` | Forces the deferred initialisation (for tests and pages without IntersectionObserver). With `lazyInit` it calls `ensure()`, which runs every pending phase |

### Module members

- `DSL.sections.wizard.STEPS`: `[{ id, title, short, intro }]`
- `DSL.sections.wizard.EXAMPLES`: `[{ id, label, icon }]`
- `DSL.sections.wizard.helpers`: pure functions, unit-tested.

| Helper | Meaning |
|---|---|
| `texRuns(tex)` | Converts a small TeX subset into SVG text runs: `[{ text, italic, script: null\|'sub'\|'sup' }]`. The subset covers letters, Greek, `_` and `^`, `\dot`, `\ddot`, `\frac` (as a/b), `\text`, spacing commands, and a typographic minus that may be unary or binary |
| `plainText(tex)` | The plain Unicode text of the same subset (`'\\beta'` → `'β'`) |
| `texReading(tex)` | `plainText` for an accessible name: thin spaces between factors become «·», and `=`, `+` and `−` sit between plain spaces (`'m\\,\\ddot{x}'` → `'m·ẍ'`, `'A\\,\\dot{h} + \\frac{h}{R}'` → `'A·ḣ + h/R'`) |
| `wrapFlows(rowTex, flows)` | Wraps every occurrence of each flow's TeX in `\htmlClass{wz-flow wz-flow--<id>}{…}` |
| `interpAt(xs, ys, x)` | Linear interpolation on an increasing grid. Repeated times are allowed, and values are clamped at the ends |
| `resample(xs, ys, n, t0, t1)` | `n` evenly spaced `{x, y}` points. Their fixed count lets the chart morph between updates |
| `rmseOf(a, b)` | Root mean square error. `NaN` when the input is empty |
| `verdict(rmse, σ)` | Ratio r = RMSE/σ. Returns `{ level, tone, ratio }` (levels and tones listed below the table) |
| `dtText(dt, unit)` | Integration step for display: in ms when the unit is `s` and dt < 10 ms, with U+00A0 before the unit |
| `stepLabel(i, n)` | `'Paso i+1 de n'` |
| `clampInt(i, lo, hi)` | Rounds `i` and clamps it to `[lo, hi]` |

`verdict` levels and tones:

| Level | Condition | Tone |
|---|---|---|
| `ruido` | r ≤ 1.25 | `success` |
| `cerca` | r ≤ 3 | `warning` |
| `lejos` | r > 3 | `info` |
| `fallo` | the RMSE is not finite | `danger` |

## Bus events emitted

The wizard listens to no bus events.

| Event | When | Payload |
|---|---|---|
| `tf:open` | Step 3, «Ver G(s) paso a paso» (linear examples) | `{ systemId, variant, params, outputKey }`. `params` holds the defaults plus the calibrated value; `outputKey` is the first `tfPairs` entry |
| `concepts:open` | Step 3, «Ver «Linealidad vs. no linealidad»» (SIR) | `{ card: 'linealidad', tab: 'superposicion' }` |
| `gallery:open` | Step 4, «Abrir en la galería» | `{ systemId, variant }` |

`DSL.ui.announce` is called for each of these:

- step changes: «Paso N de 4: título.»
- example changes: «Ejemplo en curso: …»
- calibration commits: the RMSE value and the verdict. This announcement is debounced by 450 ms, so a
  run of slider key presses gives one announcement once the value settles. Dragging never announces.

## Behaviour

### Rail

- The rail is `nav[aria-label="Pasos del modelado"]` with four buttons.
- The current step's button has `aria-current="step"`, and the earlier ones have `.is-done`.
- The fill line uses `transform: scaleX(var(--wz-progress))`.

**Keyboard on the rail:**

| Key | Action |
|---|---|
| ← → ↑ ↓ | Move to the previous or next step and focus its button |
| Home / End | Go to the first or last step |

**Keyboard on the panel:**

- ← and → work on the «Ir a: …» buttons and on the step title.
- When a navigation button disappears (step 1 or step 4), focus moves to the step title (`tabindex=-1`).

**Scrolling:**

- A step change from the rail, the panel buttons or the keyboard keeps the stage visible. If the stage
  top is above the bottom of the fixed header, it scrolls to `block: 'start'`; the scroll is smooth,
  or instant under reduced motion.
- `.wz-stage` has `scroll-margin-top: calc(var(--header-h) + var(--space-4))`, so the stage lands just
  under the header.
- `handle.goTo` never scrolls.

### Transitions

The step change is **sequential**: the outgoing panel leaves first and the incoming panel enters
afterwards. The two never show at the same time.

- **Leaving:** the outgoing panel fades and slides out by −dir·`--travel-step` over `--dur-step-out`
  (150 ms), using `--ease-exit`.
- **Entering:** the incoming panel fades and slides in from +dir·`--travel-step` over `--dur-step-in`
  (250 ms), using `--ease-out`.
  - It is delayed by `--dur-step-out`, with fill-mode `both`, so it stays invisible until the outgoing panel has gone.
  - The outgoing panel is hidden after `--dur-step-out`. The class `is-entering` is removed after `--dur-step-out + --dur-step-in + 20 ms`.
- **Layout:** both panels share one grid cell (`align-self: start`), and the outgoing panel is `inert`.
- **Measure first:** before touching the DOM, the step change reads everything it needs in one go (`measureChange()`): the stage rectangle (start height and top), `--header-h`, the reduced-motion flag and the three durations. Layout and styles are still clean at that point, so the reads cost nothing, and the click forces no style or layout work on the incoming panel. The synchronous work of a click is 1–4 ms.
- **Height tween:**
  - The stage height is measured before the change. The stage then gets that height inline and the class `.is-morphing`, which applies `overflow-y: clip` and `transition: height var(--dur-morph)`.
  - The target height is not read synchronously. It comes from the first `ResizeObserver` notification for the incoming panel, which arrives after the frame's own layout; the height is then tweened to it. Without `ResizeObserver`, the target is read at once.
  - The same observer retargets the tween if that panel grows while it enters, for example during the first assembly reveal. The new transition uses the remaining time.
  - `transitionend` clears the inline height. A fallback timer does the same at `--dur-morph + 80 ms` after the tween starts, or at `--dur-morph + 250 ms` if the first notification never arrives.
- **Example change:** the current step body is `inert` during its fade (`--dur-fast`) until it is rebuilt, so a click in that window cannot emit the previous example's payload (integrator: `tf:open` used to carry the previous example).
- **Reduced motion:** the change is instant. No class is added, no animation runs, and no inline height is set.
- **Interruption:** a new transition first finishes the one in progress.

### Linking between the diagram and the list (steps 1 and 2)

- **SVG parts:** each part is `g.wz-part[data-refs="kind:id …"]`. The first ref is the one used on hover.
- **List buttons:** each carries `data-ref`. Hovering or focusing a button previews it, and clicking pins it with `aria-pressed`.
- **Hovering the diagram:** hovering an SVG part previews it and also marks the matching button.
- **Dimming:** while something is highlighted, the SVG gets `.has-hl` and the highlighted parts get `.is-hl`.
  - **Shapes in other parts:** lines, paths, rects, circles and pipes fade to opacity 0.24. In `.wz-base` they fade to 0.45.
  - **Text in other parts:** labels (`wz-tx`, `wz-math`, `wz-sign`, `wz-pol`, `wz-badge__tx`) are never faded with opacity. Their fill changes to `--muted`, which keeps them at or above 4.5:1 on the plot background in both themes.
  - **SIR flow terms:** they use `color: var(--muted)` instead of an opacity of 0.55.
- **Boundary label plate:** each «Frontera del sistema» label sits on a `rect.wz-tag`, filled with `--c-plot-bg`, unstroked and never dimmed. The dashed boundary line therefore never runs through the text.
- **Label over the liquid:** in the tank's step 1, the output label «h» sits inside the liquid, so it gets a plate. Since audit round 2 it is the plate of the scenes' over-water labels (SCN-02, `.sc-tag-bg`): `rect.wz-tag.wz-tag--fluid`, filled with `--c-plot-bg` like the boundary plate, with `rx` 4 and a 1 px edge in the label's colour (`color-mix(currentColor 45%)`, `--c-out`). When another part is pinned only the edge fades (`stroke-opacity: 0.24`); the fill never does. Without a plate the `--c-out` text measured 3.7:1 on the water in the light theme and 4.05:1 (muted, with «Líquido» pinned) in the dark one. With it the ink, measured as in SCN-02, is 8.62:1 (dark) and 5.50:1 (light), and 7.0 / 7.07:1 when another part is pinned (WZ-06 e2e and the round-2 test «la «h» sobre el líquido del tanque (paso 1) lleva la placa de SCN-02…», at 1440 and 390 px).

### Step 2 autoplay

- On the first visit per example, the step walks through the laws (and for SIR, then the loops R1, B1 and B2), 2.3 s each.
- The walk-through is skipped under reduced motion, where the first law is pinned instead.
- «Recorrer…» starts and stops it again.
- A click on any law stops it.

### Step 3: assembly

- The terms appear one by one, 780 ms apart, on the first visit. Under reduced motion they all appear at once.
- «Término siguiente», «Mostrar todo» and «Repetir» control the assembly. The progress text reads «k de n términos», or «k de n piezas» for SIR.
- Clicking a revealed term selects it and shows its detail.
- **Term names:** each term button is named `aria-label="Término k de n: <label lowercased>, <texReading(tex)>"`, for example «Término 1 de 4: inercia, m·ẍ».
  - Its description comes from its own hidden span, referenced by `aria-describedby`, which holds the term's explanation.
  - The names are unique within the equation.
- **Detail cards:** `wz-term-detail` stacks one `.wz-detail__card` per term, plus one card for the empty state, in a single grid cell. Only the card with `.is-shown` is visible, so the panel height does not change while the terms are revealed.
- **Focus:** a button that disables itself never drops focus to `<body>`.
  - When «Término siguiente» or «Mostrar todo» reveals the last term, focus moves to that term.
  - When «Repetir» empties the equation, focus moves to «Término siguiente».
  - Before moving focus, the buttons are re-enabled; their real disabled state is applied afterwards.
- For SIR, selecting a flow sets `data-flow` on the system and highlights that flow in every balance where it appears.

### Step 4: simulation and calibration

- Each recomputation simulates the model with `{ method, dt: hints.dt × dtMul, input: data.input, duration: data.duration }` and interpolates the output at the measurement times.
- From that result it updates:
  - the RMSE;
  - the residuals;
  - the verdict callout;
  - `model.invariants(traj)`.
- Dragging recomputes once per frame (`mode: 'drag'`). Releasing recomputes with `mode: 'release'` and announces the result, debounced by 450 ms.
- **Residual table:** the residual chart has its own «Ver datos» toggle, from `charts.dataToggle` with the test id `wz-residuals`.
  - The caption is «Residuos de la calibración: dato menos simulación en cada instante medido».
  - The columns are «Tiempo t» (4 significant digits) and «Residuo» (3 significant digits), in the example's units, with one row per measured point.
  - The table is refreshed after every `release` recomputation.
- The calibrated value, the method and Δt are kept per example while the page stays open.

## Test ids

All test ids carry the `wz-` prefix.

**Global:**

| Test id | Element |
|---|---|
| `wz-root` | Root. Its attributes include `data-example`, `data-step` (1–4) and `data-fit-level` |
| `wz-example`, `wz-example-<massspring\|rlc\|tanks\|sir>` | Example selector and its options |
| `wz-rail`, `wz-progress` | Rail and its fill line |
| `wz-step-1` … `wz-step-4` | Rail markers |
| `wz-stage` | Stage that holds the panels |
| `wz-panel-1` … `wz-panel-4` | Step panels |
| `wz-count-N` | Number badge, `aria-hidden` |
| `wz-nav`, `wz-prev`, `wz-next` | Panel navigation |

**Step 1:**

| Test id | Element |
|---|---|
| `wz-boundary` | The SVG |
| `wz-legend` | The legend |
| `wz-item-<input\|output\|element\|env>-<id lowercased>` | A legend item, for example `wz-item-output-vc` |
| `wz-item-boundary` | The boundary item |

**Step 2:**

| Test id | Element |
|---|---|
| `wz-laws` | The SVG, for mass-spring, RLC and the tank |
| `wz-stockflow`, `wz-cld` | The two SVGs, for SIR |
| `wz-law-list` | The list of laws |
| `wz-law-<id>` | One law |
| `wz-loop-list` | The list of loops (SIR) |
| `wz-loop-r1`, `wz-loop-b1`, `wz-loop-b2` | One loop |
| `wz-laws-play` | Autoplay button. `data-state` is `playing` or `paused` |

**Step 3:**

| Test id | Element |
|---|---|
| `wz-eq` | Equation. For SIR it also carries `data-flow` |
| `wz-asm` | Assembly area |
| `wz-term-<id lowercased>` | A term, for example `wz-term-ds` |
| `wz-flow-list` | The flows (SIR) |
| `wz-term-next`, `wz-term-all`, `wz-term-replay` | Assembly buttons |
| `wz-asm-count` | Progress text |
| `wz-term-detail` | Detail of the selected term |
| `wz-linear-box`, `wz-linear` | Linearity box and its chip |
| `wz-open-tf` / `wz-open-concepts` | Button that leaves the section |
| `wz-ss-mode`, `wz-ss-mode-sym`, `wz-ss-mode-num` | State-space mode selector |
| `wz-statespace` | State-space equation |
| `wz-ss-values` | Parameter values line |

**Step 4:**

| Test id | Element |
|---|---|
| `wz-fit` | Main chart. Its legend is `wz-fit-legend`. «Ver datos» comes from charts |
| `wz-residuals` | Residual chart. Its «Ver datos» parts are `wz-residuals-data-toggle` and `wz-residuals-data` |
| `wz-calib` | Slider. Its parts are `-input`, `-number`, `-reset` and `-help` |
| `wz-rmse`, `wz-noise` | Readouts. Each value is in `-value` |
| `wz-verdict` | Verdict callout. `data-level` is `ruido`, `cerca`, `lejos` or `fallo` |
| `wz-method-<euler\|heun\|rk4>` | Integration method |
| `wz-dt-<1\|5\|20>` | Step multiplier |
| `wz-invariants` | The list of invariants |
| `wz-inv-<invariant id>` | The chip «Se cumple» / «No se cumple» |
| `wz-data-info` | Collapsible block. Its parts are `-toggle` and `-region` |
| `wz-open-gallery` | Button that opens the gallery |

## CSS hooks

**Layout:**

- `.wz`: container query `wz`.
- `.wz-grid` is two columns (7fr / 5fr) from a container width of 880 px; its first column is sticky there. Variants: `--asm`, `--sim`.
- At or below 560 px:
  - the example options become a 2 × 2 grid;
  - each diagram keeps a minimum width of 480 px inside a frame that scrolls sideways (the frame gets `tabindex=0` only while it scrolls);
  - the step-number badge is hidden.
- Below 880 px, the calibration controls sit between the fit chart and the residual chart.
- On phones (media query below 768 px), the rail shows only the label of the current step.
- Under `pointer: coarse`, each rail marker `.wz-mark` is at least `--control-h-sm` tall (44 px).

**Motion and state:**

| Hook | Meaning |
|---|---|
| `.wz-stage.is-morphing` | A height tween is running |
| `.wz-step.is-leaving` | The outgoing panel |
| `.wz-step.is-entering` | The incoming panel, delayed by `--dur-step-out` |
| `.wz-step__body:empty` | Step 1 is not built yet; it reserves the measured height |
| `.wz-detail__card.is-shown` | The visible detail card in step 3 |
| `rect.wz-tag` | The plate behind the boundary label |
| `rect.wz-tag.wz-tag--fluid` | The plate behind the tank's «h» over the liquid (SCN-02 recipe: fill plus a 1 px edge in the label's colour) |

**SVG vocabulary:**

| Group | Classes |
|---|---|
| Strokes | `wz-ln` (`--el`, `--env`, `--wire`, `--thick`, `--plate`, `--wall`) |
| Shapes | `wz-shape` (`--env`, `--src`), `wz-bd` (dashed boundary), `wz-cv` (control volume) |
| Arrows | `wz-a` (`--in`, `--out`, `--dash`, `--force`, `--info`, `--link`, `--loop`, `--dim`, `--muted`) |
| Text | `wz-tx` (`--env`, `--bd`, `--sm`, `--node`), `wz-math`, `wz-it`, `wz-sym` (`--in`, `--out`, `--lg`, `--sm`) |
| Signs | `wz-sign`, `wz-pol` |
| Loop badges | `wz-badge`, with variants `wz-badgep--R` and `wz-badgep--B` |
| Fluids | `wz-liq`, `wz-surf`, `wz-jet` |
| Hydraulics | `wz-pipe`, `wz-valve` |
| Stocks and flows | `wz-stock`, `wz-flowpipe` |

## Deviations from the brief and from ARCHITECTURE

- **Extra test file:** `tests/unit/wizard.test.mjs`, which follows the `tests/unit/<key>.test.mjs` convention.
- **Extra handle members:** `goTo`, `setExample`, `state`, `ready` and `init`.
- **Extra module members:** `helpers`, `STEPS` and `EXAMPLES`.
- **Verdict:** the threshold rule (RMSE/σ ≤ 1.25 means «at noise level») is this section's own pedagogical choice.
- **Synthetic data:** the measured data comes from `DSL.systems.syntheticData`, which is seeded and deterministic. The wizard caches it per example.

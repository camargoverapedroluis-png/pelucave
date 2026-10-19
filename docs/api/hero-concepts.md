# API: `js/sections/hero.js` and `js/sections/concepts.js` (owner: hero-concepts)

Sections `#inicio` (PRODUCT_SPEC §2.1) and `#conceptos` (§2.2). Both are classic scripts (IIFE on
`window.DSL`, `'use strict'`). Their styles live in `css/sections/hero.css` (prefix `hero-`) and
`css/sections/concepts.css` (prefix `cc-`). Both style files use `@layer sections`, tokens only and
selectors no more specific than 0,2,0. Icons are listed in `tools/icons/hero-concepts.list`. Tests are
`tests/unit/hero-concepts.test.mjs` (pure helpers, node) and `tests/e2e/hero-concepts.spec.mjs`
(Playwright, which also writes screenshots to `test-results/hero-concepts/shots/` and holds the audit
regressions HC-01 to HC-12).

**Numbers come from the engine.** Every curve and every value comes from `DSL.core`:
- `numeric.integrate` with Euler, Heun, RK4 and RK45, plus `numeric.eulerStep`;
- `tf.TransferFunction` with `step`, `impulse` and `stepInfo`;
- the `DSL.systems` models `tanks` (variants `lineal` and `torricelli`) and `pendulum` (variant `nolineal`).

Nothing is a canned image. The hero's closed-form step response is checked against `DSL.core.tf` in the
unit tests.

---

## `DSL.sections.hero`

```js
DSL.sections.hero = { mount(el) → handle, helpers };
```

`mount(el)` renders, inside `el`:
- `.hero` (a full-bleed flex box with `min-height: 100svh − header`);
- `canvas.hero-canvas[aria-hidden]`;
- `h1#inicio-title.hero-title` («Sistemas que cambian con el tiempo»), the page's only h1;
- `p.hero-lead` (with a KaTeX `G(s)`);
- two CTAs:
  - `a.ds-btn.ds-btn--primary[href="#galeria"]` «Simular un sistema»;
  - `a.ds-btn[href="#transferencia"]` «Obtener G(s) paso a paso».
  The shell handles both clicks (`scrollTo` + focus).
- `.hero-stage`, which holds `.hero-note`: the pause button and the caption.

`mount` is cheap: it builds the DOM, does one measure and one draw, and starts the loop. There are no
invented metrics.

**Background.** A conjugate pole pair moves around the s-plane:
- ζ = 0.5 − 0.38·cos(2πt/32), between 0.12 and 0.88;
- ωn = 1 + 0.12·sin(4πt/32).

Each pole leaves a short trail, and the ωn = 1 circle and the damping lines are drawn. Below the plane, the
step response y(t) is drawn with:
- its envelope 1 ± e^(−σt)/√(1−ζ²);
- three ghost curves from earlier times;
- y∞ = 1.

**Alignment with the backdrop.** The figure's origin is snapped onto the static s-plane drawn by
`body::before`:
- `layoutFigure` reads `--plane-x` and `--plane-y` from `getComputedStyle(body, '::before')` (fallbacks:
  64vw/30svh, or 70vw/22svh below 768 px);
- it uses a 160 px major grid.

When the origin cannot coincide with the backdrop's origin, it falls on another major-grid intersection.

**Cost.**
- Rendering:
  - one `DSL.util.loop` bound to the hero element, so it pauses off-screen and while the tab is hidden;
  - draws are capped at 30 fps;
  - only the figure's bounding box is cleared;
  - a draw takes about 1 ms.
- Reduced motion (`DSL.prefs.reducedMotion`, `motion:change`): the loop stops, a static frame is shown at
  t = 5.18 (ζ ≈ 0.30), and the pause button is hidden.
- The pause button toggles the user's pause. Its `aria-label` switches between «Pausar la animación del
  fondo» and «Reproducir la animación del fondo», and its `data-state` between `playing` and `paused`.
- `theme:change` re-reads the colour tokens and redraws.

| Handle member | Description |
|---|---|
| `destroy()` | Stops the loop, the size observer and the bus subscriptions, and removes the DOM. Idempotent |
| `pause()` / `play()` | The user's pause, the same as the button |
| `isRunning()` / `isActive()` | Whether the loop is wanted, and whether it is ticking (it is not when off-screen or hidden) |
| `setTime(t)` | Jumps the background to time `t` and redraws (for tests) |
| `stats()` | `{ frames, draws, avgDrawMs, time, zeta, wn, zetaText, running, active, userPaused, layout }` |

**`helpers` (pure):**
- `pole(t)` returns `{ zeta, wn, re, im }`.
- `stepResponse(zeta, wn, t)` is the closed-form unit-step response of ωn²/(s²+2ζωn s+ωn²) for the
  underdamped, critical and overdamped cases.
- `snapAxis(pref, lo, hi, step)` returns the value pref + k·step closest to `pref` inside [lo, hi], or `null`.
- `layoutFigure({ slot, plane, grid, rMax, rMin })` returns
  `{ ox, oy, R, mode: 'vertical'|'horizontal', aligned: { x, y }, resp, label, bottom, bbox }`.
- `parseLen(str, vw, vh, axis)` converts `vw`, `svh`/`vh`, `px` or `%` to px.
- `constants` is `{ PERIOD, TRAIL, T_START, GRID, T_WIN }`.

**Test ids:** `hero-canvas`, `hero-lead`, `hero-cta-galeria`, `hero-cta-transferencia`, `hero-stage`,
`hero-pause`, `hero-caption`.

---

## `DSL.sections.concepts`

```js
DSL.sections.concepts = { mount(el) → handle, helpers };
```

`mount(el)` renders `div.cc` containing:
- `header.cc-head`, with `h2#conceptos-title` «Conceptos fundamentales» and a lead;
- `.cc-grid`, with four `article.ds-card.cc-card[data-card]` cards (`tabindex="-1"`, `aria-labelledby`
  pointing at their h3).

**Mount and initialisation**
- `mount` builds the DOM and the cheap texts of every card: the equations with the current values, the
  block-diagram values, the readouts and the verdicts. It then renders all the KaTeX of the section, which
  is synchronous, before the section is attached. Two things follow:
  - when `html[data-ready]` is set, the accessibility tree holds no raw TeX;
  - each card already has its final height.
- The heavy work of each card (data, charts, canvases, loops) is split into **phases**. They run through
  `DSL.util.lazyInit(card, phases, { rootMargin: '200px' })`, or through the local fallback `localLazy` with
  the same contract when `lazyInit` is missing:
  - once the card is within 200 px of the viewport, every pending phase runs;
  - otherwise the phases run one per idle callback, starting shortly after `app:ready`.
  - The card's `data-lazy` attribute moves from `pending` to `done` (or to `error` if a phase throws). Every
    card is `done` within 5 s without scrolling.
  - Each phase catches and reports its own error. Measured phases take 4–50 ms, the largest being the
    creation of a chart, so the idle preparation makes no long task above 120 ms.
- `open()` and `initAll()` call the handle's `ensure()`. That runs the pending phases synchronously, so
  `open` still returns with the card ready.

  | Card | Phases |
  |---|---|
  | `sistema` | 1: data, canvases sized, glyphs, size observer, loop |
  | `tiempo` | 1: oscillator data, canvases and surfaces, size observer |
  | `ecuaciones` | 1: create the chart in its final x frame; 2: draw |
  | `linealidad` | 1: superposition chart; 2: draw it; 3: pendulum reference and its error (cached); 4: the methods table (its chart is created when the tab is shown) |

- `DSL.ui.reveal(grid, { items: '.cc-card', stagger: 90 })` gives the staggered reveal (0, 90, 180 and
  270 ms). There is no reveal under reduced motion.

**Grid** (container query on `.cc`):

| Container width | sistema | tiempo | ecuaciones | linealidad |
|---|---|---|---|---|
| ≥ 1200 px | 7 | 5 | 12 | 12 |
| < 1200 px | 12 | 12 | 12 | 12 |

- Inside a card (container `cc-card`), text and controls sit on the left and the figure on the right once
  the card is at least 820 px wide.
- `tiempo` does this from 700 px:
  - columns are 5fr / 7fr, with areas `text text` / `eqs fig` / `side fig`;
  - the oscillator stretches to the height of the left column, with a minimum of 264 px;
  - at 1024 px the oscillator is about 500 px wide.
- The 1440 px and 390 px layouts are unchanged.

**Reserved geometry.** Heights change by 8 px or less when a card is prepared, and the empty space under the
last child stays at 48 px or less.
- `.cc-chart` has `min-height: max(100cqi · 9/16, 280px)`. The minimum is 330 px for the superposition
  chart, which has a five-entry legend. Below a 480 px figure width the minimums are 320 and 392 px.
- `[data-chart="pending"]::after` reserves the «Ver datos» row until the chart exists.
- `.cc-bd__value` has a minimum height.

**Typography.** Card titles use `--text-lg` (24 px) with `text-wrap: balance`; the h2 stays at 36 px. The
lead uses the same size, line height and colour as `.gl-lead` (`--text-base`, `--lh-body`, `--muted`).

| Card (`data-card`) | Title (h3) | Live figure |
|---|---|---|
| `sistema` | ¿Qué es un sistema dinámico? | See below |
| `tiempo` | La variable independiente: el tiempo *t* | See below |
| `ecuaciones` | Ecuaciones de representación | See below |
| `linealidad` | Linealidad vs. no linealidad | Tabs `superposicion` and `metodos`, described below |

**`sistema`**
- An HTML block diagram (`cc-bd`, `data-loop="open|closed"`) whose nodes are:
  - u(t), as a sparkline;
  - the system: a mass–spring–damper schematic, with the state readout x = (y, ẏ). The readout value is
    always on its own line under the TeX (`.cc-bd__state` is a column), so the diagram's height never
    depends on the numbers: before, the value wrapped to a second line at some widths while playing, the
    diagram resized, and every resize re-ran `measure()` (2 forced layouts each, 8–14 in a 3 s playback);
  - y(t), as a sparkline;
  - the controller u = K(r − y).
- In open loop the controller block is shown as inactive with a dashed `--line-strong` border, a transparent
  background and `--muted` text, **never with opacity**. Its text contrast is at least 4.5:1 in both themes
  (about 7:1 measured), and axe reports no colour-contrast issue on the card.
- The canvases are `role="img"` with an `aria-label`. They are `aria-hidden`, because the diagram text says
  the same thing.
- The k, b and m labels of the schematic are pre-rendered on offscreen surfaces and stamped with
  `drawImage`.
- An SVG wire overlay is measured from the nodes' rects. It is horizontal when the figure is at least 520 px
  wide and vertical otherwise.
- The data come from `tf.step` and `tf.impulse`:
  - open loop: 2/(s²+1.2s+2), so y∞ = 1;
  - closed loop (K = 6, r = 1): 6/(s²+1.2s+8), so y∞ = 0.75.
- A playhead sweeps the response once: on first visibility, on each toggle, or on «Reproducir».
- The «Realimentación» toggle swaps the KaTeX equation and the `stepInfo` readouts, and announces them.

**`tiempo`**
- A free damped oscillator (m = 1, b = 0.5, k = 6, x(0) = 0.2 m), computed by RK45 at rtol 1e-10 on 1001
  points.
- On the canvas, the hanging mass moves with x(t) and the trace grows up to t.
- **Frame loop (`timeFrame`): no layout reads.**
  - The geometry, the canvas size and the dpr are cached by the size observer. The backing store is the CSS
    size × dpr, refitted on every resize.
  - The static layer (axes, grid, ticks), the mass sprite and the «t = … s» label are drawn on offscreen
    surfaces (`OffscreenCanvas`, or a detached canvas) and composed with `drawImage`. Text drawn on an
    in-document canvas would force style and layout.
  - Each frame draws the canvas first and then writes the DOM (slider, readouts).
  - Measured: 0 forced layouts from the loop in 3 s, at about 60 fps.
- Controls:
  - the `t` slider (0–10 s). Dragging it pauses playback, and so does focusing or typing in its number
    field (`onEditStart` plus `focusin`); a typed value is never overwritten by the loop;
  - Play/Pause;
  - the x(t) and ẋ(t) readouts.
- The canvas `aria-label` states t and x.

**`ecuaciones`**
- dy/dt = −a·y + a·u, shown next to y[k+1] = y[k] + T(−a·y[k] + a·u[k]):
  - the continuous curve comes from `tf.step`;
  - the discrete one comes from `numeric.eulerStep`.
- Sliders a (0.2–3 1/s) and T (0.05–2.5 s). The sequence is drawn as stems or as steps (`segmented`).
- **x frame:**
  - `eqFrame(tEnd)` = [−0.03·tEnd, 1.03·tEnd], passed as `xRange`;
  - it is identical for stems and steps, and the last point sits about 2.8 % from the right edge of the
    plot area;
  - it follows `tEnd` through the chart's `setXRange` (charts.js provides it since the audit regression
    pass), so the chart is never recreated and an open «Ver datos» panel stays open. With an older charts
    layer without `setXRange`, the chart is recreated with the new frame on release, keeping the old frame
    while dragging.
- The input u = 1 is drawn with the [6, 4] dash.
- Readouts: aT and z = 1 − aT. Verdict callout (`data-tone`):

  | Condition | Verdict |
  |---|---|
  | aT < 1 | monotone |
  | aT = 1 | one step |
  | 1 < aT < 2 | oscillating |
  | aT = 2 | undamped |
  | aT > 2 | diverges |

  The boundaries use a tolerance of 1e-9. A diverging sequence is cut once |y| > 6.

**`linealidad` → `superposicion`**
- Tanks:
  - Torricelli (A = 0.5, a = 0.01, q₀ = 0.03);
  - the equivalent linear tank, with R = 2h₀/q₀ ≈ 30.58 s/m².
- Inputs: u₁ is a step and u₂ a 30–70 s pulse (in L/s). The integration is piecewise RK4 at dt = 0.1 s with
  breaks at the discontinuities.
- Chart series, distinguishable without colour:

  | Series | Stroke |
  |---|---|
  | Desajuste y(u₁ + u₂) − (y₁ + y₂) | solid, filled |
  | Respuesta a u₁ | solid |
  | Respuesta a u₂ | dash [2, 3] |
  | Respuesta a u₁ + u₂ | dash [8, 3] |
  | Suma y₁ + y₂ | dash [6, 4] |

- Readouts: the maximum |y(u₁+u₂) − y₁ − y₂| and the maximum |y(2u₁) − 2y₁|. Both are about 1e-16 for the
  linear tank and about 9 % and 12 % (relative) for the Torricelli tank.
- Verdict (`cc-sup-verdict`, `data-tone`):
  - `success` «Se cumplen las dos propiedades.»;
  - `warning` «No se cumplen.»;
  - `neutral` when u₁ = 0 or u₂ = 0: «Con una entrada nula la prueba es trivial: elija dos entradas
    distintas de cero.» This tone has no modifier class and no title.

**`linealidad` → `metodos`**
- The pendulum θ̈ + (g/L)·sin θ = 0 (L = 1, c = 0), with θ₀ from 10° to 170° and a log-scale h from 0.005
  to 0.5 s.
- **Reference.** RK45 at `rtol` 1e-13 and `atol` 1e-15.
  - It is evaluated once on the union of the h and h/2 grids, which are the same for the three methods, so
    each method is compared on its own grid.
  - The reference's error is estimated once per θ₀ (`pendulumReference`, cached for 32 angles) as
    max |θ(rtol 1e-13) − θ(rtol 1e-12)| on 401 points.
- **Observed order** log₂(e(h)/e(h/2)), from `observedOrder(eh, eh2, floor)` with floor = 100 × the
  reference error. It is shown only when:
  - both errors are above the floor, and
  - e(h)/e(h/2) ≥ 1.

  Otherwise the cell shows «—» and a `.cc-num-why` note:

  | `orderNote` | Note |
  |---|---|
  | `ref` | «error en el nivel de la referencia» |
  | `growth` | «el error no baja al reducir h» |
  | `nofinite` | «sin un error finito» |

  - A negative order is never shown.
  - The table note keeps «Se acerca al orden teórico solo cuando h es pequeño». It also explains the «—» and
    states the reference error for the current angle (`cc-num-referr`).
  - Typical values: θ₀ = 30°, h = 0.005 gives 1.11 / 2.00 / 4.00. θ₀ = 80°, h = 0.005 gives 1.15 / 1.94 /
    «—».
- Table:
  - the theoretical order, in KaTeX;
  - the number of f evaluations;
  - the maximum error in rad;
  - the observed order;
  - the energy drift.
  - Each row starts with an SVG key that repeats the method's stroke.
- Chart strokes: Referencia RK45 [6, 4], Euler [8, 3], Heun [2, 3], RK4 solid. Curves that leave
  ±(1.5·amplitude + 0.05) are cut at the edge.
- The comparison takes about 25–60 ms at the default values, and up to about 200 ms at h = 0.005.

**`concepts:open { card, tab? }`**
- Prepares the card synchronously (`ensure()`) and selects the tab (`superposicion` or `metodos`).
- Adds `is-highlight` (accent border) for 1.8 s.
- Focuses the tab button, or the card when no tab is given, with `preventScroll`.
- Scrolls so the card's untransformed top sits at its `scroll-margin-top` (header + 16 px): smooth, or
  instant under reduced motion. The `ds-reveal` translateY is subtracted, so the card does not end up under
  the header once the reveal finishes.
- **Keeps it aligned:**
  - on `scrollend` (or after 1.6 s; 0.7 s without `scrollend`), it re-aligns if the card's top is outside
    [header, header + 40 px];
  - it then re-aligns once more on the next change of the document's size within 1.5 s, for example
    sections above preparing lazily;
  - `wheel`, `touchstart`, `keydown` or `pointerdown` from the user cancels both.
- The result is the same from the wizard (`wz-open-concepts`), the engine and the gallery.

The shell's own handler, subscribed first, scrolls to `#conceptos`, and this one refines the position.

| Handle member | Description |
|---|---|
| `destroy()` | Removes observers, loops, charts, components, lazy handles, the alignment watcher and bus subscriptions, and the DOM. Idempotent |
| `open({ card, tab })` | The same as `concepts:open`, synchronous. Returns `false` for an unknown card |
| `initAll()` | Runs every pending phase of every card (`ensure()`) |
| `stats()` | `{ phases: [{ card, phase, start, ms }] }`: the phases run so far, with their `performance.now()` start and duration |
| `state()` | `{ sistema: { ready, closed, tau, playing, final, overshoot, settling }, tiempo: { ready, t, playing, x, v }, ecuaciones: { ready, a, T, view, aT, z, verdict, samples, truncated, frame }, linealidad: { ready, tab, superposition: { variant, maxMismatch, relMismatch, maxProp, relProp } \| null, methods: { h, theta0, refError, rows: [{ id, maxErr, finalErr, order, orderNote, fevals, drift }] } \| null } }` |

**`helpers` (pure, usable in node with `tests/helpers/load.mjs`):**

| Helper | Returns |
|---|---|
| `feedbackModel(closed)` | `{ closed, t, y, v, u, info: stepInfo, wn, zeta }` |
| `oscillator()` | `{ t, x, v, stats }` |
| `sampleUniform(arr, T, t)` | The linear interpolation of `arr`, which is sampled uniformly on [0, T] |
| `discreteVerdict(aT)` | `{ key: 'monotona'\|'unpaso'\|'oscilante'\|'limite'\|'diverge', tone, z, title, text }` |
| `firstOrder(a, T)` | `{ a, T, aT, z, tEnd, cont: { t, y }, disc: { k, t, y }, truncated, verdict }` |
| `eqFrame(tEnd)` | `[−0.03·tEnd, 1.03·tEnd]`, the x frame of the `ecuaciones` chart |
| `tankParams(variant)` | The tank parameters for that variant |
| `runTank(variant, uFn, breaks)` | `{ t, y (= h − h0), h0 }` |
| `superposition(variant, A1, A2)` | `{ t, y1, y2, y12, sum, mismatch, maxMismatch, relMismatch, maxProp, relProp, linear }`. `A1` and `A2` are in m³/s |
| `pendulumReference(theta0)` | `{ t, theta, steps, fevals, error }`: the reference on 401 points and its estimated error (cached) |
| `observedOrder(eh, eh2, floor)` | `{ order, note }`, where `note` is `null`, `'ref'`, `'growth'` or `'nofinite'` |
| `methodsComparison(h, theta0, { orders })` | `{ h, theta0, methods: [{ id, label, theoretical, order, orderNote, halfErr, t, theta, maxErr, finalErr, drift, maxAbs, fevals, steps, success }], ref: { t, theta, steps, fevals, error }, refError, orderFloor, E0 }` |
| `plotLimit(result)` | The chart's clipping limit |
| `clipSeries(t, y, lim, maxPts)` | `[{ x, y \| null }]`: the first point out of range sits on the edge and the rest are gaps |
| `constants` | `{ SYS, OSC, TANK, PEND, METHODS }`. `PEND` is `{ L, c, T, refRtol: 1e-13, refAtol: 1e-15, estRtol: 1e-12, estAtol: 1e-14, refFactor: 100, maxSteps, nPlot }` |

**Test ids:**

| Card | Ids |
|---|---|
| Section and cards | `concepts`, `cc-grid`, `cc-card-<id>` |
| `sistema` | `cc-bd`, `cc-bd-u`, `cc-bd-y`, `cc-bd-x`, `cc-sys-eq`, `cc-sys-feedback` (role switch), `cc-sys-play`, `cc-sys-final`, `cc-sys-mp`, `cc-sys-ts` |
| `tiempo` | `cc-time-canvas`, `cc-time-eq`, `cc-time-play`, `cc-time-t` (slider) and `cc-time-x`, `cc-time-v` |
| `ecuaciones` | `cc-eq-cont`, `cc-eq-disc`, `cc-eq-num`, `cc-eq-a`, `cc-eq-T`, `cc-eq-view` (`-tallos`, `-escalera`), `cc-eq-aT`, `cc-eq-z`, `cc-eq-verdict`, `cc-eq-chart` |
| `linealidad` (tabs) | `cc-lin-tabs` (`-superposicion`, `-metodos`), `cc-panel-superposicion`, `cc-panel-metodos` |
| `linealidad` (superposición) | `cc-sup-system` (`-lineal`, `-torricelli`), `cc-sup-eq`, `cc-sup-u1`, `cc-sup-u2`, `cc-sup-mismatch`, `cc-sup-prop`, `cc-sup-verdict`, `cc-sup-chart` |
| `linealidad` (métodos) | `cc-num-eq`, `cc-num-h`, `cc-num-theta0`, `cc-num-table`, `cc-num-{fevals,err,order,drift}-{euler,heun,rk4}` (an order cell may hold `.cc-num-why`), `cc-num-referr`, `cc-num-chart` |

Readouts and sliders add the design-system suffixes (`-value`, `-number`, `-reset`, `-help`). Charts add
`-legend`, `-data-toggle` and `-data`. Every chart canvas is `role="img"` with an `aria-label` from the
moment it is created.

**Dependencies**
- `DSL.util`: `h`, `svg`, `loop`, `onVisible`, `observeSize`, `fitCanvas`, `cssVar`, `formatNumber`, `raf`,
  `debounce`, `uid`, and `lazyInit` when present.
- `DSL.ui`: `slider` (with `onEditStart`), `segmented`, `tabs`, `toggle`, `readout`, `icon`, `announce`,
  `reveal` and `tooltips`.
- `DSL.viz.charts.createXYChart` (`xRange`, array `dash`), and `setXRange` when the chart offers it.
- `DSL.core.latex.renderInto` and `latex.num`.
- `DSL.systems.get('tanks')`, `DSL.systems.get('pendulum')` and `DSL.systems.G`.
- Tokens: `--c-in`, `--c-out`, `--c-state`, `--c-pole`, `--c-zero`, `--c-axis`, `--c-grid`, `--muted`,
  `--ink`, `--accent`, `--line-strong`, `--surface-3`, `--c-plot-bg` and `--font-body`.
- `OffscreenCanvas` (optional; a detached canvas is used without it).

# API: `DSL.viz.scenes` (owner: scenes)

Animated physical scenes: one SVG per scene, built once per size/scale and updated each frame by
attributes and transforms only. Five scenes are registered, in this order: `massSpring`, `tanks`,
`rlc`, `sir`, `market`.

- **Files:** `js/viz/scenes/registry.js` (registry + shared kit), `massSpring.js`, `tanks.js`,
  `rlc.js`, `sir.js`, `market.js`. Styles: `css/scenes.css` (`@layer scenes`, tokens only).
- **Depends on** `DSL.util` (ns.js: `svg`, `h`, `uid`, `observeSize`, `formatNumber`, `clamp`,
  `mulberry32`, `gaussian`) and `DSL.prefs.reducedMotion`. `DSL.systems` is optional: a model is
  only read for `hints().yRange`, `params()[].display` and (Torricelli) `deriv`.
- Classic scripts (IIFE, `'use strict'`), loaded after ns.js and before the sections; work from `file://`.
- **Icons:** none (`tools/icons/scenes.list` is empty on purpose).
- **Tests:** `tests/unit/scenes.test.mjs` (node:vm + fake DOM, 22 tests) and `tests/e2e/scenes.spec.mjs`
  (Playwright on `tests/pages/scenes.html`, 24 tests: captures, structure/a11y, theme tokens, text
  collisions wide and at 320 px, reduced motion, the real catalogue through `DSL.systems.simulate`,
  edge cases (market readouts in the millions and equilibrium at the origin: slots, collisions, cobweb
  inside the frame; pixel-sampled contrast of the tank labels over water in both themes), frame cost).

## Differences from `docs/ARCHITECTURE.md` §11

The contract holds (`register`, `create`, `has`, `list`; `render`, `setVariant`, `resize`, `destroy`).
Additions and precisions:

1. **Extra instance members:** `el` (the `<svg>`), `testid`, `summary()` (Spanish text summary of the
   last painted frame, recomputed on call). `setVariant` exists on every scene.
2. **Extra options:** `testid` (base for data-testids, default `sc-<sceneId>`) and `live`
   (`true` → the summary node gets `aria-live="polite"`; default off, a scene never announces every frame).
3. **Extra DOM:** besides the `<svg class="sc-root">`, the scene appends a visually hidden
   `<p class="sc-summary">` to the container, referenced by `aria-describedby`. `destroy()` removes both.
4. **`DSL.viz.scenes.kit`** is public (shared helpers for the scene files; see *Kit*). Not needed by sections.
5. **Sizing help:** `.sc-stage` (ours) gives a container with `aspect-ratio: var(--sc-aspect, 16/10)` and
   `min-height: var(--sc-min-height, 260px)`; the `tanks/cascada` variant raises the minimum to 330 px
   (`:has()`), because two stacked tanks need the height. Any other sized container also works.
6. **Theme:** no `theme:change` subscription is needed. Every color is a token applied through CSS
   classes, so a theme switch restyles the scene without a redraw.
7. **Text refresh:** numeric labels are re-formatted at most 10 times per real second (and on every
   frame with `dt = 0`); the summary at most every 0.5 s (and whenever `t` or params change with `dt = 0`).
   These string updates are the only allocations of `render()`, and they happen at ≤ 10 Hz.

## Usage

```js
var inst = DSL.viz.scenes.create('tanks', stageEl, {
  model: DSL.systems.get('tanks'),   // or the id 'tanks'; optional
  variant: 'torricelli',
  params: sim.params,
  testid: 'gallery-scene'            // optional
});
inst.render({ t: t, dt: realDt, state: x, outputs: y, params: p, input: { type: 'escalon', value: u }, variant: 'torricelli' });
inst.setVariant('cascada', paramsOfCascada);   // rebuilds; next render starts a new run
inst.resize();                                 // optional: the scene also observes its container
inst.destroy();
```

```html
<div class="sc-stage" style="--sc-aspect: 4 / 3"></div>
```

### `create(id, container, opts)`

| Option | Meaning |
|---|---|
| `model` | Model object or model id (resolved with `DSL.systems.get`). Optional |
| `variant` | Variant id. Defaults: `massSpring` `base`, `tanks` `lineal`, `rlc` `serie`, `sir` `base`, `market` `telarana` |
| `params` | `{ key: number }` (SI). Copied |
| `testid` | Base data-testid (default `sc-<sceneId>`) |
| `live` | `true`: the summary is a polite live region |

Throws (Spanish) on an unknown id, a missing container, a duplicate `register` or a non-function factory.

### `render(frame)`

`frame = { t, dt, state, outputs, params, input: { type, value }, variant }`, as in §11.

- **`dt`** is real seconds since the last render (not simulated time). It drives only decorative
  motion. It is clamped to [0, 0.1]. `dt = 0` repaints the same instant (decor does not move).
- **New run:** `t` smaller than the last `t` resets the sticky scales (and the cobweb history).
- **Params / variant:** a frame whose `params` differ (by value) from the current ones, or whose
  `variant` differs, rebuilds the scene. A rebuild costs much more than a frame: do not change params every frame.
- **Values:** each scene reads `outputs[key]` first and falls back to `state[index]` (keys below).
  Non-finite values are treated as 0 (never `NaN` in the DOM or the summary).
- **Sticky scales:** rulers, tank capacity, flow and current references only grow during a run
  (headroom 1.1–1.3, rounded up to 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). Growing rebuilds the SVG
  once. The base comes from `model.hints(params, variant).yRange[key]` when available.
- Before the container has a size, `render()` stores the frame and paints it when the size arrives.

### Reduced motion

With `DSL.prefs.reducedMotion` (read on every frame, so it follows the live preference) the scenes
use `dt = 0` for decor: current dots, flow particles, surface waves, splashes and falling streaks stop,
and the cobweb draws its last segment at once. State stays visible: positions (the wheels turn with the
displacement, not with time), levels, fills, the current direction arrow, the excess-demand arrow and the
population grid (its color fade, `--dur-toggle`, is removed too).

## Accessibility and test ids

- `<svg class="sc-root sc-<cls>" role="img" aria-label="<name>. <summary>" aria-describedby="<summary id>" data-testid="<testid>" data-variant="<variant>" focusable="false">`.
- `<p class="sc-summary" id="…" data-testid="<testid>-summary">` holds the same Spanish summary
  (numbers with «.», SI units with a no-break space, typographic minus).
- Extra ids: `<testid>-mass` (massSpring moving group), `<testid>-grid` (sir population grid).
- Accessible names: «Escena del sistema masa-resorte-amortiguador», «Escena de un tanque con descarga
  lineal | de Torricelli», «Escena de dos tanques en cascada», «Escena del circuito RLC serie»,
  «Escena del modelo epidémico SIR», «Escena del modelo de la telaraña: …», «Escena del ajuste continuo del precio: …».

## Scenes

Colors follow the chart tokens of each output (`--c-out`, `--c-zero`, `--c-pole`, `--c-state`) and
`--c-in` for inputs and reference lines.

### `massSpring` (variant `base`)

Reads `x` (`outputs.x` | `state[0]`), `v` (`outputs.v` | `state[1]`), `F = input.value`; params `m, b, k`.
Draws a hatched wall and floor, a zig-zag spring whose length follows `x`, a damper (fixed cylinder with
fluid, piston and rod moving with the mass), the mass block on wheels (wheels roll with `dx`), a dashed
equilibrium line, a ruler in metres with an `x` arrow and label, the force arrow `F(t)` (length ∝ |F|,
mirrored for F < 0) and the velocity arrow `v` above the block. Labels `k = …`, `b = …`, `m`.
Summary: «t = … s. Desplazamiento x = … m (en el equilibrio | estirando el resorte | comprimiendo el
resorte), velocidad v = … m/s, fuerza aplicada F = … N.»

### `tanks` (variants `lineal`, `torricelli`, `cascada`)

Reads `h` / `qout` (lineal, torricelli) or `h1` / `h2` (cascada; state fallback), `u = input.value`;
params `A, R` | `A, a, qin0` | `A1, R1, A2, R2`.

- Tank(s) with a living liquid polygon and surface polyline: gentle wave ∝ |q_in − q_out| and a splash
  under the inflow stream ∝ q_in. Level marker with symbol (`h`, `h₁`, `h₂`), dashed equilibrium line
  `h∞ = R·q_in` (lineal), `h₁∞`, `h₂∞` (cascada) or operating point `h₀ = (q_in0/a)²/2g` (Torricelli).
- Inflow pipe and falling stream (width ∝ q_in, moving streaks). Lineal: bottom outlet, valve `R`,
  stream into a basin (width ∝ q_out). Torricelli: side orifice `a` with a parabolic jet (reach
  `2√(h·H)` at fall height H, width ∝ q_out) and a puddle. Cascada: tank 1 → valve `R₁` → falls into
  tank 2 → valve `R₂` → basin.
- Readout strip (top right): `q_in, h, q_out, h∞|h₀` or `q_in, h₁, q₁, h₂, q₂`, fixed decimals by scale.
- **Reference labels over fluid** (`h∞`, `h₀`, `h₁∞`, `h₂∞`) sit on their dashed line inside a plate
  (`g.sc-tag` > `rect.sc-tag-bg` + text): fill `--c-plot-bg`, 1 px border of `--c-in` at 45 %, rx 4. The plate
  is sized from `kit.textWidth` (+4 px each side; −13/+7 px around the baseline) and kept inside the tank near
  its bottom or mouth. The text contrast is therefore that of `--c-in` on `--c-plot-bg` whatever the level:
  9.28:1 dark, 5.23:1 light (pixel-sampled in the e2e test at the default level and with full tanks; without
  the plate the worst glyph pixel drops to 1.4–1.8:1). A plate rather than a text halo, so the contrast also
  holds when a checker hides text strokes.
- **Inflow convention.** `outputs.qin` wins if present. Lineal and cascada: `q_in = u`. Torricelli: the
  catalogue input is Δq over `qin0`; the scene asks `model.deriv` once (`A·dh/dt + q_out` against `u` and
  `qin0 + u`) and keeps the convention found. Without a model it uses `u`.
- Flows computed when not in outputs: `q_out = h/R`, `a·√(2gh)`; `q₁ = h₁/R₁`, `q₂ = h₂/R₂`.

### `rlc` (variant `serie`)

Reads `i` (`outputs.i` | `state[0]`), `vC` (`outputs.vC` | `state[1]`), `u = input.value`; params `R, L, C`.
`v_R = R·i`, `v_L = u − v_R − v_C`. Clean series loop: source `v(t)` with value, resistor zig-zag, inductor
(four turns) with a glow ∝ |i|, capacitor plates with a charge fill ∝ |v_C| and field lines, passive-sign
polarity marks, KVL label `v(t) = v_R + v_L + v_C`. Current dots run clockwise for i > 0 at a speed ∝ i
(hidden inside the components and between the plates); an arrow on the bottom wire shows the direction
(also with reduced motion; hidden when |i| < 1 % of the reference). Parameter labels use the model's
display unit when declared (`C = 100 µF`, `L = 200 mH`). On a narrow loop (< 230 px) the R and L labels
sit on both sides of the gap between them and the KVL label moves to the bottom of the loop.

### `sir` (variant `base`)

Reads `S, I, R` (outputs | state 0–2), `u = input.value` (fraction of contacts avoided, clamped to [0, 1]);
params `beta, gamma, N`. Infection flow `β(1 − u)·S·I/N`, recovery flow `γ·I` (per día).
Stock-and-flow diagram: three stocks filled ∝ value/N (S `--c-out`, I `--c-pole`, R `--c-zero`), pipes with
particles whose speed follows each flow, bow-tie valves, the formula over each pipe (`βSI/N`, switching to
`β(1−u)SI/N` while u > 0) and the value under the valve. Population grid of 20 × 20 dots: the k-th dot to be
infected is fixed by a seeded order (distance to a focus + seeded noise, index tie-break), so the same
(S, I, R) always gives the same picture; R dots are smaller discs, I filled discs, S rings. Legend with shape +
color + letter and «cada punto ≈ N/400 personas». Side-by-side layout when `w ≥ 520` and `w/h ≥ 1.3`;
otherwise stacked, with the legend beside the grid when that gives a larger grid.

### `market` (variants `telarana`, `walras`)

Reads `P` (`outputs.P` | `state[0]`), `Qd`, `Qs`; params `a, b, c, d` (+ `alpha` for walras).
Demand shift `D = Qd − (a − b·P)` when `Qd` is given, else `D = u` (walras) or 0. P–Q plane with grid and
ticks, demand `Q = a + D − bP` (`--c-out`, with the original demand as a ghost when D ≠ 0), supply
`Q = c + dP` (`--c-zero`), equilibrium point with dashed projections and labels `P* = …`, `Q* = …`.
The equilibrium point and its projections are hidden when they fall outside the frame (P* < 0 with a large
negative D); the labels still show the values.

- `telarana` (discrete, `t = k`): the cobweb drawn progressively — the newest vertical/horizontal pair
  grows over ~0.12–0.5 s of real time (instant with reduced motion or `dt = 0`). The history keeps the last
  48 periods. Periods skipped between two renders are filled with the model recurrence
  `P(k) = (a + D − c − d·P(k−1))/b`. Summary says whether the cobweb converges, diverges or cycles (`d/b`).
- `walras` (continuous): dashed price line, dots on demand and supply at the current price, the excess
  arrow between them labelled «exceso de demanda | de oferta», and an arrow beside the P axis showing the
  direction of the price adjustment (length ∝ excess).
- **Readout strip** (`k, P, Q_d, Q_s` or `P, Q_d, Q_s, Q_d − Q_s`), legible for any state (SCN-01):
  - values have a bounded width: 4 significant digits with fixed decimals inside each decade (at most 3, so
    `5.629`, `25.74`, `123.5`, `12346`; |v| < 0.0005 shows `0.000`) and, from 10⁵, a compact scientific form
    with 3 significant digits (`−8.19×10⁵`; 2 from 10¹⁰, 1 from 10¹⁰⁰). Tabular figures as everywhere;
  - each slot reserves the width of its widest value (`kit.textWidth` of `k = 9999` or `P = −8.88×10⁹`) plus a
    12 px gap whose centre carries a thin divider (`line.sc-strip-sep`, `--c-axis`); slots wrap into rows of
    21 px (a subscripted readout's box spans −13.3/+7.1 px), and rows after the first may start under the
    «Precio P» title. One row for telaraña from 503 px of scene width, for walras from 584 px;
  - every readout text carries `class="sc-readout"` and `data-slot="x0 x1"` (its slot in viewBox units).
- **Labels in the frame without collisions** (`text.sc-plot-label`: `P* = …`, `Q* = …`, «Demanda», «Oferta»,
  walras «exceso de …»). Every frame, without allocations: the equilibrium point is reserved first, then
  `P*` (preferred: beside the P axis just above its projection), `Q*` (right of its projection at the Q axis)
  and the curve labels (90 % along the part of each line visible in the frame, right of the demand, left of
  the supply; hidden when the line misses the frame). A label whose preferred box collides moves to the
  nearest free spot of a 10 × 5 px grid inside the frame. Boxes come from `kit.textWidth` and the 13 px
  font box (13.5 px above, 4 px below the baseline). The walras excess label tries above the price line,
  then below; if both collide it is hidden (the arrow stays). The labels get a 3 px `--c-plot-bg` halo
  (`paint-order: stroke`) so they read over the cobweb and grid.
- **Cobweb inside the frame:** each vertical/horizontal segment is clipped geometrically to the plot
  rectangle (endpoints clamped, hidden when it misses the frame; hidden segments start at the frame
  origin), so the bounding box of `.sc-cobweb-g` never leaves the frame (the `clipPath` stays for the
  curves). The current-price dot is hidden when the price is outside the frame instead of being drawn on
  an edge. Walras: with the price outside the frame, the excess arrow, its label and the adjustment arrow
  are hidden.
- `CORE-12` (core) halts a cobweb when it leaves the economic domain, so typical runs stay in range; the
  above is the scene's own fallback for any state.

## Integration notes

- `market` clamps its plot box to at least 40 px wide (`x1 ≥ x0 + 40`), so a container that collapses to a
  few pixels (full-element screenshots) no longer builds a `clipPath` rect with a negative width, which
  Chrome logged as an error (integrator, at gallery's request).

## CSS hooks

`.sc-stage` (container helper; `--sc-aspect`, `--sc-min-height`), `.sc-root`, `.sc-summary`,
`.sc-<cls>` per scene (`sc-mass-spring`, `sc-tanks`, `sc-rlc`, `sc-sir`, `sc-market`), text classes
`.sc-text`, `.sc-text--{ink,in,out,zero,pole,state,title,big}`, `.sc-tick`, `.sc-sym`, `.sc-sub`,
`.sc-readout` (every strip readout), `.sc-strip-sep` (strip divider), `.sc-plot-label` (market labels with
halo), `.sc-tag` / `.sc-tag-bg` (tank reference label plate), and element classes listed in
`css/scenes.css`. Sections should not restyle scene internals.

## Kit (`DSL.viz.scenes.kit`)

For scene files. `mount(container, opts, def)` (shared lifecycle: svg + summary, size observation,
reset detection, text/summary throttling, rebuild on scale growth), `el`, `clear`, `len(node, attr)`,
`attr(node, name)`, `xform(node)` → `{ matrix, translate, scale, rotate }`, `points(node, n)` →
`{ set(i, x, y), flush() }`, `text(node)`, `label(parent, parts, opts)` → `{ el, set(text), xf }`,
`textWidth(parts | string, px = 13)` (estimated advance width of a label in IBM Plex Sans 500, from
per-character em widths measured in Chromium and rounded up, + 3 %; `sub` parts at 86 %; no layout read and
no allocation for a plain string, so it can run in `render()`),
`strip(parent, items, opts)` (readouts right-aligned in slots: `items[i].slot` overrides `opts.slot`; rows are
filled in order with the slots that fit, so equal slots give `floor(width / slot)` per row; `opts.rowH` = 18,
`opts.leftRest` = left edge of rows after the first, `opts.sep` = gap in px at the start of each slot with a
`line.sc-strip-sep` divider in its centre; each readout gets `sc-readout` and `data-slot`), `arrowHead`,
`hatch`, `sticky(min, headroom)`, `niceCeil`, `niceStep`,
`ticks`, `fmt(v, unit, digits)`, `fmtRef(v, unit, ref)` (decimals fixed by the scale: stable width, no
scientific notation near zero, never «−0»), `paramText(S, key, unit)`, `finite`, `r2`, `sameParams`,
`NBSP`, `G`. All per-frame setters cache the last value and write through `SVGAnimatedLength`,
`SVGTransform.setMatrix` and live `SVGPointList` items (no strings, no objects); in Node they fall back
to `setAttribute`.

## Performance

`render()` cost on `tests/pages/scenes.html` (Chromium, 300 frames after warm-up; the browser timer has
0.1 ms resolution): JS median 0.0–0.1 ms and mean ≤ 0.11 ms for every scene; including forced style and
layout, median ≤ 0.5 ms. The e2e test asserts median and mean < 2 ms and writes `frame-cost.json`.

## Verification

```
node --test tests/unit/scenes.test.mjs tests/unit/contract.test.mjs
npx playwright test tests/e2e/scenes.spec.mjs --project=src --output "test-results/scenes"
```

`tests/pages/scenes.html` shows eight synthetic cases (RK4 in the page), the real catalogue (each model and
variant simulated with `DSL.systems.simulate` at its defaults, plus SIR with distancing) and «Casos límite»
with fixed frames: the divergent telaraña of the audit (a = 100, b = 2, c = 10, d = 4, P₀ = 40, k = 0…15 with
the catalogue's former 2·10⁴ hint, ending at P = −819185, Qd = 1638470, Qs = −3276730), an equilibrium at the
origin (a = 1, b = 1, c = 0, d = 0.5, P₀ = 8), walras with the same huge readouts, and full lineal, Torricelli
and cascade tanks (≈ 96 % of the capacity, every reference label under water).
`window.__scenes` exposes `setFraction(f)`, `advance(n, dt)`, `hold(n, dt)`, `measure(n)`, `play()`,
`pause()`, `setSpeed(x)`, `real.setFraction(f)` and `stress.{ cases, render() }`.

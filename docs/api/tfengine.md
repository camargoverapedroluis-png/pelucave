# API: `js/sections/tfengine.js` (owner: tfengine)

Section `#transferencia`, «Motor de funciones de transferencia» (PRODUCT_SPEC §2.5). It is a classic script
(IIFE on `window.DSL`, `'use strict'`). Its styles are in `css/sections/tfengine.css` (`@layer sections`, `tf-` prefix,
tokens only), its icons are listed in `tools/icons/tfengine.list`, and its tests are in
`tests/e2e/tfengine.spec.mjs`.

**Numbers come from the engine.** Every number on screen comes from `DSL.core.tf`: G(s), roots, Routh,
residues, y(t), metrics, canonical parameters and Bode. The physical derivation in steps 1–3 and the
«Lectura física» in step 4 come from `DSL.systems` (`model.derivation`). The section only formats values,
with `DSL.util.formatNumber` and `DSL.core.latex.num`. It does no arithmetic of its own on results. Two
exceptions: the slider display factor for mH, µF, cm² and L/s comes from `param.display.factor`, and the
sample count of the curves (see «Sampling») is chosen here from the engine's poles and time horizon.

## Contract

```js
DSL.sections.tfengine = {
  mount(el) → handle,   // synchronous; appends <h2 id="transferencia-title"> and the controls
  helpers               // pure TeX/analysis helpers (see below)
};
```

**`mount(el)` is cheap (about 20 ms measured).** It builds the DOM, the catalogue and the sliders of the default
system. It computes nothing and creates no charts, and it removes any `data-lazy` left on `el`.

**Phased initialisation (TFE-15).** The first computation runs in four phases registered with
`DSL.util.lazyInit(el, phases, { rootMargin: '300px' })`:

1. compute and DOM: G(s), metrics and the list of steps (descriptors, step 1 open);
2. step response and pole-zero charts;
3. Bode and (if shown) impulse charts;
4. paint the open steps.

With nothing else going on, the shared lazy queue runs one phase per idle callback, starting 800 ms after `app:ready`, so
the section is ready (`el.dataset.lazy === 'done'`) before the user scrolls to it. Measured at 1×: no task
over 120 ms (the largest phase is about 90 ms). If the section comes within 300 px of the viewport, `init()`
is called or `tf:open` arrives, the pending phases run at once. Without `util.lazyInit`, `util.onVisible`
runs all four phases when the section comes near, and the section sets `data-lazy="done"` itself.

**Handle:**

| Member | Description |
|---|---|
| `destroy()` | Cancels the rAF, debounces, timers, idle callbacks and pending paints. Destroys the lazy-init instance and unsubscribes from the bus. Disconnects the IntersectionObservers and destroys the charts, sliders, tabs, toggle and collapsibles. Removes `data-lazy` and empties `el`. Idempotent |
| `init()` | Runs the pending init phases now (no-op if done) |
| `getState()` | Plain copy of the input state: `{ mode: 'sistema'\|'estandar'\|'personalizada', sys: { entryId, params (SI) }, std: { order, K, tau, zeta, wn }, custom: { num, den }, customError: null \| { kind:'error', field, code, message } }` |
| `getResult()` | `null` before the first computation. A diagnostic entry gives `{ kind:'diag', entryId, steps }`. Otherwise the result is `{ kind:'tf', source, entryId, num, den (monic), tex, stability, poles, zeros, info: { stable, finalValue, limitValue, peak, peakTime, overshootPct, riseTime, settlingTime }, secondOrder, firstOrder, samples, horizon, steps: [ids] }`. `samples` is the N of the curves and `horizon` is their time window T. `info.limitValue` is the engine's `stepInfo().limitValue`, or `null`. The step descriptors are built on demand if their task has not run yet. All values are copied from `DSL.core.tf` |

**`helpers` (pure, usable in node):**

- **TeX builders.** `derivTex(base, k)`, `linCombTex(coeffs, base, d?)`, `odeTex(num, den, d?)`, `laplaceTex(num, den, d?)`,
  `rootsTex(groups, letter, cls?, d?)`, `sMinusTex(p, d?)` and `pfSumTex(entries, d?)`. `d` is the number of
  significant digits (4 by default).
- **`buildCatalogue()`** returns the «Desde un sistema» entries.
- **`analyze(G, opts?)`** returns `{ G, stab, info, T, n, cd, rd, step, bode, so, fo, poleGroups, zeroGroups, dc }`.
  - `n` is the sample count.
  - `cd` is the coefficient digits: `opts.coefDigits`, or 4 by default.
  - `rd` is the root and residue digits: `G.stepDisplayDigits()`, or 6 if that is missing.
- **`buildProcedure(res, A)`** returns the step descriptors `[{ id, title, blocks }]`.
- **`PRESETS` and `STD_PARAMS`** hold the presets and the standard-form slider definitions.

## Modes

| Mode (tab id) | Input | G(s) from |
|---|---|---|
| `sistema`: «Desde un sistema» | A `<select>` grouped by `DSL.systems.CATEGORIES`, the input/output pair (KaTeX), and parameter sliders in display units | `model.tf(params, variant, outputKey).tf` |
| `estandar`: «Forma estándar» | A «1.er orden / 2.º orden» segmented control. Sliders: K (0.1–10), τ (0.05–20 s, log), ζ (−0.5–2), ωn (0.1–20 rad/s, log) | `TransferFunction.fromFirstOrder(K, τ)` / `fromSecondOrder(K, ζ, ωn)` |
| `personalizada`: «Personalizada» | Numerator and denominator fields (descending powers; spaces, `;` or a lone comma separate coefficients; a comma inside a number is a decimal comma) and 7 presets | `TransferFunction.fromCoeffStrings(num, den)`, denominator degree ≤ 4 |

**Catalogue entries.** `id` is `model/variant/outputKey`, built from `model.tfPairs(variant)`.

- **tf entries:** `massSpring/base/x`, `tanks/lineal/h`, `tanks/torricelli/h` (linearised), `tanks/cascada/h2`, `rlc/serie/vC`,
  `rlc/serie/i` and `market/walras/P`.
- **Diagnostic entries (no G(s)):** `sir/base` and `market/telarana`. Both are variants without `tfPairs`.

**Parameters that do not change G(s).** Some parameters change neither `tf.toTex` nor the derivation,
for example the initial price P0 in Walras. Each one is detected once by perturbing it to its range limit. It
gets no slider and is listed in a hint: «No intervienen en G(s): …».

**Digits (TFE-06).**
- In «Personalizada», coefficients are written with the significant digits the user typed: the most in any
  token of either field, between 4 and 10. A mantissa without a decimal point does not count its trailing
  zeros. For example, `1 100.01 1` shows ζ = 100.01/(2·1) = 50.005, and `1 3.14159265358979 2` shows 3.141592654.
- Poles, zeros, residues and the factored form use `G.stepDisplayDigits()`, so close roots are never shown as
  equal (`1 2.0001 1.0001` gives p₁ = −1.0001 and p₂ = −1).
- Next to a damping boundary, step 4 writes ωn and ζ (equations and readouts) with as many digits as it takes
  for the written ζ to satisfy the inequality of the damping note (`zetaDigits()`, up to 15): ζ > 1 for
  «sobreamortiguado», 0 < ζ < 1 for «subamortiguado», ζ < 0 for «inestable». The note then adds why. For
  example, `1 2.0001 1.0001` (ζ = 1.0000000012) shows ωn = 1.000049999 and ζ = 1.000000001 with 10 digits,
  where its 5 typed digits would write ζ = 1 next to «Como ζ > 1». The critical case keeps «ζ = 1».
- Step-4 readouts with more than 6 digits get the `tf-params--wide` grid: columns of at least 230 px, so a
  10-digit value and its unit share a line; in a narrower single column the unit drops to a new line
  instead of running under the next readout.
- Systems, the standard form and the presets keep 4 digits.

**Notes under the custom fields (TFE-08).**
- **Trimmed leading coefficient.** The engine drops a leading coefficient that is negligible (relative tolerance
  1e-14). When it does, the live note `tf-trim-note` says so, for example «El coeficiente principal 1e-15 es
  despreciable frente a 1: se tomó grado 1.» A numerator note starts «En el numerador, …», and several dropped
  coefficients get the plural form. The note is hidden while empty.
- **Comma read as a decimal.** When a field fails and its comma was read as a decimal comma, so that the
  field held a single coefficient (`1,2` = 1.2), the error adds «La coma se interpretó como separador decimal
  (1,2 = 1.2): separe los coeficientes con espacios.»

**Invalid custom input.**
- The `TFInputError` message (Spanish, from the engine) appears under the field that `err.field` names. That
  input gets `aria-invalid="true"`, and the other field is cleared of errors.
- G(s), the charts and the procedure keep the last valid result at full contrast. Nothing is dimmed; axe
  finds no color-contrast issue in either theme (TFE-10).
- The G panel gets a warning border (`.is-stale`) and the badge `tf-stale-badge` «Desactualizado: corrija la
  entrada» (icon and text in `--warning`). The callout «Corrija los coeficientes: mientras tanto se muestra la
  última G(s) válida.» is shown as well.
- Typing has a 320 ms debounce. Enter and change (blur) apply at once. Re-applying unchanged text does
  not recompute.

## Outputs

1. **The G panel.**
   - G(s) in large type: `lhs = original = monic`, where the original form differs from the monic one.
   - Poles (×) and zeros (○) in the map's colours.
   - Chips for the stability verdict, order, properness, `G(0)` (or «Integrador: G(0) = ∞»), «Linealizado», «No lineal» and «Tiempo discreto».
   - Every chip carries a one-sentence explanation (TFE-13). The text is in `data-tip` for the shared tooltip on hover and focus, and in a `.sr-only` span for screen readers.
   - The system's note, if any.
2. **«Procedimiento paso a paso».**
   - **Steps.** There are seven `DSL.ui.collapsible` steps (`headingLevel 4`, numbered). Step 1 is open at first.
   - **The bar.** The title and the actions form the bar `tf-proc-bar`, which stays under the header while the steps are read (TFE-01). On phones only the actions stay fixed.
   - **«Paso siguiente».** It opens the next closed step and scrolls it to the top: `scrollIntoView({ block: 'start' })` with `scroll-margin-top` = header + bar + 12 px, smooth unless reduced motion is on. It then announces «Paso n de 7: …». The new step's top lands within header + bar + 24 px and the button stays visible. When the last step opens the button is disabled, so focus first moves to that step's toggle.
   - **«Mostrar todo» / «Plegar todo».** It opens or closes every step.
   - **The steps:**
     1. `ley`: the system steps before `laplace` (ley, equilibrio, linealizacion). For the other modes, the generic or standard ODE with the chosen numbers.
     2. `laplace`: the properties used (linearity, derivative with zero ICs) and the transformed equation. For systems this is `derivation.laplace`.
     3. `despeje`: G(s) = Y(s)/U(s), plus the monic form when it differs. For systems this is `derivation.despeje`.
     4. `canonica`:
        - first order: K, τ and p (`firstOrderParams`);
        - second order: ωn, ζ, K, ωd and σ (`secondOrderParams`), plus a note on the damping class; ωn and ζ get extra digits next to a damping boundary (see «Digits»);
        - a zero-free order 1–2 system with a₀ ≤ 0 (TFE-04): the cause is explained instead of the generic sentence. The text names «primer/segundo orden puro», then the pole at s = 0 (integrator, or the double integrator) and/or the pole «con parte real positiva (s = …)». It then says why τ = 1/a₀ (or ωn = √a₀) needs a₀ > 0 and that the poles characterise the response (step 5). The monic and factored forms follow;
        - other G(s): the monic and factored forms and the denominator-only ωn/ζ, plus the `dcGainInfo` note;
        - systems also get «Lectura física» (`derivation.canonica`).
     5. `polos`: the characteristic equation, the grouped roots (`p_{1,2}`, with multiplicity words) and the zeros. Also the Routh table: first column highlighted, sign column, «cambio» marks, and a row header holding the TeX label (hidden from assistive technology) and the sr-only text «fila s²» (TFE-12). Then the `routh().notes` and the verdict callout.
     6. `escalon`: Y(s) = G(s)/s, the partial-fraction sum and residue table (`partialFractionsStep`), the inverse-transform rules and `stepAnalytic().tex`. If the expression is not exact, a warning says the curve is numerical. The `stepAnalytic` notes follow.
     7. `metricas`:
        - **Final value.** The final-value theorem is shown only when the system is stable; otherwise a callout says why not.
        - **Sentence.** The sentence after it depends on the case (TFE-07):
          - first order: «Para un primer orden puro se comparan con τ·ln 9 y τ·ln 50, que son exactas; la tabla lo indica.»;
          - canonical underdamped second order: the comparison with the canonical formulas;
          - otherwise: «Sin fórmula canónica: los valores se miden sobre la curva.»
        - **Metrics table.** It tags each formula «exacta» or «aproximada». tp = π/ωd and Mp are exact, ts ≈ 4/(ζωn) is approximate, and τ·ln 9 and τ·ln 50 are exact for first order.
        - **Notes.** The `stepInfo` notes follow.
   - **Diagnostic entries.** They render the model's own derivation steps instead (SIR: ley, nolineal, linealizacion, umbral, pico; telaraña: 6 steps).
3. **Charts** (`DSL.viz.charts`, tier C frames; figure titles are `h4` under the `h3` «Gráficas y métricas»):
   - step response (`createStepChart`, `stepInfo` annotations when stable, morph and ghost from the layer);
   - pole-zero map;
   - Bode (two stacked frames, −3 dB and crossover markers; non-finite points are filtered for poles on jω);
   - optional impulse chart (toggle «Respuesta al impulso»). When the system is stable it gets the annotation `{ finalValue: 0 }`, so its line reads «valor final 0» (TFE-09).

   Every chart has «Ver datos». The time window T is `timeHorizon()`, stretched to 1.15·ts when needed (capped by `stepInfo().tEnd`).

   **Ghost curve (TFE-14).** After a parameter change of the same G(s) (a slider, Enter in a number field,
   or the arrow keys), each chart keeps the previous curve as its ghost. A structural change removes the ghost from
   all four charts, even one that is drawn in a later task or is hidden at that moment. Structural changes are
   another system, mode, order, preset, custom coefficients or `tf:open`, and so is coming back from a model
   without G(s).
4. **Metric strip.** It has five cells: y∞, Mp, tp, tr and ts. Each shows the measured value and the canonical formula value with an «exacta»/«aproximada» tag. When a value is missing it shows «—». When the system is unstable or marginal, the strip shows the reason.
   - **Note under the strip (`tf-metrics-note`).** For a stable system it reads «Valores medidos sobre la respuesta calculada; debajo de cada uno, la fórmula canónica cuando existe.», followed by the `stepInfo()` notes. Those notes give the real sampling, for example «Métricas medidas sobre 4000 muestras en [0, 15] y refinadas por bisección…». The count is not fixed: it grows to 20 samples per period of the fastest oscillation, with a dense grid near the start (CORE-11). They also explain a «—» cell («Medición descartada…») or a very slow pole. The step 7 sentence no longer quotes a fixed sample count either. For an unstable or marginal system the note is the `stepInfo()` notes alone.
   - **Cancelled pole at the origin (TFE-16).** When the engine reports a finite `info.limitValue` (a zero cancels the pole at s = 0, for example (s)/(s² + s)), the y∞ card shows that value with the subtext «límite de y(t): el cero cancela el polo en el origen».

**Sampling (TFE-05).** The step and impulse curves use
N = clamp(⌈20·T·max|Im p|/(2π)⌉, 400, 20000) samples from `stepSamples(N, T)` and `impulseSamples(N, T)`. That is
at least 20 samples per period of the fastest oscillation, with 400 as the minimum. For the series RLC with
R = 2 Ω, L = 1000 mH and C = 10 µF the curves get thousands of samples, and the error at the midpoint between
two samples stays under 1 % of the peak. The well-damped defaults keep 400.

The diagnostic mode (SIR, telaraña) is handled as follows:
- G(s) reads «G(s) no existe», with the chip «No lineal» or «Tiempo discreto».
- A callout shows the `nolineal` or `sings` step text, with a button that emits `concepts:open`. The payload is `{ card:'linealidad', tab:'superposicion' }` for a continuous model or `{ card:'ecuaciones' }` for a discrete one.
- The charts are replaced by an empty state with «Ver en la galería» (`gallery:open { systemId, variant }`).

## Events

| Event | Direction | Handling |
|---|---|---|
| `tf:open` `{ systemId, variant?, params?, outputKey? }` | in | See the list below |
| `concepts:open` | out | Emitted by the diagnostic button |
| `gallery:open` | out | Emitted by «Ver en la galería» in the diagnostic empty state |

`tf:open` is handled in this order:
1. Resolve the variant aliases with `DSL.systems.variantOf`, for example `ajuste` → `walras`. When `outputKey` is missing or unknown, take the first pair.
2. Switch to «Desde un sistema».
3. Load the defaults and merge the finite `params`, clamped to each range. Unknown keys are ignored.
4. Rebuild the sliders and recompute.
5. Flash `tf-controls` and `tf-gpanel` (class `tf-flash`, 1.6 s accent ring) and announce «Sistema cargado en el motor: …» (the event comes from the gallery or the wizard; integrator).

Verified by `tests/e2e/integration.spec.mjs`: the gallery payloads (massSpring/base/x, tanks lineal/torricelli/cascada, rlc/serie/i via the output selector, market/walras/P, and massSpring with k changed to 9) and the wizard payloads (massSpring/base/x, rlc/serie/vC, tanks/lineal/h) load the same entry and parameters, and the resulting denominator equals `model.tf(params).tf.den`.

If a payload arrives before the lazy init, the section keeps it and starts the init phases at once. The
first phase applies the payload before it computes. An unknown `systemId` shows a warning toast. The shell scrolls to the section on its own.

## Recompute and motion

- **Coalescing.** Slider `onInput` (rAF-coalesced by the slider) and every other change call `schedule(mode, opts)`, which runs at most one recompute per animation frame (`util.raf`). The flags accumulate until that frame: `newSystem` (system, mode or order), `fresh` (another G(s), which drops the ghost) and `quiet` (no announcement).
- **During a drag** (`mode 'drag'`), G(s), the charts (mode `'drag'`) and the metrics update in that frame. The open procedure steps update after a 160 ms debounce.
- **Discrete changes (TFE-15).** These are slider release, Enter, select, tab, preset, coefficients and `tf:open`. The frame of the event paints only the control's own feedback. The work then runs in tasks after a yield (`util.yieldTask`, falling back to rAF), each of about 50 ms or less at 4× CPU:
  1. analysis, G(s), metrics, step and pole-zero charts;
  2. Bode and impulse charts;
  3. procedure descriptors, then the steps.

  A later recompute cancels the tasks that have not run yet (generation counter). Measured at 4× CPU with all seven steps open: the median Event Timing of a preset switch is about 80–130 ms (the target is ≤ 274 ms).
- **Painting the steps.** Steps that are open and dirty are painted one per task, nearest first: one right after the descriptors, the rest after a yield while they are within half a viewport of the screen. Steps farther away wait for `requestIdleCallback` (1.5 s timeout; `setTimeout` 120 ms without it) or for an IntersectionObserver (`rootMargin 50%`) to report them near. A step the user opens is painted at once. Closed steps stay dirty until they are opened.
- **Rendering cost.** Each step item has `content-visibility: auto` (`contain-intrinsic-size: auto 72px`), so steps off screen skip style, layout and paint. The content of a folded step gets `content-visibility: hidden` at the end of the fold (discrete transition), as the component's `visibility: hidden` does.
- **Procedure updates in place.** When the step structure is unchanged, only changed blocks are re-rendered. Equations are re-typeset and other blocks are replaced. Each changed line gets `.is-changed` (accent background for 420 ms, fading over `--dur-highlight`) without a forced layout read; a line that is already highlighted only has its timer extended. A new system or mode rebuilds the list.
- **Announcements (TFE-11).** The polite summary «G(s) recalculada. Estable. ζ = …, ωn = … rad/s. Valor final …» is debounced 450 ms. It follows user changes (once per slider change) and `tf:open`. The initial load, whether by phases in idle time or all at once, is quiet. ζ and ωn are given with 3 digits, or, next to a damping boundary, with `zetaDigits(so, 3)`: the fewest digits at which the announced ζ satisfies the inequality of its damping class, as in step 4 (audit round 2). For `1 2.0001 1.0001` it says «ζ = 1.000000001, ωn = 1.000049999 rad/s.» instead of «ζ = 1, ωn = 1 rad/s.».
- **Line reveal (TFE-01).** When a step opens, each block (`.tf-line`) runs `tf-rise` (opacity and translateY) for `--dur-step-in` (250 ms), staggered by `min(--stagger, 60ms)` per line. The first render staggers the seven steps (`.is-intro`). With reduced motion (the media query or `[data-motion="reduce"]`) there is no reveal or intro animation and no expand/collapse transition in the steps, and «Paso siguiente» scrolls instantly.
- **KaTeX.** It is called directly. `\displaystyle` is used instead of display mode, so equations align left with no KaTeX margins. `trust` allows only `\htmlClass` (pole and zero colours). If KaTeX is missing, `DSL.core.latex.render` is used without `\htmlClass`.

## Test ids

| Area | Test ids |
|---|---|
| Root and layout | `tf-root`, `tf-controls`, `tf-gpanel`, `tf-proc`, `tf-steps`, `tf-charts`, `tf-charts-empty` |
| Mode tabs | `tf-mode` → `tf-mode-sistema`, `tf-mode-estandar`, `tf-mode-personalizada`. Panels: `tf-panel-sistema`, `tf-panel-estandar`, `tf-panel-personalizada` |
| Sistema | `tf-system` (select), `tf-io`, `tf-sys-sliders`, `tf-param-<key>` (slider; plus `-input`, `-number`, `-reset`, `-help`, `-value`), `tf-inactive`, `tf-reset-params` |
| Estándar | `tf-std-order` (→ `tf-std-order-1`, `tf-std-order-2`), `tf-std-form`, `tf-std-K`, `tf-std-tau`, `tf-std-zeta`, `tf-std-wn`, `tf-reset-std` |
| Personalizada | `tf-num`, `tf-den`, `tf-num-error`, `tf-den-error`, `tf-custom-degree`, `tf-trim-note`, `tf-preset-{tercer-orden, polo-triple, fase-no-minima, integrador, routh-fila-nula, routh-epsilon, inestable}` |
| G panel | `tf-g` (`data-kind` is `tf` or `diag`; `data-tex-src`), `tf-roots`, `tf-roots-poles`, `tf-roots-zeros`, `tf-chips`, `tf-stability`, `tf-order`, `tf-proper`, `tf-dc`, `tf-note`, `tf-stale`, `tf-stale-badge`, `tf-diagnostic`, `tf-diag-concepts`, `tf-diag-gallery` |
| Procedure | `tf-proc-bar`, `tf-next`, `tf-show-all`, `tf-step-N` (with `-toggle` and `-region`), `tf-monic`, `tf-poles`, `tf-zeros`, `tf-routh`, `tf-verdict`, `tf-pf-sum`, `tf-pf`, `tf-yt`, `tf-final`, `tf-metrics-table`, `tf-mt-{tr,tp,mp,ts}`, `tf-params`, `tf-param-out-<id>` (with `-value`) |
| Charts | `tf-chart-step`, `tf-chart-pz`, `tf-chart-bode-mag`, `tf-chart-bode-phase`, `tf-chart-impulse`; each with the layer's `-legend`, `-tooltip`, `-data-toggle`, `-data`. Also `tf-impulse-toggle`, `tf-impulse-note` |
| Metrics | `tf-metrics`, `tf-metric-{final,mp,tp,tr,ts}` (with `-value` and `-sub`), `tf-metrics-note` |
| Toasts | `tf-toast` (with `-action` «Deshacer» and `-close`) |

The only fixed id is `transferencia-title`. All other ids come from `DSL.util.uid`. The root carries
`data-lazy` (`done` once the init phases have run).

## CSS hooks

- **Layout.**
  - `.tf-root` is the `tf` container and `.tf-main` is the `tfmain` container.
  - `.tf-grid` is a single column on phones (< 768 px viewport).
  - **Tablet portrait (TFE-02).** From a 768 px viewport and a 680 px container, the grid has two columns: controls `minmax(240px, 280px)` and main `minmax(380px, 1fr)`. The controls are sticky under the header with `padding: --space-4` and scroll on their own, so a slider and the step chart it moves are on screen together (768×1024, 820×1180).
  - From a 900 px container the columns are controls `minmax(300px, 360px)` and main, with gap `--space-6`; from 1200 px the controls are `minmax(340px, 400px)`. These layouts are unchanged by the tablet rule.
  - Step chart and pole-zero map sit side by side from a 760 px `tfmain`.
- **Procedure bar.**
  - `.tf-proc__head` is `position: sticky` at `top: var(--header-h)` and `z-index: var(--z-sticky)`. It has an opaque `--surface-1` background, a 1 px `--line` border and no backdrop blur.
  - JS writes its height to `--tf-bar-h` on `.tf-proc` before each «Paso siguiente» scroll. `.tf-steps__item` uses it in `scroll-margin-top`.
  - On phones `.tf-proc__head` is `display: contents` and `.tf-proc__actions` is the sticky box.
  - Keyboard focus inside the steps is scrolled out from under the bar (WCAG 2.4.11).
- **State classes.**
  - `.tf-flash` is the tf:open ring.
  - `.is-stale` gives a `--warning` border only: no opacity, so the contrast stays AA. The badge is `.tf-stale-badge`.
  - The others are `.is-diag`, `.is-intro`, `.tf-line.is-changed` and `.tf-line.is-static`.
  - `.tf-trim-note` is hidden while empty.
- **Chart aspect ratios** are set with `--ch-aspect` on `.tf-frame-step`, `.tf-frame-pz`, `.tf-frame-impulse` and `.tf-frame-bode`.
- **Sliders (TFE-03).** Inside this section the slider head is a grid. The name, with the symbol placed before it (`order: -1`), sits alone on the first row with `white-space: nowrap` and `hyphens: manual`. Help, reset and the value (number field and unit) share the second row in DOM order, so tab order matches what is seen. Every name fits on one line at 768, 820, 1024, 1280 and 1440 px. Because each slider is two rows tall, the sticky panel uses a tighter rhythm (16 px between sliders, 16 px vertical padding, 16 px margin above and below the panel), so the three-slider systems and the standard form fit whole at 1024×768 with «Restablecer parámetros» inside the panel (integration regression test in `tfengine.spec.mjs`); systems with four or five sliders still scroll inside the panel.

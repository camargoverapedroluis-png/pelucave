# Audit of the Dynamic Systems Lab — round 1 triage

This file is the triage lead's record for audit round 1. It lists every finding from the six lenses (math, qa, design, a11y, perf, coverage) with its adversarial verdict, the decision and the fix group. Below the table, each accepted fix item is self-contained (evidence, exact place, intended fix, interfaces) and carries an objective acceptance check.

Inputs: the findings and verifier verdicts handed to triage, `docs/PRODUCT_SPEC.md` (user request and agreed interpretation), `docs/SKILLS_BRIEF.md` (visual and UX rules) and the code. For the two "uncertain" findings (MATH-14, PERF-06) the triage lead read the code before deciding.

Decision rules: every confirmed critical, high or medium finding is accepted. Low findings are accepted when they are cheap and clearly improve the product. Design items form one bounded set that respects SKILLS_BRIEF (dark default, tiered glass with at most three Tier A blur layers, motion only where it teaches, AA contrast, reduced motion honoured). Taste churn, and any part of a suggestion that conflicts with the brief or the spec, is rejected, and the reason is recorded.

Fix groups own disjoint files. A finding that needs edits in two groups is split into items that name the shared interface on both sides. The sections implement against the interface and fall back gracefully when the other side is not present yet.

The section «Cierre de la ronda 1» closes the round: the final status and evidence of every accepted item, the resolution of every request between groups, the fixes made after the independent verification, the final test summary and the size of the single-file build. «Ronda 2» closes what round 1 left open, with the status and evidence of each point. The last section, «Firefox and WebKit (before launch)», records the first run outside Chromium and its two fixes.

## Round 1: every finding

Severity is the verifier's grade. "Items" names the fix items below.

| ID | Lens | Sev | Verdict | Decision | Reason | Group → items |
|---|---|---|---|---|---|---|
| MATH-01 | math | high | confirmed | accepted (merged with QA-01) | Open «Ver datos» tables keep the previous system's numbers. One fix in the chart controller covers every section. | foundation → FND-01 |
| MATH-02 | math | medium | confirmed | accepted | Near-repeated poles: shown y(t) off by 37 % at t=1, pole −1 listed twice, «polo doble» text contradicts steps 5–6. | core → CORE-01; tfengine → TFE-06 |
| MATH-04 | math | medium | confirmed (merged with QA-14) | accepted | The RK45 reference (rtol 1e-10) is too coarse to measure RK4's order at small h. | hero-concepts → HC-01 |
| MATH-05 | math | high | confirmed | accepted | ts = 4/(ζωn) is shown for ζ ≥ 1 (1.6 s against an exact 18.96 s). | core → CORE-02 |
| MATH-06 | math | medium | confirmed | accepted | «Constante de decaimiento 2L/R» is 100× off as a time constant when the circuit is overdamped. | core → CORE-03 |
| MATH-07 | math | medium | confirmed | accepted | Step 4 calls pure first- and second-order systems «no puro» when a0 ≤ 0. | tfengine → TFE-04 |
| MATH-08 | math | medium | confirmed | accepted | A fixed 400 samples aliases lightly damped fast responses. Minimum stays 400 (brief); more only when needed. | tfengine → TFE-05 |
| MATH-09 | math | medium | confirmed | accepted | The table drops points of sparse series (discrete samples, measured data). | foundation → FND-02 |
| MATH-10 | math | medium | confirmed | accepted | The energy-balance chip fails RK4 because of its own quadrature. | core → CORE-04 |
| MATH-11 | math | medium | confirmed | accepted | The text asks the reader to compare a linear curve that is never drawn. Add the dashed linear prediction. | core → CORE-05; gallery → GAL-01 |
| MATH-12 | math | low | confirmed | accepted (merged into CORE-01/TFE-06) | Floating-point noise and rounding in the derivation. Cheap fix, same code. | core → CORE-01; tfengine → TFE-06 |
| MATH-13 | math | low | confirmed | accepted (merged into TFE-06) | Typed coefficients are shown rounded (100.01 → 100), so the step 4 arithmetic does not add up. | tfengine → TFE-06 |
| MATH-14 | math | low | uncertain | accepted, narrowed | Code read (tf.js bode() anchor at ~L767): 1/(s−2) is drawn +180°→+270°. A branch rule that minimises max\|φ\| fixes it, leaves every other case unchanged and matches textbooks. Cheap. | core → CORE-06 |
| MATH-15 | math | low | confirmed | accepted | The cobweb law never writes the input D that G(z) uses. Cheap. | core → CORE-07 |
| MATH-16 | math | low | confirmed | accepted | Copied prose: «la tensión» for the current output; step 7 always says «segundo orden subamortiguado». Cheap. | core → CORE-08; tfengine → TFE-07 |
| QA-01 | qa | high | confirmed | accepted (duplicate of MATH-01) | The same stale-table defect across four sections. | foundation → FND-01 |
| QA-02 | qa | medium | confirmed | accepted | A tolerance relative to the largest pole calls stable stiff or slow systems marginal. | core → CORE-09 |
| QA-03 | qa | medium | confirmed | accepted | «oscila sin amortiguarse; no hay valor final» for a cancellation at s = 0 whose step converges. | core → CORE-10; tfengine → TFE-16 |
| QA-04 | qa | medium | confirmed | accepted | Measured tp/tr alias for ζ ≲ 3e-4 and sit beside the correct formula. | core → CORE-11 |
| QA-05 | qa | low | confirmed | accepted | A trimmed leading coefficient changes the order with no notice. A one-line notice is cheap. | tfengine → TFE-08 |
| QA-06 | qa | low | confirmed | accepted (merged) | Tick-limit console warnings during morphs. Same axis code as QA-11. | foundation → FND-03 |
| QA-07 | qa | medium | confirmed (merged with COV-06) | accepted | The divergent cobweb breaks the scene scaling, the readout strip and the axis titles. (d) is weak; only the hint wording is touched. | core → CORE-12; scenes → SCN-01; gallery → GAL-02; foundation → FND-03 |
| QA-08 | qa | medium | confirmed (merged with A11Y-06) | accepted | Focus falls to `<body>` when a control disables itself. | foundation → FND-14; gallery → GAL-07; tfengine → TFE-01; wizard → WZ-03 |
| QA-09 | qa | medium | confirmed | accepted | The market chart plot is 49 px tall at 1024 and 61 px at 1280; the title is clipped. | gallery → GAL-03 |
| QA-10 | qa | low | confirmed | accepted | «No se cumplen … 0 %» with a zero input. The card contradicts itself. Cheap. | hero-concepts → HC-02 |
| QA-11 | qa | low | confirmed | accepted (merged into FND-03) | Odd, colliding pole-zero ticks for a far pole. | foundation → FND-03 |
| QA-12 | qa | low | confirmed | accepted | «unid..» double period. Cheap. | foundation → FND-17; gallery → GAL-10 |
| QA-13 | qa | low | confirmed | accepted | «1,2» is read as a decimal and the message does not say so. Cheap. | tfengine → TFE-08 |
| QA-14 | qa | low | confirmed | accepted (duplicate of MATH-04) | Negative observed order at round-off level. | hero-concepts → HC-01 |
| QA-15 | qa | low | confirmed | accepted (merged into CORE-01) | y(0) = 1.11×10⁻¹⁶ in the step table. Cheap. | core → CORE-01 |
| QA-16 | qa | low | confirmed | accepted | After the wizard → Linealidad hand-off the card heading is under the header (6 of 6 runs). | hero-concepts → HC-11 |
| DES-01 | design | high | confirmed | accepted, except shortening `--dur-step-out` | Two wizard steps are visible at once and the panel height snaps. The brief fixes the durations at 150 ms out and 250 ms in, so they are kept. | wizard → WZ-01 |
| DES-02 | design | high | confirmed | accepted; the toolbar is opaque rather than Tier A glass | «Paso siguiente» opens each step at the bottom edge and the button scrolls away. An opaque toolbar keeps the Tier A blur count within the brief. | tfengine → TFE-01 |
| DES-03 | design | high | confirmed for TF; gallery part overstated | accepted (TF part, merged with COV-05); gallery part rejected | At tablet portrait the TF sliders are about 1.5 viewports from the chart. The verifier measured the gallery fitting at 820×1180 and failing only marginally at 768. | tfengine → TFE-02 |
| DES-04 | design | medium | confirmed (merged with PERF-01) | accepted | CLS 0.90 against the brief's 0.1, and an empty header frame on load. | foundation → FND-06 |
| DES-05 | design | medium | confirmed (merged with PERF-07, COV-09) | accepted | Blank bands and blank screens on jumps; lazy growth. Fixed by idle pre-init in phases and reserved geometry. | foundation → FND-07; hero-concepts → HC-08, HC-12; wizard → WZ-08; gallery → GAL-12; tfengine → TFE-15 |
| DES-09 | design | medium | confirmed, partly overstated | accepted | The gallery fade-out freezes during a synchronous rebuild, and the y-axis jumps after the first samples. | gallery → GAL-04 |
| DES-10 | design | low | confirmed | accepted | A stretched «tiempo» card with a 230 px empty bottom at 1024. Cheap CSS. | hero-concepts → HC-08 |
| DES-11 | design | medium | confirmed | accepted at chart level; per-section `.ds-reveal` rejected | Charts reveal off-screen, and stems draw before the curve. SKILLS_BRIEF §9 says «No per-section scroll reveals». | foundation → FND-05 |
| DES-13 | design | low | confirmed | accepted | The header is transparent for one frame after jumps. Cheap. | foundation → FND-08 |
| DES-14 | design | low | confirmed | accepted | Card titles are the same size as the section h2; the lead is oversized. The tokens already define the roles. Cheap. | hero-concepts → HC-09 |
| DES-15 | design | low | confirmed | accepted | Readout values do not share a baseline. A one-rule fix. | foundation → FND-10 |
| DES-16 | design | low | confirmed (merged with COV-04) | accepted; hiding the category chip rejected | Truncated chips and a hyphenated label. PRODUCT_SPEC §2.4 requires the chip. | gallery → GAL-05; tfengine → TFE-03 |
| DES-18 | design | low | confirmed | accepted | «Escalera» leaves the x-axis at 0–8 for data that ends at 6. Cheap. | hero-concepts → HC-10 |
| A11Y-01 | a11y | high | confirmed | accepted | Wizard term buttons have empty names (axe critical). | wizard → WZ-02 |
| A11Y-02 | a11y | medium | confirmed | accepted | The impulse chart's label calls stable systems unstable. | tfengine → TFE-09 |
| A11Y-03 | a11y | high | confirmed | accepted | In forced colours the play glyph, selected states, switch and slider disappear. | foundation → FND-11; gallery → GAL-06 |
| A11Y-04 | a11y | high | confirmed | accepted | In forced colours KaTeX accents hide their base letters. | foundation → FND-12 |
| A11Y-05 | a11y | medium | confirmed | accepted; no change to the tf-roots inner scroller (content stays reachable) | Horizontal scroll at 320 px (WCAG 1.4.10). | foundation → FND-13; gallery → GAL-06 |
| A11Y-06 | a11y | medium | confirmed (duplicate of QA-08) | accepted | See QA-08. | foundation → FND-14; gallery → GAL-07; tfengine → TFE-01; wizard → WZ-03 |
| A11Y-07 | a11y | medium | confirmed | accepted | «Deshacer» cannot be reached by keyboard within 5 s. | foundation → FND-15; gallery → GAL-07 |
| A11Y-08 | a11y | medium | confirmed | accepted | The selected segment is below 3:1. | foundation → FND-16 |
| A11Y-09 | a11y | medium | confirmed | accepted | Opacity dimming drops content text to 1.6–2.8:1. | hero-concepts → HC-05; wizard → WZ-06; tfengine → TFE-10 |
| A11Y-10 | a11y | medium | confirmed | accepted | Number-field errors are not announced, and clamping is silent. | foundation → FND-17 |
| A11Y-11 | a11y | medium | confirmed | accepted | Live-region chatter, and an unprompted G(s) announcement. | gallery → GAL-08; wizard → WZ-04; tfengine → TFE-11 |
| A11Y-12 | a11y | low | confirmed | accepted | A tab name / visible text mismatch and a verbose panel name. Cheap. | gallery → GAL-09 |
| A11Y-13 | a11y | low | confirmed | accepted | Series told apart by hue alone breaks SKILLS_BRIEF §3. Cheap. | foundation → FND-18; hero-concepts → HC-04 |
| A11Y-14 | a11y | low | confirmed | accepted | The residuals chart has no «Ver datos» (brief §3). Cheap. | wizard → WZ-05 |
| A11Y-15 | a11y | low | confirmed | accepted | A lazy card exposes raw LaTeX and unlabelled canvases. Cheap. | hero-concepts → HC-06 |
| A11Y-16 | a11y | low | confirmed | accepted | Routh row headers have empty names. Cheap. | tfengine → TFE-12 |
| A11Y-17 | a11y | low | confirmed | accepted as a wording fix; the role change rejected | The brief §3 mandates `role="img"`, so only the hint is reworded. | foundation → FND-19 |
| A11Y-18 | a11y | low | partly confirmed | accepted for «h₀» and the wizard boundary label | The TF «Estable» light-theme chip sampled 4.51:1, so it is not changed. | scenes → SCN-02; wizard → WZ-06 |
| A11Y-19 | a11y | low | confirmed | accepted | Help buttons do nothing when activated. Cheap. | foundation → FND-20 |
| A11Y-20 | a11y | low | confirmed | accepted | Chart titles are h3 under an h3. Cheap. | tfengine → TFE-12 |
| A11Y-21 | a11y | low | confirmed | accepted | 32–36 px targets break the brief's 44 px rule. Cheap CSS. | foundation → FND-21; wizard → WZ-06 |
| PERF-01 | perf | low | confirmed (duplicate of DES-04) | accepted | See DES-04. | foundation → FND-06 |
| PERF-03 | perf | low | confirmed | accepted | Layout reads in the frame loop breach ARCHITECTURE §14.6. Cheap. | hero-concepts → HC-07 |
| PERF-04 | perf | medium | confirmed (merged with PERF-10) | accepted | Off-screen charts render after every update (+46 % input handled when coalesced). | foundation → FND-04 |
| PERF-05 | perf | low | confirmed, gain overstated | **rejected** | Measured gain is marginal: −4.5 % task time in a drag, no gain on theme toggle, init tasks not clearly shorter. A cache also risks stale media-dependent tokens such as `--control-h-sm` under `pointer: coarse`. | — |
| PERF-06 | perf | low | uncertain | **rejected** | Code read: `STREAM_FPS = 30` already throttles chart updates to 30 Hz. Clean 1× runs hold 60 fps with no slow frames. Only the 4× CPU case reproduces, and the suggested fixes are already in place or speculative. | — |
| PERF-07 | perf | medium | confirmed (merged with DES-05) | accepted | Lazy init runs as one long task per section. | foundation → FND-07; gallery → GAL-12; tfengine → TFE-15; hero-concepts → HC-12 |
| PERF-08 | perf | low | confirmed | accepted as a shell-level restore; the vw-only fix rejected | The verifier showed that removing vw units does not restore the position. | foundation → FND-09 |
| PERF-09 | perf | low | confirmed | accepted | The gallery loop is gated on the whole stage, not on the viewer. Cheap. | gallery → GAL-13 |
| PERF-10 | perf | low | confirmed (merged into FND-04) | accepted | Resizes redraw off-screen charts. | foundation → FND-04 |
| PERF-11 | perf | low | confirmed | accepted for fonts; icon pruning rejected | About 162 KB of unreachable KaTeX faces. Pruning icons saves only 4.5 KB and risks breaking icon names built at run time. | platform → PLT-02 |
| PERF-12 | perf | low | confirmed | accepted for TF (yield, typeset only visible open steps); theme-toggle part rejected | The cssVar cache measured no gain on the theme toggle (see PERF-05). | tfengine → TFE-15 |
| COV-01 | coverage | low | confirmed | accepted as a wording fix; a thermal example rejected | The request's lists are illustrative, and a new model is a larger addition outside this round. | wizard → WZ-07 |
| COV-02 | coverage | low | confirmed | accepted, bounded (gallery readouts and TF chips); wizard chips and concept readouts rejected | This answers the request's «tooltips explicativos» with a bounded change. | foundation → FND-22; core → CORE-13; gallery → GAL-11; tfengine → TFE-13 |
| COV-03 | coverage | medium | confirmed | accepted | The t number field cannot be used during playback. | foundation → FND-17; hero-concepts → HC-03 |
| COV-04 | coverage | medium | confirmed (duplicate of DES-16) | accepted | Chips are truncated at 768 and 820 px. | gallery → GAL-05 |
| COV-05 | coverage | medium | confirmed (duplicate of DES-03) | accepted; reordering the sections rejected | Reordering would break the brief's order: input → derivation → charts. | tfengine → TFE-02 |
| COV-06 | coverage | medium | confirmed (duplicate of QA-07) | accepted | See QA-07. | core → CORE-12; scenes → SCN-01; gallery → GAL-02 |
| COV-09 | coverage | low | confirmed (merged with DES-05) | accepted | The wizard grows by 754 px during a jump. | wizard → WZ-08; foundation → FND-07 |
| COV-10 | coverage | low | confirmed | accepted | The README contradicts the app. Cheap. | platform → PLT-01 |
| COV-11 | coverage | low | confirmed | accepted | The ghost curve comes from another system. Cheap. | tfengine → TFE-14 |
| MATH-03 | math | — | refuted | rejected | The behaviour is intended by PRODUCT_SPEC §2.2 c. | — |
| DES-06 | design | — | refuted | rejected | It is the tiered glass system of SKILLS_BRIEF §1; the proposed changes are taste churn. | — |
| DES-07 | design | — | refuted | rejected | The hero is vertically centred; the H1 is bounded by the two-line rule. Taste churn. | — |
| DES-08 | design | — | refuted | rejected | Conflicts with PRODUCT_SPEC §2.4; the scene already uses 92 % of its width. | — |
| DES-12 | design | — | refuted | rejected | The ~240 ms lag did not reproduce; the morph follows the brief. | — |
| DES-17 | design | — | refuted | rejected | This is the brief's static s-plane backdrop. | — |
| PERF-02 | perf | — | refuted | rejected | The first layout is unavoidable; the A/B test showed no user-visible gain. | — |
| COV-07 | coverage | — | refuted | rejected | The spec chose Torricelli; the pendulum is used in the methods tab. | — |
| COV-08 | coverage | — | refuted | rejected | Streaming history must not change retroactively (PRODUCT_SPEC §2.4). | — |

Totals: 85 findings went to triage (plus 9 refuted for the record). 83 are accepted, in whole or in part, and become 88 fix items after duplicates are merged and cross-group items are split: core 13, foundation 22, scenes 2, hero-concepts 12, wizard 8, gallery 13, tfengine 16, platform 2. 2 are rejected (PERF-05, PERF-06).

## Cross-group interfaces

| Provider (item) | Interface | Consumers |
|---|---|---|
| FND-07 | `DSL.util.lazyInit(el, phases, { rootMargin }) → { ensure(), done, destroy() }`, `DSL.util.yieldTask()`, `el.dataset.lazy = 'done'` | HC-12, WZ-08, GAL-12, TFE-15 (fall back to their current `util.onVisible` path when absent) |
| FND-06 | `html.js:not([data-ready])` hides the header, main and footer; `data-ready` is still set by app.js | all sections (no code change) |
| FND-15 | `ui.toast(msg, { action, returnFocus })`, which focuses the action after keyboard input | GAL-07 (TF reset buttons stay enabled, so the fallback already works) |
| FND-17 | `ui.slider({ onEditStart })`; `set(v, { silent: true })` no longer clobbers a focused, edited number field | HC-03 |
| FND-18 | the legend swatch draws the series' own dash array | HC-04 |
| FND-22 | `ui.readout({ tip })` | GAL-11 |
| FND-11 | forced-colors rules for ds-* components and the nav | GAL-06 (`.gl-sys` selected card) |
| CORE-01 | `TransferFunction.prototype.stepDisplayDigits()`; `stepAnalytic({ digits })` | TFE-06 (fallback: 6 digits) |
| CORE-05 | Torricelli output `hLin` with `dash: true` | GAL-01 (`chartPlan` honours `o.dash`) |
| CORE-10 | `stepInfo().limitValue` | TFE-16 |
| CORE-12 | model hook `domain(x, outputs, params, variant)` → halt reason | GAL-02 (hint), SCN-01 (robust anyway) |
| CORE-13 | `tip` on every readout definition | GAL-11 |

## Accepted fix items

### Group core (`js/core/*.js`, `js/systems/*.js`, unit tests numeric/tf/latex/systems/simulator, `tests/crosscheck/**`, `docs/api/{numeric,tf,latex,math,systems}.md`)

**CORE-01 — Partial fractions and the y(t) shown to the student reproduce the true response** (MATH-02, MATH-12, QA-15)
- Evidence: Personalizada, num «1», den «1 2.0001 1.0001» (poles −1 and −1.0001). The residue table lists pole −1 twice, with residues 9999 and −10000. y(t) = 0.9999 + 9999e^{−t} − 10000e^{−t}, which is 0.632 at t = 1; the exact value is 0.2642. Step 4 says «polo real doble» while steps 5–6 list two simple poles. (s²+2s+3)/(s²+s+1) shows residues «−1 ∓ 5.551×10⁻¹⁷ j». ms_over residues rounded to 4 digits misreproduce Y(s) by 1.2 %. The first step-table row of (s+3)/(s³+4s²+6s+4) is «0 1.11×10⁻¹⁶».
- Place: `js/core/tf.js`: pfCore() (~L140–176), the TeX built by stepAnalytic(), stepSamples()/impulseSamples() (~L916–928), and the secondOrderParams damping classification versus N.groupRoots.
- Fix:
  1. pfCore sets to 0 any residue real or imaginary part with |part| ≤ 1e-12·|r|.
  2. Add `stepDisplayDigits()`. It returns the smallest d in {4, 6, 8, 10, 12} for which the step response rebuilt from poles and residues rounded to d significant digits matches the exact response at 200 points within 1e-3·max\|y\|, and distinct poles still print as distinct. stepAnalytic() uses it by default for its y(t) TeX and accepts `{ digits }`.
  3. Make the damping classification and the root grouping agree: either both report a double pole (confluent t·e^{pt} form) or both report two simple poles. When two distinct poles agree to within 1e-3 relative, add a stepAnalytic note: «Los polos … están muy próximos: los residuos son grandes y casi se cancelan; se muestran con más cifras».
  4. stepSamples()/impulseSamples() set |y| < 1e-12·max\|y\| to 0, so y(0) is exactly 0 for a strictly proper G.
- Interface: TFE-06 calls `G.stepDisplayDigits()`. Keep the name.
- Docs and tests: update `docs/api/tf.md` and `tests/unit/tf.test.mjs`.
- Acceptance:
  - Den [1, 2.0001, 1.0001]: the numbers parsed from stepAnalytic().tex reproduce the exact y(1) = 0.2642 and y(5) within ±0.001, and the damping classification agrees with the pole multiplicities.
  - (s²+2s+3)/(s²+s+1): the residue imaginary parts are exactly 0.
  - (s+3)/(s³+4s²+6s+4): `stepSamples().y[0] === 0`.
  - ms_over (1/(s²+5s+1)): the partial-fraction sum rebuilt from the displayed digits matches Y(3.1−0.4j) within 0.1 %.
  - `npm test` and the crosscheck pass.

**CORE-02 — Mass-spring «Tiempo de establecimiento» readout is correct for ζ ≥ 1** (MATH-05, high)
- Evidence: `js/systems/massSpring.js` readouts() (~L228) pushes ts = 4/(ζωn) whenever ζ > 0. m=1, b=5, k=1 (ζ=2.5) shows 1.6 s; the exact 2 % value is 18.96 s, which the TF engine also shows. b=4, k=4 (ζ=1) shows 2 s; the exact value is 2.917 s.
- Fix: keep «Tiempo de establecimiento (≈, 2 %)» = 4/(ζωn), marked approx, only for 0 < ζ < 1. For ζ ≥ 1, show the exact 2 % settling time from `new DSL.core.tf.TransferFunction([1], [m, b, k]).stepInfo().settlingTime`, labelled «Tiempo de establecimiento (2 %)» with approx false. Keep the id `ts`. Check the other models for underdamped-only formulas used the same way. Update `docs/api/systems.md`.
- Acceptance (`tests/unit/systems.test.mjs`):
  - {m:1, b:5, k:1}: `ts` = 18.96 ± 0.05 s and is not approx.
  - {m:1, b:4, k:4}: `ts` = 2.917 ± 0.01 s.
  - Defaults (ζ = 0.2): still 10 s, marked approx.
  - The gallery readout equals the TF engine's value for the same parameters.

**CORE-03 — The RLC decay-constant readout means something when overdamped** (MATH-06)
- Evidence: `js/systems/rlc.js` ~L253 always shows 1/σ = 2L/R as «Constante de decaimiento». With R = 100 Ω, L = 50 mH, C = 1000 µF (ζ = 7.07) it shows 0.001 s. The slow pole is −10.05 s⁻¹, so the dominant τ is 0.0995 s.
- Fix:
  - ζ < 1: keep «Constante de decaimiento 2L/R» (the envelope).
  - ζ > 1: show «Constante de tiempo dominante» τ = −1/p_lenta, with p_lenta = −σ + √(σ² − ωn²).
  - ζ = 1: τ = 1/σ, labelled as a double pole.
  - Document the id or label change in `docs/api/systems.md`.
- Acceptance (unit test):
  - R = 100, L = 0.05, C = 1e-3: 0.0995 s ± 0.5 %, with the dominant label.
  - Underdamped defaults: value and label unchanged.

**CORE-04 — The energy-balance check reflects integrator error, not its own quadrature** (MATH-10)
- Evidence: `js/systems/registry.js` energyBalance() integrates b·v² and u·v with quad() (composite Simpson/trapezoid) on the coarse output grid.
  - Masa-resorte, b = 3, RK4, Δt = 0.2 s: «No se cumple; disipada 0.1254; aportada 0.2499; Residuo 5.164×10⁻⁴» (relative 2.07e-3 > 1e-3). RK4's state error is only 6.5e-5, and the same quad() applied to the exact trajectory gives 4.83e-4, which also fails.
  - RLC, R = 90, RK4, Δt = 1.6 ms also fails.
  - The wizard hint (wizard.js:1669) says the RK4 checks pass almost exactly.
- Fix: integrate the dissipated and input energies as extra states, with the same method and step as the simulation (an augmented ODE in the simulate path used by invariants). Alternatively, evaluate the power integrals on a dense grid built from the method's own stages. Either way, the residual must measure integrator error only. Keep the 1e-3 relative tolerance. This applies to every model that uses H.energyBalance (massSpring, rlc). No wizard change is needed.
- Acceptance (systems tests):
  - Masa-resorte, b = 3, RK4, Δt = 0.2 s: relative residual ≤ 1e-3 («Se cumple»).
  - RLC, R = 90, RK4, Δt = 1.6 ms: passes.
  - A coarse Euler run (masa-resorte, Δt = 0.2 s) still reports «No se cumple», so the lesson stays.
  - The crosscheck energy values agree with DOP853 within 1e-3.

**CORE-05 — Torricelli exposes the linear prediction as a dashed output, and the text points to it** (MATH-11, core part)
- Evidence: the TF engine «Lectura física» (`js/systems/tanks.js` ~L269: «Compare ambas curvas en la simulación con escalones grandes») and the Δq tooltip (~L89) refer to a linear curve that is drawn nowhere. With Δq = +20 L/s, the nonlinear final level is 1.274 m and the linear prediction is 1.070 m.
- Fix: add an output `hLin` = h0 + Δh_lin(t) to the Torricelli variant, where A·dΔh_lin/dt = Δq_in(t) − Δh_lin/R and R = 2h0/qin0 (from operating()).
  - Compute it as an extra state with the same integrator, or an equivalent mechanism.
  - Descriptor: `{ key: 'hLin', label: 'Nivel lineal (aprox.)', symbol: 'h_{lin}(t)', unit: 'm', color: '--c-out', dash: true }`.
  - Keep it out of the mass-balance invariant and the scene.
  - Reword ~L269 to point to the dashed «Nivel lineal (aprox.)» curve in the Galería.
- Interface: GAL-01 honours `dash: true` on outputs.
- Acceptance (unit tests):
  - Step Δq = +0.02 m³/s: final h ≈ 1.274 m and hLin ≈ 1.070 m (±0.5 %).
  - Δq = −0.008 m³/s: 0.2467 m and 0.2141 m.
  - hLin(t) matches the analytic first-order response within 1e-6.
  - The lineal and cascada variants are unchanged, and invariants pass.

**CORE-06 — Bode phase branch for a negative static gain caused by RHP roots** (MATH-14, uncertain, accepted narrowed)
- Evidence: in `js/core/tf.js` bode() (~L765–770), the anchor is −90·(origin poles − zeros) + 180° when G0 < 0. So 1/(s−2) runs from +180.3° to +269.9°. Textbooks, and every other example in the tool, show −180° → −90°.
- Fix: when G0 < 0, evaluate both anchors (+180° and −180°) and keep the one whose unwrapped phase over the plotted ω grid has the smaller max\|φ\|. A tie keeps +180°, which is the current behaviour, so −1/(s+1) stays +180° → +90°. Document the rule in `docs/api/tf.md`.
- Acceptance (unit tests):
  - 1/(s−2): the phase starts in [−180.5°, −179.5°] and ends in [−90.5°, −89.5°].
  - −1/(s+1) and (−s+1)/(s+1): unchanged.
  - All existing Bode tests pass.

**CORE-07 — The cobweb derivation writes the demand shift D** (MATH-15)
- Evidence: `js/systems/market.js` telaraña derivation. Steps 1–2 show Q_d = a − bP_t and P_t = (a−c)/b − (d/b)P_{t−1} with no D. Step 6 takes D as the input of G(z) = (1/b)/(z + d/b). The model's next() is P_{k+1} = (a + u_k − c − dP_k)/b.
- Fix: write Q_{d,t} = a − bP_t + D_{t−1} (a shift decided in t−1 acts in t, as next() does). Carry it through P_t = (a−c)/b − (d/b)P_{t−1} + D_{t−1}/b before taking the Z-transform. G(z) does not change.
- Acceptance:
  - A unit test asserts that the step 1 and step 2 TeX of the telaraña derivation contain D.
  - G(z) is unchanged.
  - In the TF engine, «Mercado telaraña» steps 1, 2 and 6 all show D.

**CORE-08 — The RLC i(t) regime text names the current** (MATH-16, part 1)
- Evidence: the `js/systems/rlc.js` ~L81 regime text is reused for I(s)/V(s) and says «la tensión oscila con frecuencia ωd».
- Fix: use an output-specific sentence for outputKey `i` («la corriente oscila con frecuencia ωd…»). The step 7 half of MATH-16 is TFE-07.
- Acceptance: TF engine → RLC serie, salida i → paso 4 «Lectura física» contains «corriente» and does not contain «la tensión oscila». The v_C text is unchanged.

**CORE-09 — The stability verdict does not call stable stiff or slow systems marginal** (QA-02)
- Evidence: `js/core/tf.js` ~L587–588 uses eps = 1e-9·max(1, max\|p\|). Dens '1e-10 1 1' (poles −1e10 and −1), '1 1e6 1', '1e15 1', '1 1e-10' and '1 2 1e-12' are all called «Marginalmente estable», with metrics hidden and the text «oscila sin amortiguarse».
- Fix:
  - Classify primarily by the Routh–Hurwitz sign pattern of the trimmed coefficients, which routh() already computes. All first-column entries strictly positive → estable. Sign changes → inestable.
  - Only a zero row or a zero entry triggers the jω-axis analysis, and that analysis uses a per-pole tolerance |Re p| ≤ 1e-9·max(1, \|p\|).
  - For a stable system whose slowest τ exceeds the horizon cap, add the note «Polo muy lento (τ ≈ …): la respuesta tarda mucho en establecerse».
  - Keep the documented no-cancellation rule. Update `docs/api/tf.md`.
- Acceptance (unit tests):
  - The five dens above are «estable».
  - 1/s, 1/(s²+1) and the «Integrador» preset are «marginal».
  - The RHP presets are «inestable».
  - UI: den '1e-10 1 1' shows «Estable» and final value 1.

**CORE-10 — The marginal note is correct for a pole-zero cancellation at s = 0** (QA-03, core part)
- Evidence: `js/core/tf.js` stepInfo (~L954–958) prints «…la respuesta oscila sin amortiguarse; no hay valor final…» for every marginal case that is not 'infinito', including dcGainInfo kind 'indeterminado'. '1 0'/'1 1 0' converges to 1; '1 0 0'/'1 2 1 0' decays to 0.
- Fix: branch the notes.
  - A complex pair on the jω axis keeps the oscillation sentence.
  - 'indeterminado' gets «Un cero cancela el polo en el origen: la salida converge a <límite>».
  - Expose `res.limitValue` = dcGainInfo().limit when that limit is finite. finalValue stays null and the verdict stays marginal, per the documented no-cancellation rule.
- Interface: TFE-16 displays limitValue.
- Acceptance (unit tests):
  - [1, 0]/[1, 1, 0]: no note contains «oscila», and limitValue = 1.
  - [1, 0, 0]/[1, 2, 1, 0]: limitValue = 0.
  - 1/(s²+1) keeps the oscillation sentence.

**CORE-11 — Measured tp and tr are found on a fine grid for nearly undamped systems** (QA-04)
- Evidence: stepInfo uses 4000 samples over the full horizon (~8e6 s for 1/(s²+1e-6 s+1)). It reports tp = 5696 s against the formula's 3.142 s, and tr = 202.1 s against a true 1.02 s. It starts failing at 2ζ ≤ 5e-4.
- Fix:
  - First search for the first peak and the 10 %/90 % crossings on a dense grid over [0, min(tEnd, 4·2π/ω_max)], where ω_max is the largest \|Im p\| over the poles, with at least 50 samples per period. Refine by bisection as today.
  - Size the full-horizon grid to at least 20 samples per period, or cap it and take ts from the envelope.
  - If a measured value still differs from the canonical value of a pure second order by more than 5 %, return null with a note instead of a confident wrong number.
- Acceptance (unit tests):
  - 1/(s²+1e-6 s+1): peakTime 3.1416 ± 0.005 s, riseTime 1.020 ± 0.01 s, overshoot ≥ 99.9 %.
  - ζ = 5e-4 results unchanged.
  - Existing stepInfo tests and the crosscheck pass.

**CORE-12 — The cobweb halts when it leaves the economic domain, and predicted ranges stay in the domain** (QA-07, COV-06, core part)
- Evidence: telaraña with d = 2.4, b = 2, P0 = 40 already has P = −3 at k = 1 and −280.67 at k = 23. It halts only at k = 67, through stateBound 1e6 (about 30 s at 1×). With d = 4, b = 2, the hints scale the scene to 0–20000 (P) and 0–100000 (Q) from the full-horizon prediction.
- Place: `js/systems/market.js` hints() (~L300–318) and `js/systems/simulator.js` _checkState() (~L134).
- Fix:
  1. Simulator gets an optional, documented model hook `domain(x, outputs, params, variant)` that returns null or a Spanish reason. After the offending step is recorded, it halts with that reason.
  2. Market telaraña returns a reason when P < 0, Qd < 0 or Qs < 0. Example: «La simulación se detuvo en k = 1: el precio se hizo negativo (−3 u.m.), fuera del dominio económico del modelo lineal. Con d/b = 1.2 la oscilación crece un 20 % por periodo.»
  3. The telaraña duration and yRange in hints() cover only the periods up to and including the first domain exit.
  - Document the hook in `docs/api/systems.md`.
- Interfaces: GAL-02 shows the reason with an action hint. SCN-01 keeps the scene robust anyway.
- Acceptance (unit tests):
  - d = 2.4, b = 2, P0 = 40 halts at k = 1 with a reason containing «dominio».
  - d = 4, b = 2: hints().yRange.P lies within [−0.2·a/b, 1.2·max(P0, a/b)].
  - Convergent defaults (d < b): identical trajectory, no halt.
  - The stateBound halt still works for the other models.

**CORE-13 — Every gallery readout carries a one-sentence explanation** (COV-02, core part)
- Evidence: the readout definitions in `js/systems/{massSpring,rlc,tanks,sir,market}.js` have no explanation. Terms such as «Factor de calidad», «Constante de decaimiento 2L/R», «Umbral de inmunidad de grupo» and «Cociente de pendientes d/b» are unexplained, while the request asks for «tooltips explicativos».
- Fix: add `tip` to every readout definition of every model and variant: Spanish, one sentence of at most 160 characters, saying what the value means and how to read it.
- Interfaces: FND-22 adds `ui.readout({ tip })`; GAL-11 passes it through.
- Acceptance (unit test): for every model × variant at default parameters, every readout has a non-empty `tip` of at most 160 characters, and no other readout field changes.

### Group foundation (`css/{tokens,base,components,shell,charts}.css`, `js/ui/*.js`, `js/app.js`, `js/core/ns.js`, `js/viz/charts.js`, `tools/icons/*.list`, unit tests ui/ns, e2e shell/charts, test pages ui-kitchen-sink/charts, `docs/api/{ui,shell,ns,charts}.md`)

**FND-01 — Open «Ver datos» tables follow every data change** (MATH-01, QA-01, high)
- Evidence: in `js/viz/charts.js`, dataToggle().refresh() (~L3448–3520) acts only from open(). Only gallery.js:1054 calls refresh(). Toggles created through `opts.dataToggle` (~L3579–3580; used by tfengine, concepts and wizard) never refresh. Observed:
  - TF step table on (s+3)/(s³+4s²+6s+4) keeps «6 0.7495» after den becomes '1 3 3 1'; reopening gives «12 0.9995».
  - The pole-zero table keeps the old triple pole.
  - The Bode table is unchanged after G changes.
  - Conceptos «Ecuaciones» and «Superposición» and the wizard step 4 tables keep the previous rows.
  - The text alternative contradicts the plotted curve.
- Fix: in the controller base, every data-changing call (update, setData, setSeries, push, pushMany, clear, setWindow, setYRange) schedules `dataToggle.refresh()` when isOpen().
  - The refresh is a trailing one, at the end of the morph tween or at most 150 ms after the last call.
  - For streaming time charts it is throttled to at most 2 Hz.
  - The panel's scroll position and focus are preserved.
  - The gallery's explicit call keeps working, because refresh() is idempotent.
- Acceptance:
  - `tests/e2e/charts.spec.mjs` on `tests/pages/charts.html`: open a table, update the data, and the rows change within 500 ms for step, pz, bode, time and xy charts.
  - `node test-results/audit/qa/21-tf-table-stale.mjs src|dist`, `22-stale-tables.mjs src` and `test-results/audit/math/stale_wz.mjs` report no stale table.
  - In the TF example above, the last row becomes ≈ «12 0.9995» without reopening.

**FND-02 — «Ver datos» keeps every point of sparse series** (MATH-09)
- Evidence: dataTable() (~L3409–3446) takes 200 rows uniformly from all series concatenated (sampleIndices).
  - Ecuaciones, a = 1, T = 0.4: 10 of 16 discrete samples (k = 0, 3, 6, 8, 11, 14 missing).
  - T = 2.5: 4 of 6 (k = 1 = 2.5 and k = 4 = −4.06 missing).
  - Wizard step 4: 40/60, 50/80, 40/60 and 29/40 measured points.
- Fix: when the rows carry a series column (the first text column, or `spec.groupKey`), sample per series. Keep every row of a series with at most 60 rows, and spread the remaining budget over the dense series. The caption states the shown count per series.
- Acceptance:
  - Charts page test: a 16-row series plus a 400-row series keeps all 16 rows, with ≤ 200 rows in total.
  - In the app, Ecuaciones shows 16/16 and 6/6 discrete rows (k = 1 and k = 4 present).
  - Wizard step 4 shows all measured rows (60, 80, 60, 40).

**FND-03 — Chart axes: no tick storms, nice ticks, titles never overprint** (QA-06, QA-11, QA-07 (c))
- Evidence:
  1. During morphs, the target stepSize is applied to interpolated min/max: `charts.js` ~L1694, 2069, 2435–2436, 2885 and 3265–3268. A preset switch logs 14–16 «Limiting to 1000 ticks» warnings.
  2. Fixed-range time charts give ticks such as 10000 / 1667 / −6667 / −15000.
  3. Pole-zero map of 1/(s+1000): ticks «−1187, −237.5, 237.5, 1187», with «−237.5237.5» colliding.
  4. Market time chart: «Precio (u.m.)» is drawn over «−500000».
- Fix:
  1. While tweening, derive stepSize from the displayed range (niceNum(range/5)), or omit it and use maxTicksLimit.
  2. Inside fixed ranges, ticks are nice multiples anchored at 0.
  3. Pole-zero map: nice step anchored at 0, and overlapping labels dropped.
  4. Compact tick labels (at most 6 characters, e.g. «−5×10⁵») for \|v\| ≥ 1e5, with the axis width reserved from the measured labels so titles never overlap.
- Acceptance:
  - No Chart.js tick-limit warning in the console across all TF presets and the customs '1 / 1 1000', '1 / 1e-10 1 1' and '1 2 3 4 5 / 1 2 3 4 5' (`node test-results/audit/qa/20-morphwarn.mjs src`).
  - The 1/(s+1000) pole-zero ticks are nice values including 0, with non-overlapping label boxes.
  - Charts page: a time chart with fixed range [−15000, 10000] shows ticks at multiples of 5000.
  - The y-title box never intersects the tick labels for values up to 1e7.

**FND-04 — Off-screen charts coalesce redraws for updates and resizes** (PERF-04, PERF-10)
- Evidence: settleOffscreen() (~L975–983) uses `setTimeout(…, kind === 'time' ? 400 : 0)`, so off-screen step, pz and Bode charts render after every update.
  - During a ζ drag: 61/52/45/45 hidden Chart.update calls (561 ms). Forcing 400 ms gives 8/7/7/7 and +46 % input moves handled.
  - A width resize costs 75–181 ms, with all 8 charts redrawn, 6–8 of them off-screen.
- Fix:
  - While a chart is off-screen, every chart kind gets one trailing coalesced render, at least 400 ms after the last change.
  - A dirty chart renders immediately when it becomes visible.
  - Off-screen resize redraws are deferred to that render, or Chart.js `resizeDelay` ≥ 100 ms is used.
  - Add a `beforeprint` flush and an exported `DSL.viz.charts.flush()`, so print and full-page captures never show stale data.
- Acceptance:
  - A 3 s ζ drag at 1440×900 with the TF charts below the fold makes at most 10 Chart.update calls per hidden chart (was 45–61).
  - 500 ms after the drag, the hidden charts hold the final data.
  - 20 width resizes between 1024 and 1440 make at most 3 renders per off-screen chart.
  - Visual and fullPage tests are unchanged.

**FND-05 — Charts draw on when first seen, and stems wipe with the curve** (DES-11, chart part)
- Evidence:
  - The reveal wipe (REVEAL_MS 650) runs at creation while `visible` is still null; tween() skips only when visible === false. The TF step chart is created at 1104 ms but first seen at 2363 ms, so it is already fully drawn.
  - The chLayer plugin calls ctl.drawUnder() (the stems) before it applies the reveal clip (~L836). The «Ecuaciones» stems appear at full height before the dots and curve.
- Fix: hold the first reveal until the chart's first onVisible(true) and play it then, once; later updates morph as today. Apply the clip before drawUnder so all layers wipe together. Under reduced motion there is no wipe.
- Non-goal: no per-section `.ds-reveal` (SKILLS_BRIEF §9).
- Acceptance (charts page/e2e):
  - A chart created off-screen reports `stats().tweening === true` in the first frames after it scrolls into view.
  - At reveal progress 0.5, no stem pixel lies right of the clip x.
  - Under reduced motion, the final state is shown immediately.

**FND-06 — One clean first paint: CLS < 0.05 and no empty header** (DES-04, PERF-01)
- Evidence: CLS is 0.896 at 1440, 0.746 at 1024, 0.434–0.544 at 820 and 0.607 at 390, in both src and dist. The empty 202 px `.app-section` shells (padding only) shift when app.js mounts everything at about 746 ms. The header glass shows without its wordmark from about 238 to 615 ms. Targets: CLS < 0.1 (ARCHITECTURE §14.6, SKILLS_BRIEF §6).
- Fix:
  - In `css/base.css`, `html.js:not([data-ready])` hides `.app-header`, `.app-main` and `.app-footer` with `visibility: hidden`. Invisible boxes do not count as shifts.
  - A 3 s fallback keyframe makes them visible if data-ready never arrives.
  - On `html[data-ready]`, the content fades in once with opacity over `var(--dur-reveal)`, with no fade under reduced motion.
  - app.js keeps setting data-ready at the end of the mount loop.
  - The no-JS path (no `html.js`) is unaffected.
- Acceptance:
  - A layout-shift PerformanceObserver (excluding hadRecentInput) measures CLS < 0.05 at 1440×900, 1024×768, 820×1180 and 390×844, in src and dist.
  - No screencast frame shows the header bar without its wordmark.
  - LCP < 2.5 s.
  - With JavaScript disabled, the noscript text is visible.

**FND-07 — Lazy-init helper: idle pre-init in phases, so jumps never show blanks** (DES-05, PERF-07, COV-09, foundation part)
- Evidence:
  - Sections initialise on first visibility (gallery 200 px, tfengine 300 px, wizard 400 px, concept cards 200 px) as single tasks of 69–281 ms at 1× and 625–1315 ms at 4× CPU.
  - Nav jumps show an 864–938 px blank band.
  - After an instant jump to «Ecuaciones», the grid stays blank for 330–460 ms because `.ds-reveal` waits for its observer plus 380 ms.
- Fix:
  1. Add `DSL.util.lazyInit(el, phases, { rootMargin }) → { ensure(), get done, destroy() }` in `js/core/ns.js`.
     - `phases` is a function or an array of functions, each run exactly once, in order.
     - When `el` comes within rootMargin of the viewport, all remaining phases run synchronously.
     - Otherwise, starting 800 ms after 'app:ready' (after the hero load sequence), a shared FIFO idle queue runs one phase per callback, in registration order. It uses requestIdleCallback with a 2000 ms timeout, or a setTimeout fallback.
     - `ensure()` runs the rest synchronously.
     - At the end it sets `el.dataset.lazy = 'done'`.
     - A phase that throws logs console.error and stops that instance.
  2. Export `util.yieldTask()`: scheduler.yield when available, otherwise a setTimeout(0) promise.
  3. `js/ui/shell.js` scrollTo() sets `html[data-jumping]` while a programmatic jump and its settle are running. `css/components.css` gives `html[data-jumping] .ds-reveal` its final state with no animation.
  - Document in `docs/api/ns.md` and `docs/api/shell.md`.
- Interface: HC-12, WZ-08, GAL-12 and TFE-15 adopt lazyInit, falling back to their current onVisible path when it is absent.
- Acceptance:
  - `tests/unit/ns.test.mjs` with fake IntersectionObserver and requestIdleCallback:
    - Phases run once.
    - Visibility runs the rest synchronously.
    - The idle queue runs one phase per callback, in order, and nothing runs before app:ready + 800 ms.
    - ensure() is synchronous.
    - data-lazy is set.
  - Shell e2e: an instant nav jump to the «Ecuaciones» card shows its content at opacity 1 within 100 ms.

**FND-08 — The header is never transparent over content after a jump** (DES-13)
- Evidence: the sentinel IntersectionObserver (`js/ui/shell.js` ~L472–477) leaves `.is-at-top` in place for one frame after jumps, at scrollY 787–6046.
- Fix: scrollTo() sets the header's is-at-top state synchronously from the target position before it scrolls. The observer stays for ordinary scrolling.
- Acceptance: shell e2e rAF sampling during nav-link jumps to every section, with smooth scrolling and with reduced motion, finds no sample with `.is-at-top` and scrollY > 8.

**FND-09 — Width changes keep the reading position** (PERF-08)
- Evidence: resizing from 1440 to 390 at #galeria leaves scrollY at 5713, with the gallery 3617 px away. Going from 1920 to 960 lands 375–943 px back. Fixed paddings alone did not help (verifier).
- Fix: shell.js records the topmost visible section and its offset (from the scrollspy observer or at scrollend). On a width change (innerWidth differs), it restores scrollY after layout, with a double rAF and once more after lazy growth within 500 ms. It skips height-only resizes, an active settle() and user input during the resize.
- Acceptance (shell e2e):
  - At #modelado, #galeria, #transferencia and #conceptos, resizing 1440→390, 390→1440 and 1920→960 leaves the same section's top within ±80 px of the header bottom after 1 s.
  - Height-only resizes (390×844 ↔ 390×760) do not change scrollY.

**FND-10 — Readout values share a baseline** (DES-15)
- Evidence: `.ds-readout` (`css/components.css` ~L1043) is a grid with align-content: start, so wrapped labels push values down. Gallery at 1440: value offsets of 35/73/55/35/35/73/32 px. Conceptos at 1024: the «ts» value sits 16 px low.
- Fix: `.ds-readout { grid-template-rows: 1fr auto; align-content: stretch }`, which puts the label at the top and the value at the bottom. The inline variant is unchanged.
- Acceptance: in `.gl-readouts` at 1440 and 1024, and in the concept readout rows at 1024, value tops within one visual row differ by at most 2 px.

**FND-11 — Forced colours keep the play glyph, selections, switch and slider visible** (A11Y-03, high)
- Evidence: under forced-colors: active, these become Canvas: `.ds-playglyph__a/__b` (components.css ~L1022–1040), `.ds-seg__thumb`, `.ds-tabs__indicator`, the toggle track and thumb, `.ds-slider__rail/__fill`, and the active-nav underline (shell.css). Only charts.css:318 and wizard.css:1290 have forced-colors rules.
- Fix: add `@media (forced-colors: active)` rules.
  - Play glyph: forced-color-adjust: none with background ButtonText, or an SVG.
  - Selected segment, tab or nav link: a 2px solid Highlight outline or border, or a Highlight background with HighlightText.
  - Switch: track with a 1px ButtonText border, thumb in ButtonText, checked track in Highlight.
  - Slider: rail with a 1px ButtonText border, fill in Highlight.
- Interface: GAL-06 covers `.gl-sys`.
- Acceptance: on the kitchen sink and in shell e2e with `emulateMedia({ forcedColors: 'active' })`:
  - Each component's indicator computes to a non-Canvas colour.
  - The play-glyph box contains non-Canvas pixels.
  - The selected 1× segment can be told apart.

**FND-12 — Forced colours do not hide KaTeX base glyphs** (A11Y-04, high)
- Evidence: the forced-colors backplate on `.accent-body` hides the base letter. «ẋ(t)» renders as «˙(t)», and «m ẍ + b ẋ + k x» loses its x.
- Fix: in `css/base.css`, `@media (forced-colors: active) { .katex { forced-color-adjust: none; color: CanvasText } }`. KaTeX descendants, including semantic colour classes such as `.ds-tex-pole`, also render in CanvasText or system colours, so nothing is invisible on Canvas.
- Acceptance:
  - A forced-colors screenshot of `\dot{x}` on the kitchen sink has ink pixels in the base glyph's box.
  - Normal mode is pixel-unchanged.

**FND-13 — Header and footer reflow at 320 px** (A11Y-05, shell part)
- Evidence: at 320×640, scrollWidth is 368. sh-actions/sh-menu-toggle spans 266..355 and its label reads «Me…»; the footer lead and credits span 16..368. At 360 px the footer still overflows by 8 px.
- Fix: below about 360 px, hide the «Menú» text but keep its accessible name, and let the wordmark shrink. Footer grid children get min-width: 0 and overflow-wrap: anywhere.
- Interface: GAL-06 fixes gl-params-restore. The tf-roots inner scroller needs no change.
- Acceptance:
  - At 320×640 and 360×740, no header or footer element extends past the viewport.
  - The Menú button is fully visible and named «Menú».

**FND-14 — Slider reset keeps focus** (A11Y-06, QA-08, component part)
- Evidence: components.js render() sets `resetBtn.disabled = !dirty` (~L339). After Enter on a reset button (for example gl-param-k-reset), focus falls to BODY. This happens for every slider.
- Fix: before the focused reset button becomes disabled, move focus to that slider's range input (preventScroll).
- Acceptance: in ui e2e or the kitchen sink, Enter on a dirty slider's reset leaves activeElement on that slider's range input. The same holds in the gallery and the TF engine.

**FND-15 — The undo toast is reachable from the keyboard** (A11Y-07)
- Evidence: the toast with «Deshacer» auto-dismisses at 5 s, is appended at the end of body, and took 59 Tab presses to reach from the gallery and 29 from TF. The timer pauses only on hover or focus inside (components.js toast ~L1382–1440).
- Fix:
  - ui.init tracks the last input modality (keydown versus pointerdown).
  - When a toast with an action is created after keyboard input, it focuses its action button.
  - Esc inside the toast dismisses it.
  - On dismiss with focus inside, focus returns to `opts.returnFocus` (an element or a function) when it is focusable. Otherwise it returns to the element focused before the toast, if that is still connected and enabled.
  - Pointer-triggered toasts keep the current behaviour.
- Interface: GAL-07 passes returnFocus.
- Acceptance (kitchen-sink e2e):
  - A keyboard-triggered action toast focuses its action within one frame.
  - Enter runs the action and focus returns.
  - Esc dismisses and focus returns.
  - A mouse-triggered toast does not take focus and closes after 5 s.

**FND-16 — The selected segment is visible at 3:1** (A11Y-08)
- Evidence: in ds-seg, thumb versus track is 1.42:1 dark and 1.05:1 light; the ring is 2.35 and 1.63; the label change is 1.99 and 2.34; the weight is 500 in both states.
- Fix: give the selected option a 3:1 indicator (a 2px bottom bar or inset border in --accent) and a label weight of 600. Keep the 220 ms sliding thumb.
- Acceptance:
  - The indicator's computed contrast against the track is ≥ 3:1 in both themes.
  - axe reports no violations.
  - A kitchen-sink screenshot shows the selected 1× clearly.

**FND-17 — Slider number field: errors announced, clamps explained, typing never clobbered** (A11Y-10, QA-12, COV-03, component part)
- Evidence:
  - errEl (components.js ~L312) has no live role, so the «abc» error is not spoken.
  - Typing 999 silently becomes 50.0.
  - The message reads «… 150 unid.. Se acepta…» (~L405).
  - api.set() (~L480) forces editing = false and rewrites numberEl, so a loop calling set({ silent: true }) overwrites typing (Conceptos t field).
- Fix:
  - errEl gets role="alert"; it stays in the DOM and its text is set when shown.
  - On a clamp, show a polite note «Se ajustó a 50 N/m (máximo).» for about 4 s.
  - Do not append '.' after a unit that already ends with '.'.
  - set(v, { silent: true }) leaves numberEl and `editing` untouched while numberEl is focused and being edited.
  - Add an `onEditStart` option, fired on the first focus or input of the number field.
- Interface: HC-03.
- Acceptance:
  - ui unit test: focus the field, type '3', call set(1.25, { silent: true }): the field still shows '3', and Enter commits 3.
  - e2e: 'abc' + Enter → getByRole('alert') contains the message.
  - 999 + Enter → a status contains «Se ajustó a».
  - No market message contains '..'.

**FND-18 — Legend swatches show each series' dash pattern** (A11Y-13, legend part)
- Evidence: keySvg() (~L525–575) draws a fixed '4 3' dash for any dashed series, so distinct dash arrays look identical in the HTML legend.
- Fix: when a series' dash is an array, draw the swatch with that array, scaled to the 22 px swatch.
- Interface: HC-04 assigns distinct arrays.
- Acceptance (charts page): series with [2,3] and [8,3] get swatches whose stroke-dasharray matches each pattern and differs between them.

**FND-19 — The chart keyboard hint does not mislead screen-reader users** (A11Y-17)
- Evidence: KEY_HINT (`js/viz/charts.js:38`) promises arrow-key exploration, but role=img keeps NVDA and JAWS in browse mode.
- Fix: keep role=img and tabindex (SKILLS_BRIEF §3). Reword the hint: «Con el teclado: flechas para recorrer los datos (Mayús: de uno en uno), Inicio y Fin para los extremos, Escape para ocultar el detalle. Con lector de pantalla, active el modo de foco o use «Ver datos».»
- Non-goal: role=application.
- Acceptance: the hint contains «Ver datos» and «modo de foco», and canvases keep role img.

**FND-20 — Help buttons toggle their tooltip** (A11Y-19)
- Evidence: focus opens the tooltip and Esc closes it. Enter or Space afterwards does nothing; data-state stays closed.
- Fix: Enter or Space on a `.ds-help` button (a [data-tip] button with no other action) toggles the tooltip. It stays open until Esc, blur or a second activation.
- Acceptance (ui e2e): focus gl-param-k-help → open; Esc → closed; Enter → open; Enter → closed.

**FND-21 — Touch targets are 44 px with a coarse pointer** (A11Y-21)
- Evidence: under (pointer: coarse), --control-h-sm is 44px, yet .ds-seg options are 36 px tall and .ds-slider__number fields are 60×32 px (29 controls in total).
- Fix: size `.ds-seg__opt` and `.ds-slider__number` heights from `var(--control-h-sm)`. Fine-pointer sizes do not change.
- Interface: WZ-06 covers wz-mark.
- Acceptance:
  - At 390×844 with hasTouch, every `.ds-seg__opt` and `.ds-slider__number` is at least 44 px tall.
  - Desktop visual baselines are unchanged.

**FND-22 — Readouts can carry an explanatory tooltip** (COV-02, component part)
- Evidence: ui.readout (components.js ~L1293) has no tip option. ui.chip already supports `title`.
- Fix: `readout({ tip })` renders a keyboard-reachable trigger, reusing the `.ds-help` «?» pattern named «Explicación de «<label>»», plus sr-only text. The layout is unchanged when tip is absent.
- Interface: GAL-11, with tips from CORE-13.
- Acceptance: on the kitchen sink, a readout with a tip shows the tooltip on hover and on focus; its help button has the name above; axe reports no violations.

### Group scenes (`js/viz/scenes/*.js`, `css/scenes.css`, `tests/pages/scenes.html`, `tests/e2e/scenes.spec.mjs`, `docs/api/scenes.md`)

**SCN-01 — The market scene stays legible for any state** (QA-07, COV-06, scene part)
- Evidence: with d = 4, b = 2 the strip reads «P = −819185.000 Qd = 1638470.000Qs = −3276730.000». `fix()` uses 3 fixed decimals in a 118 px SLOT (`js/viz/scenes/market.js` ~L16–17 and ~L176–179). «P* = 15», «Q* = 70» and «Demanda» overprint at the origin, and the web leaves the P–Q frame.
- Fix:
  - Format strip values with significant digits that fit the slot (for example 4 significant digits, with a compact scientific form above 1e5), keeping tabular figures and a visible separator between slots.
  - Place the P*, Q* and curve labels with collision avoidance.
  - Clip the cobweb path to the plot rectangle.
- Interface: CORE-12 keeps typical values in range; this item is the fallback.
- Acceptance (`tests/e2e/scenes.spec.mjs` on `tests/pages/scenes.html`), with forced values P = −819185, Qd = 1638470, Qs = −3276730 and with P* near the origin:
  - No two strip or label boxes intersect.
  - Every strip text fits its slot.
  - The cobweb path's bounding box lies inside the plot rectangle.
  - Existing scene tests pass.

**SCN-02 — Labels drawn over fluid keep 4.5:1 contrast** (A11Y-18, scene part)
- Evidence: the 13 px Torricelli «h₀» label over water measures 4.41:1 dark and 3.2:1 light.
- Fix: give labels drawn over fluid in `js/viz/scenes/tanks.js` a plot-background halo (paint-order stroke) or a backing pill, using existing tokens.
- Acceptance: pixel-sampled contrast of «h₀», and of every other label over water, is at least 4.5:1 in dark and light themes at the default level and a full tank (scenes spec).

### Group hero-concepts (`js/sections/{hero,concepts}.js`, `css/sections/{hero,concepts}.css`, `tests/e2e/hero-concepts.spec.mjs`, `docs/api/hero-concepts.md`)

**HC-01 — The methods table measures RK4's observed order against a reference accurate enough** (MATH-04, QA-14)
- Evidence: in `js/sections/concepts.js` L43, PEND sets refRtol 1e-10, refAtol 1e-12 and orderFloor 1e-8. The reference's own error is about 6.4e-9 at θ0 = 80°. RK4 order as shown, with the true order in brackets:
  - θ0 = 150°: h = 0.006 → 0.42 (3.10); h = 0.008 → 0.67 (3.09); h = 0.01 → 1.77 (3.81).
  - θ0 = 80°: h = 0.008 → 2.65 (3.91); h = 0.01 → 3.20 (3.88).
  - θ0 = 170°, h = 0.005: −0.86, with an error of 3.2e-8.
- Fix:
  - Compute the reference with rk45 at rtol 1e-13 and atol 1e-15, raising maxSteps if needed, and cache it as today.
  - Estimate the reference error once per θ0 as \|ref(1e-13) − ref(1e-12)\|.
  - Show an observed order only when both errors of the pair exceed 100× that estimate and the ratio is ≥ 1. Otherwise show «—» with the note «error en el nivel de la referencia».
- Acceptance (`tests/e2e/hero-concepts.spec.mjs`):
  - θ0 = 150° at h = 0.006/0.008/0.01: the RK4 cell is «—» or within ±0.35 of 3.10/3.09/3.81.
  - θ0 = 80° at h = 0.008/0.01: within ±0.35 of 3.91/3.88, or «—».
  - θ0 = 170°, h = 0.005: never negative.
  - Euler and Heun cells are unchanged to 2 decimals.
  - Card init grows by at most 50 ms at 1×.

**HC-02 — The superposition verdict handles a zero input** (QA-10)
- Evidence: Torricelli with u₁ or u₂ = 0 reads «No se cumplen … difiere un 0 % … (0 %)» (concepts.js ~L1217–1263). The verdict comes from the variant, not from the inputs.
- Fix: when either input is 0, show the neutral note «Con una entrada nula la prueba es trivial: elija dos entradas distintas de cero.» Otherwise keep the variant's verdict.
- Acceptance (e2e):
  - Torricelli with u₁ = 0 (Home key): no «No se cumplen», and the neutral note is shown.
  - Both inputs non-zero: «No se cumplen» with a non-zero mismatch.
  - The linear variant is unchanged.

**HC-03 — In «El tiempo t», typing in the t field pauses playback** (COV-03, concept part)
- Evidence: the loop calls slider.set(B.t, { silent: true }) every frame (concepts.js ~L872–879). While playing, typing «3» shows 1.25, and Enter commits t = 1.40 with playback still on.
- Fix: stop playback on focusin or the first input of the t slider's number field, using the slider's `onEditStart` (FND-17) or a focusin listener on its `.ds-slider__number`. The typed value then commits through onChange, which already stops playback.
- Interface: FND-17 also stops set() from overwriting the field. Either side alone improves the behaviour.
- Acceptance (e2e): while playing, click the t field, select all, type 3 and press Enter: t = 3.000, playing is false, and the field shows 3.00. Paused behaviour is unchanged.

**HC-04 — Multi-series concept charts are not distinguished by hue alone** (A11Y-13, concept part)
- Evidence:
  - concepts.js:1273–1276 (Superposición): y1, y2, y12 and mismatch are all solid; only «Suma» is dashed.
  - concepts.js:1361 (Métodos): Euler, Heun and RK4 are all solid; only the RK45 reference is dashed.
- Fix: assign distinct dash arrays.
  - Superposición: u₁ solid, u₂ [2,3], u₁+u₂ [8,3], Suma [6,4] (as now), Desajuste fill plus solid.
  - Métodos: Euler [8,3], Heun [2,3], RK4 solid, RK45 [6,4].
- Interface: FND-18 draws these arrays in the legend.
- Acceptance (e2e): in both charts, no two visible datasets share both colour token and borderDash.

**HC-05 — The controller block stays readable while feedback is off** (A11Y-09 (a))
- Evidence: concepts.css:276, `[data-loop="open"] > .cc-bd__node--ctl { opacity: .45 }`. «Controlador» and «K = 6 N/m, r = 1 m» measure 2.51:1 dark and 2.07:1 light in the default state.
- Fix: no opacity on text. De-emphasise with the dashed border (already present), --muted text and dimmed strokes only.
- Acceptance: pixel-sampled contrast of those labels is at least 4.5:1 in both themes in the default open-loop state, and axe reports 0 color-contrast issues on the card.

**HC-06 — Lazy cards never expose raw LaTeX or unlabelled canvases** (A11Y-15)
- Evidence: before init, «Ecuaciones de representación» and «Métodos numéricos» expose raw TeX («\frac{dy}{dt} = …») and an empty «Producto —». The canvases cc-eq-chart, cc-sup-chart and cc-num-chart have no role or label.
- Fix: at build time, either typeset immediately (KaTeX is synchronous) or render the TeX placeholder aria-hidden with a plain-text sr-only reading. Give every canvas role="img" and an aria-label when it is created.
- Acceptance: right after data-ready, with no scrolling, the ARIA snapshot of #conceptos contains no backslash TeX commands, and every canvas has role img and a non-empty name.

**HC-07 — The «tiempo» demo makes no layout reads in the frame loop** (PERF-03)
- Evidence: paint() (~L941) calls sizeCanvas() every frame (~L400–405, which reads clientWidth/clientHeight), and ctx.font is set after the readouts are written (~L963). That is about 2 forced layouts per frame, or 368–387 per 3 s at 1×.
- Fix: cache the size from the existing util.observeSize callback, set ctx.font once per resize or theme change, and write the slider and readout DOM after drawing.
- Acceptance:
  - A 3 s autoplay trace has at most 10 forced layouts attributable to concepts.js.
  - The demo still runs at 60 fps.
  - The canvas backing store equals CSS size × dpr after a resize.

**HC-08 — Concept grid at 900–1199 px, and reserved card heights** (DES-10, DES-05 cards)
- Evidence: at 1024, the «tiempo» card (span 5, 386 px) stretches to the 1327 px row of «ecuaciones» (span 7) and leaves about 230 px empty. The row grows from 1128 to 1327 px, and «linealidad» from 954 to 1091 px, when the cards initialise.
- Fix:
  - `@container cc (min-width: 900px) and (max-width: 1199px)`: «tiempo» and «ecuaciones» both span 12.
  - «tiempo» lays out text and plot side by side when its own container is at least 700 px.
  - Reserve the final chart geometry (aspect-ratio or min-height on chart and plot frames) so init does not change card heights.
  - Layouts at ≥ 1200 and < 900 are unchanged.
- Acceptance:
  - At 1024×768, no card has more than 48 px of empty space below its last child.
  - The «tiempo» plot is at least 480 px wide.
  - Card heights before and after init differ by at most 8 px.

**HC-09 — Type hierarchy in Conceptos** (DES-14)
- Evidence: `.cc-card__title` is 36 px, equal to the section h2. `.cc-lead` is 24 px, while the other section leads are 17 px.
- Fix: `.cc-card__title { font-size: var(--text-lg) }`. `.cc-lead` uses var(--text-base) with the same colour and leading as the other section leads.
- Acceptance: computed sizes are 24 px for card titles, 36 px for the section h2, and the gallery lead's size for .cc-lead. Card titles take at most 2 lines at 390, 768 and 1440.

**HC-10 — The Ecuaciones discrete chart keeps one x frame** (DES-18)
- Evidence: «Escalera» sets x to [0, 8] permanently, through computeAxes niceBounds(0, 6, pad .04), while the data ends at 6. «Tallos» gives [−0.18, 6.18].
- Fix: create the chart with `xRange` equal to the Tallos frame for both styles. createXYChart supports xRange, as the sup and num charts already show.
- Acceptance: x min/max are identical in both styles and after T changes, and the last data point sits within 4 % of the right edge.

**HC-11 — The hand-off to «Linealidad» lands below the header** (QA-16)
- Evidence: from wizard SIR step 2, «wz-open-concepts» leaves the card top at −1, 0 or −21 px in 6 of 6 runs, with the heading under the 64 px header. The gallery hand-off lands at 80 px. The shell's scroll to #conceptos and open()'s card scrollIntoView (~L1496) race while lazy sections grow.
- Fix: in open(), after the card scroll, re-align once scrolling ends (scrollend, or a ~700 ms fallback). Re-align once more after the next size change within 1.5 s if the card top is outside [header-h, header-h + 40 px]. Cancel on user input.
- Acceptance (e2e):
  - In 5 of 5 runs, the card top is at or below the header bottom and the heading is fully visible.
  - Focus is on cc-lin-tabs-superposicion.
  - The gallery hand-off is unchanged.

**HC-12 — Concept cards pre-initialise in idle time** (DES-05, PERF-07, concepts part)
- Evidence: per-card init via util.onVisible(…, { once: true, rootMargin: '200px' }) (~L1471) takes 69–134 ms at 1× and 625–1033 ms at 4× CPU. After a jump, the grid stays blank for 330–460 ms.
- Fix: use util.lazyInit(card.el, phases, { rootMargin: '200px' }) when available (FND-07). Split each card's init into phases (DOM and TeX, chart creation, first compute) of about 50 ms or less each. open() calls ensure().
- Acceptance:
  - After load plus 5 s idle with no scrolling, every card has data-lazy="done".
  - The longtask observer sees no task longer than 120 ms from concepts init at 1×.
  - concepts:open still works synchronously.

### Group wizard (`js/sections/wizard.js`, `css/sections/wizard.css`, `tests/e2e/wizard.spec.mjs`, `docs/api/wizard.md`)

**WZ-01 — A step change plays out, then in, and the panel height eases** (DES-01, high)
- Evidence: transition() (wizard.js ~L999–1021) adds .is-leaving and .is-entering in the same frame. Both steps share grid-area 1/1 (wizard.css ~L209–240), and the 150 ms exit overlaps the 250 ms entry. For about 40–90 ms both steps are above 0.2 opacity: headings, «12» numerals and diagrams superimpose. The panel height snaps (1068 → 861 → 1005 → 1198 px).
- Fix:
  - Make the change sequential: `.wz-step.is-entering { animation-delay: var(--dur-step-out) }`. The fill-mode both keeps the entering step at opacity 0 during the delay. The tIn timeout becomes out + in + 20 ms.
  - Keep the brief's 150 ms out and 250 ms in; do not shorten them.
  - Tween the `.wz-stage` height from old to new over var(--dur-morph) var(--ease-out): measure, set an inline height, clear it on transitionend. No tween under reduced motion. This is the same layout-animation exception the brief makes for expand/collapse.
  - If the new step's top ends above the header, scroll the stage to block start, respecting scroll-margin.
- Acceptance (wizard e2e, frame sampling at 1440×900):
  - No sampled frame has both steps above 0.05 opacity.
  - The whole change takes at most 450 ms.
  - The `.wz-stage` height changes over at least 3 frames, not in one jump.
  - Under reduced motion the swap is instant.
  - Arrow-key navigation still works.

**WZ-02 — Step 3 term buttons have accessible names** (A11Y-01, high)
- Evidence: termButton() (~L1349) holds only KaTeX, the captions are aria-hidden, and every button shares one aria-describedby. Each button computes role=button with name="" (axe button-name, critical: 4/4/3/5 buttons for the four examples).
- Fix: give each term an aria-label with a plain-text reading, for example «Término 1 de 4: inercia, m·ẍ». Point aria-describedby at that term's own explanation, or remove it, instead of the shared detail panel.
- Acceptance:
  - axe reports 0 button-name violations in step 3 for all 4 examples, in both themes.
  - Every `.wz-term` has a unique, non-empty accessible name.

**WZ-03 — Focus stays in step 3 when its buttons disable themselves** (A11Y-06, QA-08, wizard part)
- Evidence: wz-term-next on the last term, wz-term-replay and wz-term-all disable themselves (~L1413–1425), and activeElement becomes BODY.
- Fix: move focus before disabling.
  - «Término siguiente» on the last term → the last revealed term button.
  - «Mostrar todo» → the last term button.
  - «Repetir» → the first term button, or «Término siguiente» once it is enabled.
- Acceptance (keyboard e2e): after each of these activations, document.activeElement is inside the step and is not BODY.

**WZ-04 — RMSE announcements are debounced** (A11Y-11, wizard part)
- Evidence: 10 ArrowRight presses on wz-calib-input produce 10 polite announcements (wizard.js:1740).
- Fix: debounce at about 450 ms, as tfengine.js:1044 does, and announce only the settled value.
- Acceptance: 10 ArrowRight presses at 180 ms intervals produce at most 2 ds-live updates.

**WZ-05 — The residuals chart gets «Ver datos»** (A11Y-14)
- Evidence: wizard.js:1679–1681 creates wz-residuals without dataToggle. SKILLS_BRIEF §3 requires a toggle for every chart.
- Fix: `dataToggle: true` with a table of t and the residual.
- Acceptance: step 4 has two «Ver datos» toggles, and the residual table has as many rows as there are measured points.

**WZ-06 — Wizard contrast and touch targets** (A11Y-09 (b), A11Y-18 wizard part, A11Y-21 wz-mark)
- Evidence:
  - Step 2 non-highlighted parts sit at opacity .24/.45 (wizard.css ~L415–425). SIR «Contagio», «βSI/N» and «γI» measure 2.04:1 dark and 1.65:1 light by default, because a law is pinned. Tank labels measure 1.57–2.04, mass-spring 1.92–2.05.
  - «Frontera del sistema» over water measures 3.97:1 in light theme.
  - Rail markers wz-mark are 32 px tall with a coarse pointer.
- Fix:
  - Dim only strokes and fills. Text in non-highlighted parts uses --muted at full opacity, or --subtle where that still passes 4.5:1.
  - Give the boundary label a halo or backing.
  - Under pointer: coarse, wz-mark gets min-height var(--control-h-sm).
- Acceptance:
  - Pixel-sampled text contrast is at least 4.5:1 for every step 2 label, default and highlighted, and for «Frontera del sistema», in both themes.
  - axe reports 0 color-contrast issues in the wizard states.
  - At 390×844 with a coarse pointer, wz-mark is at least 44 px tall.

**WZ-07 — Step intros name the request's families** (COV-01, wording part)
- Evidence: the STEPS[1] intro (wizard.js:33) says «…un balance de masa o de población…» and omits energía. Step 1 never says temperatura.
- Fix: the step 1 intro names the generic inputs (fuerzas, voltajes, flujos) and outputs (velocidad, nivel, temperatura…). The step 2 intro names «balances de masa y energía» next to Newton, Kirchhoff and población.
- Non-goal: a thermal example.
- Acceptance (wizard e2e): the step 1 intro contains «temperatura», the step 2 intro contains «energía», and there is no overflow at 390.

**WZ-08 — The wizard is built in idle time, and a jump past it lands on target** (COV-09, DES-05)
- Evidence: the lazy build (wizard.js:1788, rootMargin 400 px) grows #modelado from 758 to 1512 px during a scrollIntoView jump, so #galeria ends with its top at 818 px instead of 64.
- Fix: use util.lazyInit(root, phases, { rootMargin: '400px' }) when available (FND-07), so step 1 is built in idle time after ready. Until it is built, reserve the measured step 1 height on `.wz-stage`, per breakpoint.
- Acceptance:
  - 5 s after load, scrollIntoView of #galeria from #conceptos puts the #galeria top within ±8 px of the header bottom.
  - Even before the idle init, #modelado changes height by at most 40 px when it is built.
  - No init task is longer than 120 ms at 1×.

### Group gallery (`js/sections/gallery.js`, `css/sections/gallery.css`, `tests/e2e/gallery.spec.mjs`, `docs/api/gallery.md`)

**GAL-01 — The Torricelli level chart shows the dashed linear prediction** (MATH-11, gallery part)
- Evidence: chartPlan() (gallery.js ~L193–197) forces `dash: false` on every output.
- Fix: honour `o.dash`. The `hLin` output from CORE-05 then appears as a dashed --c-out series in the same chart as h, labelled «Nivel lineal (aprox.)» in the legend and included in «Ver datos». The scene ignores it.
- Acceptance (gallery e2e, Torricelli with a 20 L/s step):
  - The level chart has two series, one of them dashed.
  - At the end of the run, the table's last rows show ≈ 1.274 m and ≈ 1.070 m.
  - The other systems' charts are unchanged.

**GAL-02 — A cobweb domain halt is explained** (QA-07 (d), COV-06, gallery part)
- Evidence: onHalt (gallery.js ~L819–827) only knows the stateBound halt and its hint.
- Fix: when the halt reason is a domain exit (CORE-12), show it in gl-halt with the action «Acerque P₀ a P* o baje d por debajo de b y pulse «Reiniciar».» Keep the callout until reset. After Reiniciar, the hint says the run is paused at t = 0.
- Acceptance (d = 2.4, b = 2):
  - gl-halt is visible within one period, and its text mentions «dominio» and «Reiniciar».
  - No negative price appears beyond the first crossing in the charts or tables.

**GAL-03 — Gallery charts keep a usable plot height at 1024–1279 px** (QA-09)
- Evidence: in market telaraña, gl-chart-2 is 117 px tall with a 49 px plot at 1024, and a 61 px plot at 1280. The y title is clipped as «Cantidad (unid».
- Fix: give every `.gl-chart` a minimum plot height of 160 px (via `--ch-plot-min-height`) and let `.gl-charts` grow. At narrow widths, put the legend on one line or shorten the y title.
- Acceptance: at 1024×900 and 1280×800, every gallery chart for every system and variant has `chart.chartArea` at least 160 px tall, and no y title is clipped.

**GAL-04 — Switching systems: smooth out, build, in, with no axis jump** (DES-09)
- Evidence: crossfade() (~L435–446) runs destroySystem/buildSystem synchronously at SWITCH_OUT_MS, which freezes the fade-out (SIR opacity 0.84 at 100 ms, then 0 at 310 ms). Long tasks: tanks 102 + 52 ms, rlc 65, sir 180, market 130. The charts start at y [−1, 1] and jump once samples arrive (massSpring 182→621 ms, tanks 223→709, market 207→636).
- Fix: let the fade-out finish, then build in yielded chunks (header and scene, then charts, then the first paint) and fade in. Create every chart with the predicted y-range (predictRanges) before its first paint.
- Acceptance (switching through all 5 systems at 1440×900):
  - No long task longer than 100 ms on the click path at 1×.
  - Stage opacity decreases monotonically during the fade-out.
  - The y min/max of gl-chart-1 and gl-chart-2 are the same at the first painted frame and 1 s later, with no parameter change.

**GAL-05 — Category chips are readable at tablet widths** (DES-16, COV-04)
- Evidence: at 768 px all five `.gl-sys__cat` labels are clipped («Mecá…», «Hidrá…», «Eléct…», «Bioló…», «Econ…»). At 820, «Hidráulico» and «Económico» are clipped. Titles wrap to 2–3 lines.
- Fix: in `@media (min-width: 768px) and (max-width: 1023.98px)`, put the chip on its own row under the icon at full card width, or use the phone's scroll-snap rail with a minimum card width. Do not hide the chip (PRODUCT_SPEC §2.4).
- Acceptance:
  - At 768, 820, 900 and 1024, no `.gl-sys__cat` label has scrollWidth > clientWidth.
  - The selection plate still matches the selected card.
  - There is no page overflow.

**GAL-06 — Gallery forced colours and 320 px reflow** (A11Y-03 selected card, A11Y-05 parameters header)
- Evidence: under forced colours the selected system card cannot be told apart, because the plate becomes Canvas. At 320 px, gl-params-restore spans 138..344.
- Fix:
  - `@media (forced-colors: active) { .gl-sys[aria-selected="true"] { outline: 2px solid Highlight; outline-offset: -2px } }` and hide the plate.
  - The parameters panel header wraps (flex-wrap), with the restore button on its own line below about 360 px.
- Acceptance:
  - Under forced-colors emulation, the selected card has a non-Canvas outline.
  - At 320×640, no gallery element extends past 320 px.

**GAL-07 — «Restablecer parámetros» keeps focus, and the undo toast is reachable** (A11Y-06, A11Y-07, QA-08, gallery part)
- Evidence: gallery.js:1128 disables restoreBtn, so focus goes to BODY. The toast's «Deshacer» is 59 Tab presses away.
- Fix: before disabling the button, move focus to the first parameter slider's range input. Pass that input as `returnFocus` to ui.toast; FND-15 then focuses the action for keyboard users and returns focus on dismiss.
- Acceptance:
  - Space on gl-params-restore puts focus on gl-toast-action within one frame (with FND-15), or on the first parameter input (without it).
  - After the toast closes, focus is on the first parameter input.
  - A mouse activation does not move focus to the toast.

**GAL-08 — Readout announcements are debounced** (A11Y-11, gallery part)
- Evidence: announceReadouts (~L1290) fires on every input: 10 announcements for 10 ArrowRight presses.
- Fix: debounce at about 450 ms and announce only the final values.
- Acceptance: 10 ArrowRight presses at 180 ms intervals produce at most 2 ds-live updates.

**GAL-09 — Tab and panel names match the visible text** (A11Y-12)
- Evidence: each tab's aria-labelledby points to the name only (axe label-content-name-mismatch ×5). The stage's aria-labelledby resolves to the whole tab: category, name and summary.
- Fix: tab `aria-labelledby="<cat-id> <name-id>"` in visual order, with the summary in aria-describedby. Label the stage by the name element only.
- Acceptance:
  - axe reports 0 label-content-name-mismatch on #galeria at 1440 and 390, in both themes and in dist.
  - The stage's accessible name equals the system name.

**GAL-10 — No double period after units in status text** (QA-12, gallery part)
- Evidence: the status reads «15 u.m.. Cantidad de equilibrio: 70 unid..».
- Fix: append '.' only when the unit does not already end with '.' (a small helper in gallery.js).
- Acceptance: the market status and announcement texts contain no «..».

**GAL-11 — Readouts show their explanation** (COV-02, gallery part)
- Evidence: gallery readouts have no explanation (0 of 7 for mass-spring).
- Fix: in the readout builder (~L1250–1280), pass `r.tip` (CORE-13) to `ui.readout({ tip })` (FND-22). Ignore it when absent.
- Acceptance: once CORE-13 and FND-22 are in place, every gallery readout has a reachable tooltip whose text equals the model tip, and axe reports no violations.

**GAL-12 — The gallery is built in idle time, with final geometry** (DES-05, PERF-07, gallery part)
- Evidence:
  - The onVisible init (L1430, rootMargin 200 px) leaves a 938 px blank band on a nav jump, held by `.gl-stage[aria-busy]{min-height:44rem}`.
  - Init takes 162–281 ms at 1×: buildSystem 226 ms, of which the scene mount is 117 ms (including a forced layout at scenes/registry.js:540) and charts 72 ms. At 4× CPU it takes 1078–1315 ms.
- Fix: use util.lazyInit(root, phases, { rootMargin: '200px' }) (FND-07), with the phases rail → stage DOM and scene → charts → first frame, each about 50 ms or less at 1×. Replace the 44rem placeholder with min-heights equal to the measured built stage height per breakpoint, or with a skeleton of the final scene and chart frames.
- Acceptance:
  - 5 s after load, with no scrolling, #galeria has data-lazy="done".
  - A nav jump to Galería right after load shows no band taller than 120 px without scene or charts at 100 ms.
  - No init task is longer than 120 ms at 1×.
  - The #galeria deep link and gallery:open still work.

**GAL-13 — The animation loop is gated on the viewer** (PERF-09)
- Evidence: util.loop(tick, { element: stage }) (L1425) keeps simulating and drawing (20–35 % CPU, 60 layouts/s) while only the parameter panels are on screen.
- Fix: gate the scene render and chart pushes on the viewer element (scene plus charts). Keep the simulator time consistent, either paused or advanced headless, and document which.
- Acceptance:
  - With the viewer's bottom at least 100 px above the viewport top and the panels visible, there are 0 chart updates in 2 s and the main-thread CPU is under 5 %.
  - Scrolling back resumes without a jump.

### Group tfengine (`js/sections/tfengine.js`, `css/sections/tfengine.css`, `tests/e2e/tfengine.spec.mjs`, `docs/api/tfengine.md`)

**TFE-01 — «Paso siguiente» brings the whole new step under a sticky toolbar** (DES-02 high, A11Y-06/QA-08 tf-next)
- Evidence: nextStep() (tfengine.js ~L1429–1440) opens the step and calls `scrollIntoView({ block: 'nearest' })` while it is still collapsed. The new step's header lands at y ≈ 843 of 900, and the button moves to −248, −1494, −2212 and −2897. On the last step tf-next disables itself (L1417), and focus goes to BODY.
- Fix:
  - Use `block: 'start'`, with `.tf-step` scroll-margin-top = header-h + toolbar height + space.
  - Make `.tf-proc__actions` (inside `.tf-proc__head`) `position: sticky; top: calc(var(--header-h) + var(--space-2))` on an opaque surface: --surface-1, a 1px --line border and no backdrop-filter, so the Tier A count does not change.
  - Reveal the new step's blocks with the existing 250 ms step-in and a 60 ms stagger; none under reduced motion.
  - When the last step opens, move focus to that step's collapse button before disabling tf-next.
- Acceptance (1440×900 and 820×1180):
  - After each «Paso siguiente», the new step's top is within header + toolbar + 24 px of the viewport top, and tf-next stays visible.
  - After the last step, activeElement is the step 7 toggle.
  - Under reduced motion there is no smooth scroll or animation.

**TFE-02 — Tablet portrait: sliders and charts on screen together** (DES-03 TF part, COV-05)
- Evidence: at 768×1024 and 820×1180, `.tf-controls` is position: relative, because it is sticky only in `@container tf (min-width: 900px)` (tfengine.css ~L54–67). The b slider sits 1567–1592 px above the step chart.
- Fix:
  - Extend the two-column sticky layout to a lower container width chosen so that 768 px viewports qualify (about `@container tf (min-width: 680px)`), with a controls column of minmax(240px, 280px) and a main column of at least 380 px.
  - This keeps the brief's order: input → derivation → charts.
  - Phones (below 768 px viewport) keep the single column. The ≥ 900 px layout is unchanged.
- Acceptance:
  - At 768×1024 and 820×1180, with tf-chart-step fully visible, the first parameter slider is visible and operable.
  - No horizontal page overflow; KaTeX lines scroll inside their own block.

**TFE-03 — TF slider names fit on one line** (DES-16, TF part)
- Evidence: at 1024, «Amortiguamiento» wraps as «Amortigua-miento» (tfengine.css:119, hyphens: auto in `.tf-sliders`).
- Fix: in `.tf-sliders`, give the name its own row above the value and number field (label above, as SKILLS_BRIEF §4), with hyphens: manual.
- Acceptance: at 768, 820, 1024, 1280 and 1440, every `.tf-sliders .ds-slider__name` is a single line.

**TFE-04 — Step 4 explains why K, τ and ωn are undefined for pure low-order systems** (MATH-07)
- Evidence: the sentence at L399 («No es un primer ni un segundo orden puro…») is shown for 1/(s−2), 1/s, 1/s², 1/(s²+s) (the «Integrador» preset) and 1/(s²+s−2).
- Fix: branch on the cause. For a zero-free system of order 1 or 2 with a0 ≤ 0, say «Es un sistema de primer/segundo orden puro, pero tiene un polo en s = 0 (integrador) / con parte real positiva, así que τ (o ωn y ζ) no se definen…». Keep the current sentence only when the numerator adds zeros or the order exceeds 2.
- Acceptance (e2e): for those five systems, step 4 contains «orden puro» and the specific cause, and does not contain «No es un primer ni un segundo orden puro». The rlci case is unchanged.

**TFE-05 — Step and impulse samples follow the oscillation frequency** (MATH-08)
- Evidence: analyze() (L269) uses G.stepSamples(400, T), and renderImpulse also uses 400. For RLC v_C with R = 2 Ω, L = 1 H, C = 10 µF and a 6 s window, that is 1.3 samples per period, which draws a moiré.
- Fix: N = clamp(ceil(20·T·max\|Im p\|/(2π)), 400, 20000) for the step and the impulse. The minimum stays the brief's 400. «Ver datos» stays at 200 rows or fewer (FND-02). Document in `docs/api/tfengine.md`.
- Acceptance:
  - In that RLC case there are at least 20 samples per period, and the plotted polyline deviates from the exact y(t) at sample midpoints by at most 1 % of max\|y\|.
  - The default systems still use 400 samples.
  - Preset-switch time at 1× is within ±10 % of the current value.

**TFE-06 — The derivation shows the coefficients as typed, with enough digits** (MATH-13, MATH-02, MATH-12, TF part)
- Evidence: den «1 100.01 1» is shown as s² + 100s + 1, with «ζ = 100/(2·1) = 50.01». «1 2.0001 1.0001» is shown as s² + 2s + 1. Residues and poles are printed at 4 digits (complexTex/pfSumTex ~L184–210, tnum).
- Fix:
  - In Personalizada, show coefficients with the significant digits the user typed (up to 10) in G(s) and in the step 1–5 arithmetic, through G.toTex({ digits }) and tnum with digits.
  - In steps 5–6, format poles and residues with `G.stepDisplayDigits()` (CORE-01), falling back to 6 when it is absent.
- Acceptance:
  - «1 100.01 1»: G(s) shows 100.01, and step 4 shows «100.01/(2·1) = 50.005».
  - «1 2.0001 1.0001»: G(s) shows 2.0001 and 1.0001, and the residue table never lists the same displayed pole twice.
  - Presets and systems still display 4 digits.

**TFE-07 — The step 7 sentence matches the system** (MATH-16, TF part)
- Evidence: L504 always says «Para un segundo orden puro subamortiguado se comparan con las fórmulas canónicas», including for first-order systems (Walras, the linear tank).
- Fix: choose the text by case.
  - First order: «Para un primer orden puro se comparan con τ·ln 9 y τ·ln 50…».
  - Underdamped pure second order: the current text.
  - Otherwise: «Sin fórmula canónica: los valores se miden sobre la curva.»
- Acceptance: Walras and the linear tank mention «primer orden» in step 7; mass-spring defaults mention «subamortiguado»; a third-order example mentions neither.

**TFE-08 — Custom-input messages for a trimmed leading coefficient and the decimal comma** (QA-05, QA-13)
- Evidence: den '1e-15 1 1' silently becomes 1/(s+1) with «Orden 1», because tf.js trims coefficients ≤ 1e-14·max. Den '1,2' gives a degree error without saying the comma was read as a decimal point.
- Fix:
  - Compare the parsed coefficient count with G.den and G.num after construction. If a coefficient was trimmed, show an inline note (role=status): «El coeficiente principal 1e-15 es despreciable frente a 1: se tomó grado 1.»
  - When a comma input parses to a single coefficient, add «La coma se interpretó como separador decimal (1,2 = 1.2): separe los coeficientes con espacios.»
- Acceptance (e2e):
  - '1e-15 1 1' shows the note and a first-order G.
  - The '1,2' message contains «coma» and «espacios».
  - '1 2' is unaffected.

**TFE-09 — The impulse chart's text alternative tells the truth** (A11Y-02)
- Evidence: renderImpulse (L1154) passes annotations: null, so the aria-label reads «Respuesta al impulso: sin valor final (respuesta inestable o marginal).» even for stable systems.
- Fix: pass `{ finalValue: 0 }` when A.info.stable (normalizeAnnotations nulls the rest, and showBand is false); otherwise pass null.
- Acceptance: for the default G, the tf-chart-impulse aria-label contains «valor final 0» and not «inestable». The unstable preset keeps «sin valor final».

**TFE-10 — The stale G(s) panel keeps readable contrast** (A11Y-09 (c))
- Evidence: `.is-stale > .tf-g, .is-stale > .tf-gside { opacity: .5 }` (tfengine.css:204–206) puts «Polos» at 2.21–2.77 and «Estable» at 1.95–3.07 (axe color-contrast ×6).
- Fix: replace the opacity with a visible text badge or banner, «Desactualizado: corrija la entrada», and keep the content at full contrast; muted colours are fine where they pass 4.5:1.
- Acceptance: with an invalid custom input, axe reports 0 color-contrast in #transferencia in both themes, and the stale state is shown as text.

**TFE-11 — No unprompted G(s) announcement** (A11Y-11, TF part)
- Evidence: scrolling #transferencia into view announces «G(s) recalculada. Estable…» with no user change.
- Fix: skip announce() on the initial render, the lazy init and programmatic restores. Keep it for user changes and for tf:open hand-offs.
- Acceptance: scrolling into view with no interaction produces 0 ds-live updates from tfengine; a slider change produces 1.

**TFE-12 — TF heading and table semantics** (A11Y-16, A11Y-20)
- Evidence: `th.tf-routh__row` holds only KaTeX, so its name is empty (axe empty-table-header). The fig() titles (L903, L918) are h3 under the sr-only h3 «Gráficas y métricas».
- Fix: add sr-only text such as «fila s²» in each row header, and render the figure titles as h4.
- Acceptance: axe reports 0 empty-table-header in the Routh states, and the heading outline shows the chart titles as h4 under «Gráficas y métricas».

**TFE-13 — TF chips carry explanations** (COV-02, TF part)
- Evidence: the four chips («Estable», «Orden 2», «Estrictamente propia», «G(0) = 0.25») have no tooltip.
- Fix: pass `ui.chip({ title })` with a one-sentence explanation each (stability class, order, proper or strictly proper, static gain).
- Acceptance: each TF chip has data-tip and its sr-only text, and axe reports no violations.

**TFE-14 — The ghost curve appears only after a parameter change of the same system** (COV-11)
- Evidence: switching «Mercado: ajuste continuo» → «Masa-resorte» leaves «Respuesta y(t) (anterior)» on the chart (yMax 0.285, xMax 8.57 s).
- Fix: pass `{ ghost: false }`, or call clearGhost(), on step and Bode updates when the system, mode, variant or output, preset or custom G changes. Keep the ghost for slider changes.
- Acceptance: after every structural switch, no ghost dataset is visible; after a slider change, a ghost appears.

**TFE-15 — TF init and updates run in short tasks** (PERF-07, DES-05, PERF-12, TF part)
- Evidence: the onVisible init (L1532, rootMargin 300 px) takes 150–198 + 105–123 ms at 1× (chart factory 263 ms, getPropertyValue 146 ms). At 4× CPU, preset switches with all steps open take 456/632 ms and «Mostrar todo» 568 ms.
- Fix:
  - Use util.lazyInit (FND-07) with the phases DOM → step and pz charts → Bode and impulse → typeset open steps, each about 50 ms or less.
  - On a G change, update the charts first, yield (rAF, or util.yieldTask when present), then re-typeset the open steps near the viewport.
  - Open steps far off-screen are marked dirty and typeset when they come near. Closed steps are already deferred.
- Acceptance:
  - 5 s after load, #transferencia has data-lazy="done".
  - No init task is longer than 120 ms at 1×.
  - At 4× CPU, the median Event Timing duration of a preset switch with all steps open is at most 60 % of the measured 456 ms.
  - Visible steps show the new numbers within 1 s.
  - The existing tfengine e2e tests pass.

**TFE-16 — The final-value card handles a cancelled pole at the origin** (QA-03, TF part)
- Evidence: the card shows «No existe: marginalmente estable» (L1183), although the step of s/(s(s+1)) converges to 1.
- Fix: when `info.limitValue` is a number (CORE-10), show it in the final-value card with the subtext «límite de y(t): el cero cancela el polo en el origen» and without the «exacta» tag.
- Acceptance: num '1 0', den '1 1 0' → the card shows 1. num '1 0 0', den '1 2 1 0' → 0. 1/s still shows «No existe».

### Group platform (`index.html`, `tools/*.mjs`, `package.json`, `playwright.config.mjs`, `tests/helpers/**`, e2e smoke/integration/responsive, `tests/unit/contract.test.mjs`, `docs/ARCHITECTURE.md`, `README.md`)

**PLT-01 — The README matches the app** (COV-10)
- Evidence:
  - README.md:41 says the theme follows the system preference. index.html hard-codes dark, and only a saved choice overrides it.
  - README.md:34 calls the concept cards «desplegables» and gives the wrong titles.
  - README.md:35 lists wizard steps that do not match STEPS.
- Fix: correct the three statements.
  - The app is dark by default, and the toggle is remembered in localStorage (dsl.v1.theme).
  - The real card titles, which do not collapse.
  - The real step names: Delimitar el sistema → Aplicar leyes físicas o principios de conservación → Formular el modelo matemático → Simular y validar.
- Acceptance: the README lines match index.html, the concept card titles and the wizard STEPS titles. A contract-test assertion is optional.

**PLT-02 — The single-file build drops fonts the app can never use** (PERF-11, font part)
- Evidence: dist is 2,334,747 B, of which 735,079 B are @font-face blocks. js/ uses only \mathrm, \text, \mathcal and \mathbf, so these KaTeX faces are unreachable: Fraktur ×2, Script, Typewriter, SansSerif ×3, Math-BoldItalic, Main-BoldItalic and Caligraphic-Bold (162,034 B). The Bricolage latin-ext and Plex italic latin-ext faces never load.
- Fix:
  - In tools/build.mjs, or wherever the CSS is inlined, filter those @font-face rules out of the inlined CSS for dist only. vendor/ stays unchanged.
  - Add a build guard that fails if js/ contains \mathfrak, \mathscr, \mathtt, \texttt, \mathsf, \boldsymbol or \bm.
- Acceptance:
  - dist is at least 150 KB smaller.
  - Two builds are byte-identical.
  - The dist e2e tests pass.
  - After a full walkthrough, document.fonts reports no failed loads.
  - Visual baselines are unchanged.

## Rejected

| ID or part | Reason |
|---|---|
| PERF-05 (whole) | The verified gain is marginal: −4.5 % task time in a drag, no theme-toggle gain, init long tasks not clearly shorter. A per-theme cache also risks stale media-dependent tokens. |
| PERF-06 (whole) | Uncertain. Code read: STREAM_FPS = 30 already limits chart updates to 30 Hz, and clean 1× runs hold 60 fps with 0 slow frames. Only the 4× CPU proxy reproduces, and the proposed fixes are already in place or speculative. |
| DES-01: shorten `--dur-step-out` to 120 ms | SKILLS_BRIEF §1 fixes wizard steps at 250 ms in and 150 ms out. The sequential change alone removes the double exposure. |
| DES-02: Tier A glass on the sticky toolbar | Keeps at most 3 Tier A blur layers (SKILLS_BRIEF §1). An opaque surface is used instead. |
| DES-03: gallery tablet half | The verifier measured the scene, charts and first sliders fitting together at 820×1180, with only a marginal miss at 768. |
| DES-05: «widen rootMargin to 150 %» | Replaced by idle pre-init in phases (FND-07), which also removes the long tasks. |
| DES-11: `.ds-reveal` on wizard, gallery and TF sections | SKILLS_BRIEF §9: «No per-section scroll reveals». |
| DES-16 / COV-04: hide the category chip | PRODUCT_SPEC §2.4 requires cards with an icon and a category chip. |
| COV-05: reorder TF sections | SKILLS_BRIEF §2 fixes the order input → derivation → charts. TFE-02 keeps the order. |
| A11Y-17: role="application" | SKILLS_BRIEF §3 mandates role="img" on chart canvases. Only the hint is reworded. |
| A11Y-18: TF «Estable» chip in light theme | Re-sampled at 4.51:1; axe reports no violation. |
| A11Y-05: tf-roots-poles clipping | It is an inner scroller, so the content stays reachable. No change. |
| PERF-08: removing vw units only | The verifier showed that fixed paddings still lose the position. FND-09 restores it at the shell level. |
| PERF-11: pruning unreferenced icons | Saves 4.5 KB and risks icon names built at run time. |
| PERF-12: theme-toggle latency via a cssVar cache | No measurable gain (see PERF-05). |
| COV-01: new thermal example (model, gallery, TF) | A larger feature beyond this bounded round. The request's parenthesised lists are illustrative. The wording fix is WZ-07. |
| COV-02: tooltips on wizard chips, law cards and concept readouts | Kept bounded to gallery readouts and TF chips this round. |
| MATH-03, DES-06, DES-07, DES-08, DES-12, DES-17, PERF-02, COV-07, COV-08 | Refuted by the verifier (see the table). |

## Cierre de la ronda 1

Closed on 2026-10-18 by the final regression, run on the final sources with one suite at a time on an otherwise idle machine. An independent verification of that record then found three discrepancies: a 21 px overflow at 320 px that lasted about 0.8 s after load (R32), one dist skip that was not a test-page test, and a ζ written as «1» next to «Como ζ > 1». They were fixed at closing (see «Fixes after the independent verification»), and the whole chain was run again on the final sources. The summary below is that last run. Every one of the 88 accepted items is **fixed**; none is left unfixed. The two rejected findings (PERF-05, PERF-06) and the rejected parts listed above stay rejected. No test was weakened: where a check failed during the regression or the closing, the implementation was changed.

**Final build.** `dist/sistemas-dinamicos.html` is **2,283,210 B** (2,229.7 KiB, 2.18 MiB), sha256 `6c74dd61820d71e94bdb3fb93053402f24eebf959e52e3f8bfeeee45f59d652b`. It inlines 13 stylesheets and 30 scripts and omits 12 unusable font faces (180.9 KiB of woff2). `npm run build` and two `node tools/build.mjs --out=…` builds gave the same bytes. The same sources built without pruning are 249,058 B larger (PLT-02 asked for at least 150 KB; the pruned faces did not change at closing). At triage the file was 2,334,747 B, so it is 51,537 B smaller even with the round's new code. The closing fixes added 2,609 B to the regression's build (2,280,601 B).

### Changes made by the regression itself

- `js/sections/tfengine.js`: the step 7 sentence and the note under the metric strip no longer say «4000 muestras». Since CORE-11 the sample count depends on the system (dense and envelope grids), and `stepInfo()` already writes the real count in its notes («Métricas medidas sobre N muestras en [0, T]…»). The strip note now lists those notes after its own sentence (request R5). `docs/api/tfengine.md` describes the note.
- `docs/ARCHITECTURE.md`: the round-1 contract changes are folded into §6.1, §6.2, §7.3, §8.2, §9.2–§9.4, §10, §12.1, §12.3, §14.4, §14.6 and §15.2, each marked «audit round 1», and a new §19 points here. §15.2 gives the split full-run commands and the rule for timing-sensitive tests.
- `README.md`: «Ver datos» follows the data and samples per series; domain halts in the gallery; current test counts, split Playwright commands and the timing-sensitive tests.

### Fixes after the independent verification

The verifier's evidence is in `test-results/verify-final/` (`vf6-320-dist.json`, `vf6-320-src.json`, `vf7-320-cpu.mjs`). The closing's own probes and logs are in `test-results/closer/`.

1. **R32 was gone only once the page had settled.** In both projects at 320 px, `scrollWidth` was 341 from about 0.33 s to 1.14 s after load (2.5–3.8 s at 4× CPU). The cause was the cables layer of the «sistema» block diagram (`.cc-bd__wires`). It is an absolutely positioned `<svg>` with no CSS size, so it measured the default 300 × 150 px (left 41 → right 341) until the card's lazy init ran `measure()` and wrote its `width`, `height` and `viewBox`. The regression's reflow probe and the responsive spec only look after the page settles, so they missed it. FND-13's own acceptance (bar and footer) was not affected.
   - Fix: `css/sections/concepts.css` gives `.cc-bd__wires` `width: 100%; height: 100%`. That is the box `measure()` already wrote (the `.cc-bd` padding box, with no border). `test-results/closer/wires-geom.mjs` shows that, after measuring, the layer still equals the diagram box at 320, 390, 768, 1024 and 1440 px (offset 0, same size as its `width`/`height` attributes). The diagram captures `bd-src-*.png` show the cables unchanged.
   - New e2e tests in `shell.spec.mjs`: «R32: a {320, 360, 390}px no hay desplazamiento horizontal en ningún fotograma, desde la carga hasta que «sistema» mide su diagrama». They sample `scrollWidth − clientWidth` on every animation frame from the first frame until the layer has its `viewBox`, plus 500 ms. Before the fix, the 320 px test failed in `src` and `dist` with 21 px frames. After it, all six runs pass.
   - Per-frame probe `node test-results/closer/overflow-frames.mjs` (the verifier's method, 9 s after load): **0 overflow frames** at 320, 360 and 390 px, at 1× and at 4× CPU, in `src` and `dist` (12 runs, 115–526 frames each; `overflow-frames.json`).
2. **Skip accounting.** One of the regression's 103 dist skips, `shell.spec.mjs` «index.html: barra, pie y conmutador de tema», was a test of the real app. It was skipped in dist by an explicit `test.skip(isDist, …)` and did not open a test page, so the record that every dist skip uses `tests/pages/*` was wrong by one. The pass and skip counts were right. The test now runs in both projects, renamed «app: barra, pie y conmutador de tema», and passes in both. No test in `tests/e2e/` calls `test.skip(isDist, …)` any more. `node test-results/closer/skip-audit.mjs` reads the five dist logs: **102 of 102** skipped tests take the `gotoTestPage` fixture (`skip-audit.json`). README and ARCHITECTURE §15.2 now give the new counts.
3. **ζ written on the boundary (observation, outside CORE-01).** For `1 2.0001 1.0001`, step 4 wrote ωn = √1.0001 = 1 and ζ = 2.0001/(2·1) = 1 with the 5 typed digits, then «Como ζ > 1, el sistema es sobreamortiguado». The class was right (ζ = 1.0000000012, poles −1 and −1.0001), but the written value contradicted the inequality.
   - Fix in `js/sections/tfengine.js`: `zetaDigits()` returns the fewest digits, from the G(s) digits up to 15, at which the written ζ satisfies the inequality the damping note states. That is ζ > 1 for sobreamortiguado, 0 < ζ < 1 for subamortiguado and ζ < 0 for inestable. The critical case keeps «ζ = 1». The ωn and ζ equations and readouts use those digits. When they exceed the G(s) digits, the note adds «Con 5 cifras, ζ se escribiría 1, justo la frontera entre regímenes; por eso aquí ωn y ζ llevan 10 cifras.» The example now reads ωn = 1.000049999 and ζ = 2.0001/(2·1.000049999) = 1.000000001 (`zeta-step4-dist.png`).
   - The 10-digit readouts then ran past their 150 px cells. The same already happened with 10 typed digits, for example `1 3.14159265358979 2`. Readouts with more than 6 digits now get `tf-params--wide` (`css/sections/tfengine.css`): columns of at least 230 px, and in a narrower single column the unit drops to a new line. `node test-results/closer/zeta-params-fit.mjs` measures the text against each cell for both inputs at 320–1440 px. The worst case is 5.6 px inside the cell. Without the class, the overhang at 1440 px was 63 px (`wide-off-check.mjs`).
   - New e2e test in `tfengine.spec.mjs`: «paso 4: junto a ζ = 1, ωn y ζ llevan las cifras que hacen falta para que ζ escrito cumpla la desigualdad de la nota». It covers the boundary case (TeX, readouts, note, readouts inside their cells at 1440 and 320 px), a case far from the boundary (`1 100.01 1`: still 50.005 and no added sentence) and the critical case `1 2 1`. `docs/api/tfengine.md` «Digits» describes both rules.
   - Unchanged: the polite announcement still gives ζ and ωn with 3 digits («ζ = 1, ωn = 1 rad/s»). It names no damping class, so nothing contradicts it.

### Final test summary

Run at closing, after the fixes above, on the final sources and the final build. Logs: `test-results/closer/{unit,crosscheck,build,src-a…e,dist-a…e}.log`.

| Check | Command | Result | Time |
|---|---|---|---|
| Vendor | `npm run vendor` | OK, deterministic (Chart.js 4.5.1, KaTeX 0.16.47, lucide-static 1.50.0, fonts 5.3.0) | 1 s |
| Icons | `npm run icons` | 60 icons from 9 lists, no changes | 1 s |
| Unit | `npm test` | **686 / 686** passed, 93 suites, 0 failed | 5.6 s |
| SciPy cross-check | `uv run --with numpy --with scipy python tests/crosscheck/run.py` | **62 / 62** checks (42 transfer functions, plus energy balances against `solve_ivp` DOP853), exit 0 | 30 s |
| Build | `npm run build`, then twice `node tools/build.mjs --out=<scratch>` | 2,283,210 B each, identical sha256 | < 5 s each |
| Playwright `src` | 5 split runs (ARCHITECTURE §15.2), `--project=src` | **305 / 305** passed: charts + shell 101 (1.6 min), gallery + scenes 62 (2.1 min), tfengine 47 (1.5 min), hero-concepts + wizard 69 (3.1 min), smoke + integration + responsive 26 (48 s). The 4 tests added at closing are the three R32 frame tests and the step-4 ζ test | 9.3 min |
| Playwright `dist` | the same 5 runs, `--project=dist`, on the final build | **203 passed, 102 skipped, 0 failed**: 23 + 78 skipped (50 s), 38 + 24 skipped (1.7 min), 47 (1.4 min), 69 (3.0 min), 26 (47 s). All 102 skipped tests open a `tests/pages/*` test page, which exists only in `src` (`test-results/closer/skip-audit.mjs`: 102 of 102 take `gotoTestPage`). Every other test, the app's bar, footer and theme toggle included, runs in both projects | 8.0 min |
| Accessibility (axe) | inside the gallery, hero-concepts, shell, tfengine and wizard specs | 0 violations in both projects (part of the runs above) | — |
| Viewport captures | `node test-results/regression-final/probe/shots.mjs dist/sistemas-dinamicos.html test-results/closer/shots` | 61 viewport captures scrolling through every section: 1440×900 dark (14) and light (14), 1024×768 dark (19), 820×1180 dark (14). Every section reached `data-lazy="done"`; no console error or warning; no horizontal overflow. The «Conceptos» and «Función de transferencia» captures were opened: the block diagram's cables and the default step-4 readouts are unchanged | 1.3 min |
| Reflow probe, settled | `node test-results/regression-final/probe/overflow.mjs index.html dist/sistemas-dinamicos.html` | `scrollWidth` equals the viewport at 320, 360 and 390 px, in `src` and `dist`, after scrolling the whole page | 40 s |
| Reflow probe, every frame | `node test-results/closer/overflow-frames.mjs` | 0 overflow frames during the 9 s after load at 320, 360 and 390 px, at 1× and 4× CPU, in `src` and `dist` | 2.4 min |
| Step-4 readouts | `node test-results/closer/zeta-params-fit.mjs dist/sistemas-dinamicos.html` | Every readout's digits and unit stay inside their cell for `1 2.0001 1.0001` and `1 3.14159265358979 2`, at 1440, 1280, 1024, 820, 768, 390 and 320 px (worst case 5.6 px inside) | 1 min |
| Audit probes | `test-results/closer/audit-qa/{20-morphwarn,21-tf-table-stale,22-stale-tables}.mjs dist` (copies of the regression's probes, so its evidence is kept) | 0 Chart.js warnings over 4 preset morphs; every open «Ver datos» table checked (step, pole-zero, Bode, Ecuaciones, superposition, gallery) changes with its data. The JSON output is identical to the regression's | 2 min |

Measurements printed by the runs (`dist` / `src`): TFE-15 idle phases done in 476 / 470 ms with no long task; TFE-15 Event Timing median at 4× CPU 80 / 88 ms (limit 274 ms); gallery frame interval median 16.7 ms, p95 50 / 50 ms; scene `render()` median ≤ 0.1 ms.

### Status of every accepted item

All the evidence below passed in the final runs. «unit» is `tests/unit/`, «e2e» is `tests/e2e/` (run in both projects, except tests on a test page, which run in `src` only), and «crosscheck» is `tests/crosscheck/run.py`.

**Group core**

| ID | Status | Evidence |
|---|---|---|
| CORE-01 | fixed | unit `tf.test.mjs` «y(t) escrita: cifras, residuos y amortiguamiento (CORE-01)»; crosscheck partial fractions of G(s)/s; e2e TFE-06 |
| CORE-02 | fixed | unit `systems.test.mjs` «lecturas que dependen del régimen (CORE-02, CORE-03)» |
| CORE-03 | fixed | unit `systems.test.mjs` «lecturas que dependen del régimen (CORE-02, CORE-03)» |
| CORE-04 | fixed | unit `systems.test.mjs` «el balance de energía mide solo el error de la trayectoria (CORE-04)»; crosscheck energy balances (3 runs, ratio ≤ 1) |
| CORE-05 | fixed | unit `systems.test.mjs` «Torricelli: curva del modelo linealizado h_lin (CORE-05)»; e2e GAL-01 |
| CORE-06 | fixed | unit `tf.test.mjs` «Bode con ganancia negativa: rama de la fase (CORE-06)»; crosscheck Bode phase |
| CORE-07 | fixed | unit `systems.test.mjs` «telaraña con D y textos de la corriente del RLC (CORE-07, CORE-08)» |
| CORE-08 | fixed | unit `systems.test.mjs` «telaraña con D y textos de la corriente del RLC (CORE-07, CORE-08)» |
| CORE-09 | fixed | unit `tf.test.mjs` «estabilidad: Routh primero, eje jω polo a polo (CORE-09)»; crosscheck stability and Routh sign changes |
| CORE-10 | fixed | unit `tf.test.mjs` «cero que cancela el polo del origen (CORE-10)» (3 tests); e2e TFE-16 |
| CORE-11 | fixed | unit `tf.test.mjs` «sistemas casi sin amortiguamiento (CORE-11)»; crosscheck step metrics |
| CORE-12 | fixed | unit `simulator.test.mjs` «una telaraña que sale del dominio económico se detiene en el periodo de la salida…», «hints de una telaraña que sale del dominio…», «con los valores por omisión la telaraña no sale del dominio…»; e2e GAL-02 |
| CORE-13 | fixed | unit `systems.test.mjs` «cada lectura tiene su ayuda (CORE-13)»; e2e GAL-11 |

**Group foundation**

| ID | Status | Evidence |
|---|---|---|
| FND-01 | fixed | e2e `charts.spec.mjs` «FND-01: una tabla abierta sigue a los datos en menos de 500 ms…», «FND-01: al refrescarse, el panel conserva desplazamiento y foco…»; audit probes 21 and 22 on dist |
| FND-02 | fixed | e2e `charts.spec.mjs` «FND-02: muestreo por serie: 16 muestras discretas junto a 400 de una curva se conservan enteras» |
| FND-03 | fixed | e2e `charts.spec.mjs`, four FND-03 tests (fixed range anchored at 0, no tick-limit warnings, compact labels up to 1e7, pole-zero ticks); audit probe 20 (0 warnings) |
| FND-04 | fixed | e2e `charts.spec.mjs` «FND-04: un arrastre de 3 s… ≤ 10 dibujados por gráfica», «FND-04: 20 cambios de ancho… como mucho 3 dibujados…», «FND-04: charts.flush() y beforeprint…» |
| FND-05 | fixed | e2e `charts.spec.mjs` «FND-05: el revelado espera a la primera vista…», «FND-05: con movimiento reducido no hay barrido…» |
| FND-06 | fixed | e2e `shell.spec.mjs` «FND-06: primera pintura limpia a W×H: CLS < 0.05 y LCP < 2.5 s» (one per size), «FND-06: sin JavaScript el aviso noscript se ve…» |
| FND-07 | fixed | unit `ns.test.mjs` «util.lazyInit» and «util.yieldTask»; e2e `shell.spec.mjs`, two FND-07 jump tests |
| FND-08 | fixed | e2e `shell.spec.mjs` «FND-08: tras un salto la barra nunca queda transparente…» (smooth and reduced motion) |
| FND-09 | fixed | e2e `shell.spec.mjs` «FND-09: al cambiar el ancho, #id sigue bajo la barra (±80 px)», «FND-09: un cambio solo de alto no mueve la página» |
| FND-10 | fixed | e2e `shell.spec.mjs`, two FND-10 baseline tests (kitchen sink; gallery and Conceptos rows) |
| FND-11 | fixed | e2e `shell.spec.mjs` «FND-11: con colores forzados, glifo de reproducir, selección, pestañas, conmutador, deslizador y navegación siguen a la vista» |
| FND-12 | fixed | e2e `shell.spec.mjs` «FND-12: con colores forzados, el acento de KaTeX no tapa la letra base de ẋ ni de ẍ» |
| FND-13 | fixed | e2e `shell.spec.mjs`, three FND-13 tests (320, 360 and 390 px); reflow probe |
| FND-14 | fixed | e2e `shell.spec.mjs` «FND-14: Enter sobre el reinicio de un deslizador deja el foco en su deslizador, no en &lt;body&gt;» |
| FND-15 | fixed | e2e `shell.spec.mjs` «FND-15: un aviso con acción creado con el teclado enfoca «Deshacer»…» |
| FND-16 | fixed | e2e `shell.spec.mjs` «FND-16: la opción elegida lleva un indicador de al menos 3:1 en los dos temas y su etiqueta pasa a 600» |
| FND-17 | fixed | e2e `shell.spec.mjs` «FND-17: el error del campo es role=alert y un valor fuera de rango se ajusta con una nota role=status»; e2e HC-03 |
| FND-18 | fixed | e2e `charts.spec.mjs` «FND-18: cada muestra de leyenda dibuja el patrón de trazos de su serie» |
| FND-19 | fixed | e2e `charts.spec.mjs` «cada lienzo es una imagen enfocable con resumen y ayuda de teclado» (role=img kept; the hint names «modo de foco» and «Ver datos») |
| FND-20 | fixed | e2e `shell.spec.mjs` «FND-20: Enter y Espacio sobre «?» alternan su explicación» |
| FND-21 | fixed | e2e `shell.spec.mjs` «FND-21: con puntero grueso, opciones segmentadas y campos numéricos miden al menos 44px de alto» |
| FND-22 | fixed | e2e `shell.spec.mjs` «FND-22: una lectura con tip tiene «?» con nombre, tooltip al pasar y al enfocar, y texto para lectores» |

**Group scenes** (test page, so `src` only; the dist build carries the same scene files and draws them in the gallery and integration runs)

| ID | Status | Evidence |
|---|---|---|
| SCN-01 | fixed | e2e `scenes.spec.mjs` «mercado (…): lecturas enormes y equilibrio junto al origen sin choques; la telaraña no sale del cuadro» (both themes), «mercado: capturas de los casos límite»; unit `scenes.test.mjs` strip and market-format tests |
| SCN-02 | fixed | e2e `scenes.spec.mjs` «tanques: los rótulos sobre el agua mantienen 4.5:1 en ambos temas (nivel por defecto y tanque lleno)», «los rótulos de referencia con placa solo existen en los tanques» |

**Group hero-concepts**

| ID | Status | Evidence |
|---|---|---|
| HC-01 | fixed | e2e `hero-concepts.spec.mjs` «HC-01: orden observado contra una referencia rk45 1e-13…»; unit `hero-concepts.test.mjs` observedOrder, pendulumReference and methodsComparison tests |
| HC-02 | fixed | e2e «HC-02: con una entrada nula la superposición da un aviso neutro» |
| HC-03 | fixed | e2e «HC-03: escribir en el campo de t detiene la reproducción» |
| HC-04 | fixed | e2e «HC-04: trazos distintos en superposición y en métodos» |
| HC-05 | fixed | e2e «HC-05: el bloque del controlador no usa opacidad y su texto contrasta ≥ 4.5:1» (both themes) |
| HC-06 | fixed | e2e «HC-06: sin TeX crudo en el árbol accesible al quedar lista la página; cada lienzo es una imagen con nombre» |
| HC-07 | fixed | e2e «HC-07: el bucle de «tiempo» no fuerza el layout y dibuja a 60 fps», «HC-07: los lienzos de «tiempo» y «sistema» = tamaño CSS × dpr…» |
| HC-08 | fixed | e2e «HC-08 / HC-09: rejilla por anchura, alturas reservadas y tipografía de las tarjetas» |
| HC-09 | fixed | e2e «HC-08 / HC-09: rejilla por anchura, alturas reservadas y tipografía de las tarjetas» |
| HC-10 | fixed | e2e «HC-10: el marco x de la gráfica c es el mismo con tallos y con escalera…»; unit `hero-concepts.test.mjs` eqFrame |
| HC-11 | fixed | e2e «HC-11: el paso a «Linealidad» desde el asistente deja la tarjeta bajo la barra y el foco en su pestaña», «HC-11: una rueda del usuario cancela la corrección del paso» |
| HC-12 | fixed | e2e «HC-12: preparación en reposo sin tareas largas; open() sigue siendo síncrono» |

**Group wizard**

| ID | Status | Evidence |
|---|---|---|
| WZ-01 | fixed | e2e `wizard.spec.mjs`, three WZ-01 tests (out, then in, with eased height; instant under reduced motion; «Ir a…» lands under the bar) |
| WZ-02 | fixed | e2e «WZ-02: cada término del paso 3 tiene un nombre accesible propio (axe button-name)» |
| WZ-03 | fixed | e2e «WZ-03: el foco se queda en el paso 3 cuando sus botones se desactivan» |
| WZ-04 | fixed | e2e «WZ-04: diez pulsaciones del deslizador dan un solo anuncio del RMSE, al asentarse» |
| WZ-05 | fixed | e2e «WZ-05: los residuos tienen su «Ver datos», con una fila por punto medido» |
| WZ-06 | fixed | e2e «WZ-06: textos de los diagramas ≥ 4,5:1 en los pasos 1 y 2…», «WZ-06: axe sin problemas de contraste en los estados del asistente» (both themes), «WZ-06: cada marca del carril mide al menos 44 px de alto». See «Left for round 2» |
| WZ-07 | fixed | e2e «WZ-07: las entradas de los pasos nombran temperatura y energía, sin desbordar a 390 px» |
| WZ-08 | fixed | e2e «WZ-08: construir el paso 1 apenas cambia el alto de #modelado», «WZ-08: 5 s después de cargar, un salto de #conceptos a #galeria llega a su sitio» |

**Group gallery**

| ID | Status | Evidence |
|---|---|---|
| GAL-01 | fixed | e2e `gallery.spec.mjs` «GAL-01: Torricelli dibuja h_lin discontinua; con 20 L/s la tabla acaba en h ≈ 1,274 m y h_lin ≈ 1,070 m» |
| GAL-02 | fixed | e2e «GAL-02: telaraña fuera del dominio: aviso con el motivo y qué cambiar; tras «Reiniciar», nota de pausa en k = 0» |
| GAL-03 | fixed | e2e «GAL-03: a 1024 y 1280 px cada gráfica tiene ≥ 160 px de trazado y su título del eje y cabe» |
| GAL-04 | fixed | e2e «GAL-04: cambiar de sistema funde del todo, construye por partes (sin tareas > 100 ms) y no salta el eje y» |
| GAL-05 | fixed | e2e «GAL-05: entre 768 y 1023 px los chips de categoría del riel se leen enteros» |
| GAL-06 | fixed | e2e «GAL-06: con colores forzados la tarjeta elegida lleva contorno propio; a 320 px nada se sale de la sección»; reflow probe |
| GAL-07 | fixed | e2e «GAL-07: «Restablecer parámetros» no pierde el foco; con teclado el aviso lo recibe y lo devuelve al primer parámetro» |
| GAL-08 | fixed | e2e «GAL-08: con el deslizador en marcha las lecturas se anuncian una sola vez, al detenerse» |
| GAL-09 | fixed | e2e «GAL-09: el nombre de cada pestaña contiene su texto visible (axe) y el panel se llama como el sistema» |
| GAL-10 | fixed | e2e «GAL-10: los avisos y anuncios no acaban en «..»» |
| GAL-11 | fixed | e2e «GAL-11: las lecturas con explicación del modelo llevan su ayuda» |
| GAL-12 | fixed | e2e «GAL-12: arranque por fases (≤ 50 ms) en tiempo ocioso, esqueleto con la geometría final y data-lazy antes de 5 s», «GAL-12: el salto del menú a la galería no deja huecos de más de 120 px en el escenario» |
| GAL-13 | fixed | e2e «GAL-13: el bucle se detiene cuando el visor sale de la vista aunque los paneles sigan a la vista» |

**Group tfengine**

| ID | Status | Evidence |
|---|---|---|
| TFE-01 | fixed | e2e `tfengine.spec.mjs`, three TFE-01 tests (each new step whole under the sticky bar at each size; reduced motion; blocks in over 250 ms, staggered 60 ms) |
| TFE-02 | fixed | e2e «TFE-02: tableta vertical W×H: dos columnas, el slider y la gráfica a la vez», «TFE-02: el teléfono sigue en una columna y desde 900 px de contenedor no cambia» |
| TFE-03 | fixed | e2e «TFE-03: los nombres de los sliders caben en una línea a 768, 820, 1024, 1280 y 1440 px» |
| TFE-04 | fixed | e2e «TFE-04: el paso 4 explica la causa en primer y segundo orden sin ceros con a₀ ≤ 0», «TFE-04/06: los pasos 4–7 renderizan su TeX…» |
| TFE-05 | fixed | e2e «TFE-05: N = clamp(⌈20·T·máx\|Im p\|/(2π)⌉, 400, 20000) muestras en el escalón y el impulso» |
| TFE-06 | fixed | e2e «TFE-06: Personalizada muestra los coeficientes con las cifras escritas; polos sin duplicados», «TFE-04/06: …» |
| TFE-07 | fixed | e2e «TFE-07: la frase de las métricas depende del caso» (re-run after this regression's text change) |
| TFE-08 | fixed | e2e «TFE-08: avisos de coeficiente principal despreciable y de coma decimal» |
| TFE-09 | fixed | e2e «TFE-09: el impulso de un sistema estable marca y∞ = 0» |
| TFE-10 | fixed | e2e «TFE-10: G(s) desactualizada sin opacidad, con distintivo y contraste AA» (both themes) |
| TFE-11 | fixed | e2e «TFE-11: sin anuncio al iniciar; uno por cambio de slider; tf:open sí anuncia», «TFE-11: sin anuncio en el inicio inmediato al acercarse…» |
| TFE-12 | fixed | e2e «TFE-12: filas de Routh con nombre accesible y títulos de figura h4» |
| TFE-13 | fixed | e2e «TFE-13: las pastillas explican su significado (tooltip y lector de pantalla); axe sin problemas» |
| TFE-14 | fixed | e2e «TFE-14: sin curva fantasma tras cambiar de G(s); con fantasma tras mover un parámetro» |
| TFE-15 | fixed | e2e «TFE-15: inicio por fases en tiempo ocioso: data-lazy="done" en 5 s y ninguna tarea > 120 ms», «TFE-15: a 4× de CPU, la mediana de Event Timing… ≤ 274 ms» |
| TFE-16 | fixed | e2e «TFE-16: con un cero que cancela el polo en el origen la tarjeta muestra el límite de y(t)» |

**Group platform**

| ID | Status | Evidence |
|---|---|---|
| PLT-01 | fixed | unit `contract.test.mjs` «README.md coincide con la app» (theme, the four concept titles, the four wizard steps); still green after this regression's README edits |
| PLT-02 | fixed | unit `contract.test.mjs` «archivo único: caras tipográficas omitidas (tools/build.mjs)» (4 tests); e2e `integration.spec.mjs` «recorrido completo: ninguna cara falla y las que el archivo único omite nunca se piden» (both projects); two identical builds; 249,058 B saved |

### Requests between groups

The eight fix reports (`test-results/regression-final/fix_reports.json`) carried 38 requests for other owners. Each was checked against the final code.

| # | From | Request | Resolution |
|---|---|---|---|
| R1 | scenes | Rebuild dist with the new scene files; «h₀» contrast | Done: dist rebuilt. SCN-02's e2e test checks the over-water labels at ≥ 4.5:1 in both themes, in place of the old audit script |
| R2 | scenes | Optional unit tests for `kit.textWidth`, `kit.strip` slots and the market strip format | Present in `tests/unit/scenes.test.mjs` («textWidth…», «strip: ranuras por elemento…», «mercado: la franja escribe 4 cifras…») |
| R3 | core | The tfengine «Propia» chip test broke when chips gained sr-only tips | Satisfied: the spec targets `.ds-chip__label` |
| R4 | core | TFE-06: show y(t) with `stepDisplayDigits()` and the close-poles note | Satisfied: `tfengine.js` uses `stepDisplayDigits()`; TFE-06 test |
| R5 | core | TFE-16: show `limitValue`; the count in «Métricas medidas sobre N muestras» now varies; `stabilityInfo().reason` may grow | `limitValue` is shown (TFE-16 test). **Fixed in this regression:** the hard-coded «4000 muestras» is gone and the strip note carries `stepInfo()`'s own notes. `reason` is printed whole in steps 5 and 7 |
| R6 | core | GAL-01: draw `dash: true` outputs dashed | Satisfied (GAL-01 test) |
| R7 | core | Show each readout `tip` wherever readouts are listed | Satisfied in the gallery (FND-22, GAL-11). The wizard and the engine do not list model readouts, so there is nothing to add |
| R8 | core | Review expectations of long divergent cobweb runs | None depended on it; GAL-02 and the market scene tests pass |
| R9 | core | Wizard copy that assumed Simpson energy checks | The wizard says RK4 meets the checks almost exactly and coarse Euler fails, which matches the trajectory integral; the wizard spec passes |
| R10 | core | The Torricelli state now has 2 components | No code assumes one component; scenes, gallery and simulator tests pass |
| R11 | hero-concepts | `setXRange` on the XY handle | Done in `charts.js`; `concepts.js` uses it (HC-10 test) |
| R12 | hero-concepts | Legend swatches with each series' dash array | Done (FND-18 test) |
| R13 | hero-concepts | `lazyInit`: one phase per frame on the visibility path | **Declined.** FND-07's contract, its unit test and the jump tests need the remaining phases to run at once when an element comes near, so it is never blank on screen. HC-12 and TFE-15 measure no task over 120 ms on an idle machine. Kept as a round-2 candidate in case a slow device shows long tasks |
| R14 | hero-concepts | The `.ds-reveal` transform skews hand-off scrolls | No change needed: only concepts uses `.ds-reveal`, and it compensates. During programmatic jumps `<html data-jumping>` shows reveals in their final state (FND-07). HC-11 and the integration hand-off test pass |
| R15 | hero-concepts | Unit tests for `observedOrder`, `pendulumReference`, `orderFloor`, `eqFrame` | Present in `tests/unit/hero-concepts.test.mjs` |
| R16 | hero-concepts | Keep the wizard test ids that HC-11 uses | Ids unchanged; HC-11 passes |
| R17 | wizard | Build and run the dist project | Done: in dist, hero-concepts + wizard 69/69 |
| R18 | wizard | Auto-refresh for standalone `dataToggle`s | Done: `dataToggle(handle, …)` registers with its chart; WZ-05 and FND-01 pass |
| R19 | wizard | An unreproduced 11 px overflow at 390 px | Not reproduced: the reflow probe and the responsive spec find no overflow at 320–390 px in either project, and neither does the closing's per-frame probe from load |
| R20 | wizard | Concurrent Playwright suites break timing tests | Procedure: one suite at a time. Documented in ARCHITECTURE §15.2 and README «Pruebas» |
| R21 | platform | Build before the dist project | Done; «fuentes» passes in dist |
| R22 | platform | No TeX that reaches a pruned face | Holds: the build guard and the contract test pass |
| R23 | gallery | TimeCtl's first configuration from `opts.yRange` | Done in `charts.js`; GAL-04 sees no y-axis jump |
| R24 | gallery | `kind` on the `'halt'` payload | Done in `simulator.js`; the unit test checks `halts[0].kind === 'dominio'` |
| R25 | gallery | Timing-heavy specs on a shared machine | No config change: every timing test passed at the default 4 workers on an idle machine. Procedure documented (see R20) |
| R26 | tfengine | An app-wide reduced-motion rule for collapsibles | Done in `css/components.css` (`transition: none` under `prefers-reduced-motion` and `[data-motion="reduce"]`) |
| R27 | tfengine | Memoise resolved token colours | Done in `charts.js`, rebuilt on `theme:change`; unit test «los colores de las curvas se resuelven una vez por tema…» |
| R28 | tfengine | Specs should target `.ds-chip__label` | Done (see R3) |
| R29 | foundation | Adopt `lazyInit` in the four heavy sections | Done (HC-12, WZ-08, GAL-12, TFE-15 tests); every section reached `data-lazy="done"` in the capture run |
| R30 | foundation | `onEditStart` on the t field | Done (HC-03 test) |
| R31 | foundation | Keep «Ver datos» open when the Ecuaciones frame changes | Done through `setXRange`; audit probe 22 shows the open table updating |
| R32 | foundation | 21 px overflow in #conceptos at 320 px | **Fixed at closing.** The regression found `scrollWidth` 320 at 320 px, but only once the page had settled. Right after load, the «sistema» cables layer still measured 300 px and overflowed 21 px for about 0.8 s (fix 1 above). `.cc-bd__wires` now takes the diagram's size from CSS. The three R32 frame tests and the per-frame probe find no overflow frame at 320, 360 or 390 px in either project |
| R33 | foundation | Array dashes for dashed concept series | Done: `[8, 3]` and `[2, 3]` in `concepts.js` (HC-04 test) |
| R34 | foundation | `returnFocus` on the gallery's undo toast | Done (GAL-07 test) |
| R35 | foundation | `readout({ tip })` in the gallery | Done (GAL-11 test) |
| R36 | foundation | Rebuild dist; a low-worker project for timing tests | dist rebuilt, and probe 21 follows the data on dist. No separate project: see R20 and R25 |
| R37 | foundation | Two tanks `hLin` unit tests failed mid-round | They pass: 686/686 |
| R38 | foundation | Expected visual changes (y gutters, boot fade, first reveal) | For information. The project has no pixel-baseline tests; the viewport captures were reviewed and show only the intended changes |

### Left for round 2

All three points, plus two cosmetic details found at closing, are closed in «Ronda 2» below.

- **Wizard step-1 tank label «h».** The output label over the liquid in the tank diagram samples at about 3.0–3.3:1 (median, with its halo), as the wizard fixer reported. It is outside WZ-06's acceptance (the WZ-06 tests and axe pass), so it is not a round-1 item. It should get the same plate as SCN-02's labels.
- **R13** (one `lazyInit` phase per frame on the visibility path), declined above.
- **Timing-sensitive tests** remain sensitive to machine load (ARCHITECTURE §15.2). They pass on an idle machine; a separate low-worker Playwright project is still an option if parallel runs become routine.

## Ronda 2

Closed on 2026-10-18. It covers the points «Left for round 2» and the two details recorded in «Cierre de la ronda 1» (the wrapped-unit indent and the 3-digit announcement). Every point is closed. One is closed by a recorded decision rather than a change: R13 was measured and declined. No test was weakened. One unit test changed what it expects, because the readout markup changed on purpose; it now checks more (see 3a). The probes and logs are in `test-results/round2/`.

| Point | Status | Evidence |
|---|---|---|
| 1. Tank «h» contrast (wizard, step 1) | **fixed** | e2e `wizard.spec.mjs` «ronda 2: la «h» sobre el líquido del tanque (paso 1) lleva la placa de SCN-02 y su tinta mide ≥ 4,5:1 en cada estado» (dark and light, 1440 and 390 px); negative control `h-noplate.mjs` |
| 2. Timing-sensitive tests | **fixed** | `@timing` tag, `src-timing` and `dist-timing` projects (`workers: 1`) as teardowns of `src` and `dist`; two full `npx playwright test` runs green (`full.log`, `full2.log`) |
| 3a. Wrapped unit indent on phones | **fixed** | e2e `tfengine.spec.mjs` «ronda 2: en teléfono, la unidad de una lectura larga del paso 4 baja de línea sin sangría…»; unit `ui.test.mjs` «readout: formato…»; probes `unit-indent.mjs`, `gallery-sep.mjs` |
| 3b. 3-digit ζ and ωn in the announcement | **fixed** | e2e `tfengine.spec.mjs` «ronda 2: el anuncio cortés da ζ y ωn con las cifras que hacen falta junto a la frontera (y 3 lejos de ella)» |
| 4. R13, one `lazyInit` phase per frame | **declined (measured)** | prototype `r13/ns-r13.js` + `r13/index-r13.html`; probe `r13/blank-frames.mjs` (`blank-frames.json`) |

### 1. The tank «h» in step 1

- **What was there.** The code already put an opaque plate under «h» (`rect.wz-tag`, the boundary label's plate). It was added in round 1 and is described in `docs/api/wizard.md`. The 3.0–3.3:1 figure in «Left for round 2» comes from the wizard fixer's report, and that report predates the plate. Measured again at the start of this round with SCN-02's ink method (`h-probe.mjs`, `h-noplate.mjs`), «h» was 8.62:1 in the dark theme and 5.50:1 in the light one, at 1440, 820 and 390 px. What was missing: the plate was not SCN-02's (it had no edge), and no test isolated this label.
- **Change.** «h» now sits on the SCN-02 plate (`.sc-tag-bg`): `rect.wz-tag.wz-tag--fluid`, filled with `--c-plot-bg`, `rx` 4, and a 1 px edge in the label's colour (`color-mix(in srgb, currentColor 45%, transparent)`, so `--c-out`). When another part is pinned, only the edge fades (`stroke-opacity: 0.24`); the fill never does. Files: `js/sections/wizard.js` (`tankBoundary`), `css/sections/wizard.css`, `docs/api/wizard.md`.
- **Test.** The new e2e test runs four times (dark and light, 1440 and 390 px). It checks that «h» falls over the liquid, which is the reason for the plate. It checks that the plate is drawn under the text, that its fill equals `--c-plot-bg` and that its edge is at least 1 px. Then, in each of the 11 states (nothing pinned, then each list item pinned), it measures the ink as SCN-02 does: the ink is the pixels that change when the texts are hidden, and the background is the text-less shot under that ink dilated by 1 px. Every state must reach 4.5:1, and all of the dilated ink must lie inside the plate. Results: 8.62:1 unpinned or with «h» pinned and 7.0:1 otherwise (dark); 5.50:1 and 7.07:1 (light).
- **Negative control.** With the plate hidden (`h-noplate.mjs`), the same measure gives 4.56:1 in the dark theme and 3.69:1 in the light one. The test fails without the plate.

### 2. Timing-sensitive tests

- **Tag.** `tests/helpers/fixtures.mjs` exports `TIMING = { tag: '@timing' }`. It marks the 31 tests per page that bound real time, or simulated progress per real interval. They are: FND-06 LCP and CLS at four sizes; FND-07 (opacity 1 within 100 ms); GAL-04; both GAL-12 tests; TFE-15 idle and TFE-15 Event Timing at 4× CPU; tfengine `mount()` under 150 ms; WZ-01's choreography; the four WZ-08 builds and the WZ-08 5 s jump; HC-07 at 60 fps; HC-12; the eight gallery «reproduce, pausa, reinicia, velocidad…» tests (the 1×/4× ratio); the integration frame-interval test; and three on test pages, so in `src` only: the 30 fps push burst, FND-01 «Ver datos» within 500 ms, and the scene `render()` cost. This is the round-1 list (FND-06, long tasks, Event Timing, WZ-01, gallery 1×/4×) plus every other test that bounds real time. Within one run, nothing else competes with them now.
- **Projects** (`playwright.config.mjs`). `src` and `dist` skip `@timing` (`grepInvert`). `src-timing` and `dist-timing` run only `@timing` on the same page, with `workers: 1`. Each is the `teardown` of its page's project. In the Playwright 1.63 runner (`lib/runner/index.js`: `createPhasesTask`, `createRunTestsTask`), phases run one after another. A teardown project goes into a phase after its setup project and that project's dependents, and only a failed `dependencies` entry stops a project. So the timing tests run last, with no other test of the run in progress, even when an earlier test failed. A full run has two phases: (1) `src` + `dist` at 4 workers, then (2) `src-timing` + `dist-timing`, which allows at most one timing test per page at a time. Chaining the two timing projects (one as the other's teardown) would make them strictly one at a time. It cannot be done: `buildDependentProjects` follows teardowns transitively, so each would wait for the other and neither would run.
- **Trade-off, documented.** Playwright runs teardown and dependency projects whole: CLI file arguments and `-g` reach only the projects you selected. A filtered run therefore needs `--no-deps`. Without it, it also runs the page's 31 timing tests. Targeted runs are now `npx playwright test tests/e2e/<key>.spec.mjs --project="src*" --no-deps` (`--list` check: 9 tests for `smoke` with `--no-deps`, 40 without).
- **Docs.** ARCHITECTURE §15.2 (projects, commands, full runs, the tagged list, the rule for new tests), the file-tree lines in §2, §19; README «Pruebas» and the single-spec example. The frame-interval test still writes `frames-src.json` / `frames-dist.json`.
- **Evidence.** The single command `npx playwright test`, with no manual split, ran twice in full and passed both times with exit 0: `full.log` took 19.0 min and `full2.log` 17.4 min. Each run gave **520 passed, 102 skipped, 0 failed**. By project, each run: `src` had 279 passed plus the guard's expected failure; `dist` had 180, the expected failure and 99 skipped; `src-timing` had 31; `dist-timing` had 28 and 3 skipped. Every skip is a test page. In both logs the first 560 results are untagged and the last 62 are `@timing`, so the phases ran in order. With nothing beside it, the playing gallery's frame interval has a p95 of 16.8 / 16.8 ms (`dist` / `src`, run 1) and 16.8 / 16.7 ms (run 2), against 50 / 50 ms at round 1's closing; the median stays at 16.7 ms.

### 3. Cosmetic details

**3a. The indent of a wrapped unit.** Cause: the readout wrote its unit as U+00A0 + unit inside `.ds-readout__unit`. A no-break space is not collapsible, so a unit that wrapped under a long number (`tf-params--wide` on phones) started 3 px to the right of the number (`unit-indent.mjs`: 3.0 px at 320 px for `1 2.0001 1.0001` and `1 3.14159265358979 2`).
- Change (`js/ui/components.js`, `css/components.css`, `css/sections/gallery.css`): the unit element holds the unit alone. A plain space text node sits between the number and unit elements: a flex container does not paint it, but `textContent` and screen readers still read «3.16 rad/s». The visible separation is the value's `column-gap`, `--ds-readout-sep` = `--text-sm` × 0.2143 = 3 px, the width of the old U+00A0 in the unit font (`space-width.mjs`). An empty unit is not displayed. The gallery's `column-gap: 0.3em` became `calc(0.3em + var(--ds-readout-sep))`, so its spacing stays the same.
- Measured after the change: the wrapped unit starts 0 px from the number at 320 px. On one line the unit's first glyph sits exactly where it did (147.4 px from the number's left edge at 360, 390 and 1440 px). Concept readouts keep 3 px, and gallery readouts keep 10.2 px at 1440, 390 and 320 px (`gallery-sep.mjs`).
- Tests: unit `ui.test.mjs` now expects the unit text «rad/s» (it used to expect « rad/s»). It also checks the value text «3.16 rad/s» and «12346 Hz», and that no separator is left without a unit. A new e2e test at 1440 px checks one line and a 3 px gap, and at 320 px a wrapped unit with an indent of at most 0.5 px, for both inputs.

**3b. ζ and ωn in the polite announcement.** `announce()` in `js/sections/tfengine.js` now uses `zetaDigits(so, 3)`. That gives 3 digits, or, next to a damping boundary, the fewest digits at which the announced ζ satisfies its class's inequality, as step 4 does. For `1 2.0001 1.0001` it says «ζ = 1.000000001, ωn = 1.000049999 rad/s.» instead of «ζ = 1, ωn = 1 rad/s.», which match the step-4 readouts. Far from the boundary (`1 100.01 1`) it keeps 3 digits, and the critical case (`1 2 1`) keeps «ζ = 1, ωn = 1 rad/s.». The new e2e test records the live region and checks all three. Doc: `docs/api/tfengine.md` «Announcements».

### 4. R13: one `lazyInit` phase per frame on the visibility path

- **Prototype.** It was built outside the sources: `test-results/round2/r13/ns-r13.js` is `js/core/ns.js` with the visibility callback changed. When an element comes within its margin, it runs one phase and schedules each next one with `requestAnimationFrame`; `ensure()` and the idle queue are unchanged. `index-r13.html` is `index.html` with a `<base>` and that script. The prototype ran with no page errors.
- **Measure** (`r13/blank-frames.mjs`). A `requestAnimationFrame` sampler counts frames in which a lazily built element (concept cards, `wz-root`, `#galeria .gl`, `[data-mount="tfengine"]`) is on screen below the bar but not `data-lazy="done"`. Each scenario starts right after `data-ready`, before the idle queue has finished, at 1440×900.

  | Scenario | CPU | Shipped: frames unbuilt / sampled (longest run) | R13: frames unbuilt / sampled (longest run) |
  |---|---|---|---|
  | Wheel, 100 px every 16 ms | 1× | 0 / 397 | 0 / 401 |
  | Page Down every 120 ms | 1× | 6 / 168 (3) | 9 / 167 (4) |
  | Menu jump to `#transferencia` (smooth) | 1× | 1 / 98 (1) | 4 / 103 (4) |
  | Instant jump to `#galeria` | 1× | 1 / 83 (1) | **10 / 83 (10)** |
  | Load with `#galeria` | 1× | 0 / 64 | **5 / 58 (5)** |
  | Wheel, 100 px every 16 ms | 4× | 0 / 351 | 1 / 352 (1) |
  | Page Down every 120 ms | 4× | 9 / 52 (8) | 14 / 35 (14) |
  | Menu jump to `#transferencia` (smooth) | 4× | 1 / 4 (1) | 5 / 6 (5) |
  | Instant jump to `#galeria` | 4× | 2 / 4 (2) | 8 / 9 (8) |
  | Load with `#galeria` | 4× | 0 / 18 | 0 / 15 |

- **Decision: declined.** FND-07's contract is that a section is never blank on screen. R13 breaks it: wherever a section is reached before the idle queue has built it, R13 shows it unbuilt for as many frames as it has phases left (the gallery has 10). Examples: 1 → 10 frames on an instant jump to the gallery, 0 → 5 on a load with `#galeria`, and 1 → 5 on the menu jump at 4× CPU. It would also mean rewriting the unit test that states the contract («cerca del viewport ejecuta en el acto, en orden, todas las fases pendientes»). What R13 would buy, shorter tasks on that path, is already covered: the sections are split into phases of 50 ms or less, and HC-12, GAL-12 and TFE-15 measure no task over their limits. R13 stays out; `js/core/ns.js` is unchanged.
- **Observation (not changed in this round).** The shipped code is not perfect either: 1–2 frames on a jump, and up to 3 (1×) or 8 (4×) frames in a row with Page Down. IntersectionObserver reports after the frame is painted, so a jump, or a Page Down that outruns the margin, puts a section on screen for a frame or more before the callback that builds it runs. A possible improvement for a later round: `shell.scrollTo` could call the target section's `ensure()` before it scrolls.

### Final test summary (round 2)

Each step was run on its own, on the final sources and the final build. Logs: `test-results/round2/{unit-2,crosscheck,build-1,build-2,full,full2}.log`.

| Check | Command | Result | Time |
|---|---|---|---|
| Unit | `npm test` | **686 / 686** passed, 93 suites, 0 failed | 5.0 s |
| SciPy cross-check | `uv run --with numpy --with scipy python tests/crosscheck/run.py` | **62 / 62** checks (42 transfer functions), exit 0 | — |
| Build, twice | `npm run build`, run two times | 2,285,076 B both times, identical sha256 `6256a528…362fec29`; 1,866 B more than round 1 (this round's CSS and JS changes). Rebuilt at closing: the same bytes, and no source is newer than the build | < 5 s each |
| Playwright, run 1 | `npx playwright test` (both pages, both phases) | **520 passed, 102 skipped, 0 failed**, exit 0 | 19.0 min |
| Playwright, run 2 | the same command | **520 passed, 102 skipped, 0 failed**, exit 0 | 17.4 min |
| Accessibility (axe) | inside the gallery, hero-concepts, shell, tfengine and wizard specs | 0 violations on both pages (part of the runs above) | — |

The 520 count includes the guard's expected failure, once per page. Measurements printed by the runs (`dist` / `src`):

| Measurement | Run 1 | Run 2 | Limit |
|---|---|---|---|
| TFE-15 idle phases until `done` (long tasks) | 417 / 358 ms (none) | 379 / 328 ms (none) | longest task ≤ 120 ms |
| TFE-15 Event Timing median at 4× CPU | 88 / 80 ms | 96 / 72 ms | 274 ms |
| tfengine `mount()` | 8.3 / 11.4 ms | 7.3 / 7.7 ms | 150 ms |
| Gallery frame interval, median and p95 | 16.7 and 16.8 / 16.7 and 16.8 ms | 16.7 and 16.8 / 16.7 and 16.7 ms | — |
| Scene `render()` median, JS only (`src` only: test page) | ≤ 0.1 ms | ≤ 0.1 ms | 2 ms |

## Firefox and WebKit (before launch)

Run on 2026-10-18 at the user's request, before publishing. Until then every test ran in Chromium only. Playwright's Firefox 155.0 and WebKit 26.6 were installed (`npx playwright install firefox webkit`). Files are in `test-results/round2/`: the config `xbrowser.config.mjs`, the logs `xb-*.log`, and the probes `http-probe.mjs`, `mathml-probe.mjs` and `canvas-dpr-probe.mjs`.

- **The built file over HTTP** (`http-probe.mjs`, served from 127.0.0.1). It was tested in Chromium, Firefox and WebKit at 1440, 1024, 390 and 320 px. In every case it started in under 1.5 s and built all five sections. There was no console error, no request outside its own origin and no horizontal overflow.
- **The e2e suite** (`xbrowser.config.mjs`: the project's tests on `index.html`, without `@timing`, since those are budgets measured in Chromium). Of 560 tests, 530 passed and 30 failed: 16 in Firefox, 14 in WebKit. Each failure was triaged:

| Failures | Cause | Verdict |
|---|---|---|
| Firefox 6, WebKit 5 | They passed when re-run one at a time (`xb-ff-rerun.log`, `xb-wk-rerun.log`). They failed from load: two engines at 4 workers, plus one Firefox graphics crash during teardown. | load, not the app |
| Firefox: `integration` «recorrido completo» | `I_{\max}` (SIR, `js/systems/sir.js`). KaTeX writes an operator alone in a subscript as three children of `<msub>`. Firefox rejects it («Invalid markup: Incorrect number of children for <msub/>»), and a screen reader would read it wrong. `mathml-probe.mjs` found it to be the only one on the whole tour. | **fixed** |
| WebKit: HC-06 «sin TeX crudo» | WebKit leaves KaTeX's `<annotation>` (the TeX source) at `display: block`; Chromium and Firefox hide it. The TeX is not visible (the MathML box is 1×1 px and clipped), but it reached the accessibility tree. | **fixed** |
| Firefox: 7 scene tests (overlaps, slots) | Firefox's `getBoundingClientRect()` for SVG text is 2 px larger in each dimension; `getBBox()` is identical (13 px text: 17 vs 19 px high). The layout is the same, and the captures show no touching labels. | test measure |
| Firefox: GAL-06 at 320 px | `scrollWidth` of «0.25×» and «0.5×» exceeds `clientWidth` by sub-pixels; the capture shows both labels whole. | test measure |
| Firefox: «no toca la red» | Playwright's Firefox does not report `file:` requests (0 events). Over HTTP, no request leaves the origin (above). | test harness |
| WebKit: skip link, menu sheet, TFE-01 ×2, GAL-07 (mouse part) | Safari's defaults: Tab does not stop on links unless the user enables it, and a click does not focus a button. The keyboard paths in these tests pass. | platform |
| WebKit: FND-12 | Playwright's WebKit does not emulate `forced-colors`. | test harness |
| WebKit: HC-07 at dpr 2 | Right after `ready`, one spark canvas lags its CSS size. After 1.5 s, `canvas-dpr-probe.mjs` finds no canvas off its CSS size × dpr in any engine. | transient |
| WebKit: tank label contrast | The test's `img.decode()` of a `data:` PNG hangs in WebKit, so the measure never runs. The colours are the same CSS tokens, which pass in Chromium. | not measured in WebKit |

- **Fixes.**
  - `js/systems/sir.js`: `I_{\max}` and `t_{\max}` are now `I_{\mathrm{max}}` and `t_{\mathrm{max}}`; the glyphs are the same.
  - `css/base.css`: `.katex-mathml annotation { display: none; }`, outside layers like the forced-colours block.
  - `tests/unit/systems.test.mjs`: `checkTex()` now also checks every catalogue TeX's MathML for elements with a fixed number of children (`msub`, `msup`, `msubsup`, `mfrac`, `mover`, `munder`, `munderover`, `mroot`). Control (`arity-check.mjs`): `I_{\max}`, `t_{\max}` and `x_{\min}` are caught; `I_{\mathrm{max}}`, fractions, roots and accents pass.
- **After the fixes.**
  - `npm test`: 686 / 686.
  - `npm run build` twice: 2,285,460 B, identical sha256 `5feb6c2f…0b3be0871`.
  - Firefox: `mathml-probe.mjs` on the built file finds 0 invalid elements and 0 console errors.
  - Firefox and WebKit: HC-06 and the integration tour pass (`xb-fix.log`).
  - Full Chromium `npx playwright test`: **520 passed, 102 skipped, 0 failed** in 15.8 min (`full3.log`).
- **Not covered.** A real iPhone or Mac with Safari, and VoiceOver. Playwright's WebKit on Windows is close to Safari but does not replace them.

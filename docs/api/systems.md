# API: `DSL.systems` (owner: systems)

Model registry, input signals, batch simulation, synthetic "measured" data, the six models and the real-time `Simulator`.

- **Files:** `js/systems/registry.js` (registry, signals, `simulate`, helpers), `js/systems/simulator.js` (`Simulator`, `RingBuffer`), and one file per model: `massSpring.js`, `tanks.js`, `rlc.js`, `sir.js`, `market.js`, `pendulum.js`.
- **Depends on** `DSL.util` (ns.js), `DSL.core.numeric`, `DSL.core.tf` and `DSL.core.latex` (all loaded earlier). No DOM, no timers, no `Math.random`: everything is pure and deterministic. Models register themselves at load time with `DSL.systems.register`.
- **Tests:** `tests/unit/systems.test.mjs` (167 tests) and `tests/unit/simulator.test.mjs` (23 tests). Run with `node --test tests/unit/systems.test.mjs tests/unit/simulator.test.mjs`.
- **Icons:** `tools/icons/systems.list` (`activity`, `droplets`, `zap`, `virus`, `trending-up-down`, `metronome`).
- **CSS hooks / data-testid:** none (this module renders nothing).

## Deviations from `docs/ARCHITECTURE.md` §9

1. **Market variant id.** The continuous market variant keeps the contract id **`walras`**. The id `ajuste` (used in the systems task) is accepted as an **alias** everywhere a variant id is taken: `describe`, `variantOf`, `simulate`, `Simulator` (constructor and `setVariant`) and every `market.*(p, variant)` function. Everything returned uses `walras`.
2. **Default input.** Without `opts.input`, `simulate` and `Simulator` use the variant's *default input*: the first entry of `inputs(variant)` with its parameter defaults (`DSL.systems.defaultInput`). The contract's `{ type: 'escalon', amplitude: 1 }` would overflow a tank or mean nothing for SIR.
3. **`Simulator.setVariant(id)`** also replaces the input with the new variant's default input (input ranges differ per variant: e.g. a flow for `tanks/lineal`, a deviation Δq for `tanks/torricelli`). It emits `'params'`, `'input'` and `'reset'`.
4. **Extra Simulator events:** `'input'` `{ input }` (after `setInput`/`setVariant`) and `'halt'` `{ t, reason, kind? }` (see *Divergence guard*; `kind: 'dominio'` comes with a domain exit, so listeners need not parse the text).
5. **Divergence guard.**
   - If a state component becomes non-finite or exceeds `hints.stateBound` (default 1e12; the cobweb uses 1e6), the Simulator keeps the last valid state and stops advancing.
   - It exposes `sim.halted = { t, reason }` (Spanish) and emits `'halt'`. `reset()` clears it.
   - **Domain guard.** A model may define `domain(x, outputs, params, variant) → null | reason` (Spanish). After each accepted step or iteration, the Simulator calls it with the new state. If it returns a reason:
     - that step is kept and recorded in the history, and the simulation halts;
     - `halted = { t, reason: 'La simulación se detuvo en k = <k>: ' + reason, kind: 'dominio' }` (or `t = <t> <unit>` for continuous variants), and `'halt'` is emitted.
     - `market/telarana` implements it for P < 0, Q_d < 0 or Q_s < 0. Example: «La simulación se detuvo en k = 1: el precio se hizo negativo (−3 u.m.), fuera del dominio económico del modelo lineal. Con d/b = 1.2 la oscilación crece un 20 % por periodo.»
     - `simulate()` (batch) does not stop: it is the plain mathematical iteration.
6. **Input discontinuities.** `simulate` integrates piecewise between the jumps of `escalon`/`pulso`, so the trajectory has **two samples at each jump time** (left and right limits, same `t` and state, different `u`). The `Simulator` splits any RK4 step that straddles a jump. This keeps RK4 at full order (step responses match `tf` to ≤ 5e-5 relative) and makes the energy/mass balances exact to quadrature error.
7. **`inputSignal`** also supports `'rampa'` (`amplitude` = slope per time unit). No model offers it in `inputs()`.
8. **Additions** (all optional for consumers):
   - `describe()` adds `defaultInput` and `variant.summary`.
   - `ParamSpec.display = { unit, factor } | null`: a friendlier display unit (`value × factor`), e.g. `L` in mH, `C` in µF, `a` in cm², flows in L/s, `theta0` in degrees, SIR reduction in %. The stored value stays SI.
   - `InputSpec.description` (Spanish sentence for a tooltip or caption).
   - `hints` may add `yRange` (for the default input), `stateBound`, `equilibrium` (market) and `operatingPoint` (Torricelli).
   - `tf(p, variant, outputKey)` accepts output keys beyond `tfPairs`: `massSpring` `v`; `tanks/lineal` `qout`; `tanks/torricelli` `qout`; `tanks/cascada` `h1`; `pendulum/lineal` `theta` (input: torque per unit inertia). `tfPairs` stays exactly as in the contract.
   - `derivation()` returns 4–6 steps; besides `ley`, `laplace`, `despeje` there are `canonica` and model-specific ids (see *Derivation steps*).
   - `readouts()` items may carry `text` (qualitative value, then `value` is `null`, or `NaN` with `text`), `approx: true` and `tone` (`'success' | 'warning' | 'danger'`).
   - Every readout carries **`tip`**: a Spanish plain-text explanation of at most 160 characters, saying what the number means and when its formula holds. It is non-empty for every model, variant and parameter set (tested). FND-22 and GAL-11 show it as the readout's tooltip.
   - `OutputSpec.dash: true` marks a reference curve to draw dashed. `tanks/torricelli` `hLin` is the only one.
   - `energy(variant)` (massSpring, rlc, pendulum) gives the `{ unit, stored(x, p), dissipated(x, u, p), input(x, u, p) }` used by the `energia` invariant.
   - `domain(x, outputs, p, variant)` (market) is the Simulator's domain guard (deviation 5).
   - `invariants()` items add `tex`, `unit`, `relative`, `detail` (Spanish) and `parts`.
   - `linearization()` adds `R`, `tau` (Torricelli) or `eigenvalue` (SIR).
   - `market.zTransfer(p, variant)` gives the cobweb's G(z).
   - `wizard` adds `equation.tex`, `stateSpace.texWith(p)`, `measured.input`, `equationTerms[].side`, and for SIR `stocksFlows` and `causal` (links with polarity and R/B loops).
   - `simulate()` result adds `modelId`, `timeDomain`, `timeUnit`, `input` (normalized), `duration` and `stats`.
   - `DSL.systems.variantOf`, `defaults`, `defaultInput`, `normalizeInput`, `inputBreakpoints`, `syntheticData`, `calibrationError`, `G`, `RingBuffer` and `helpers`.
9. **Terminology.** The RLC copy uses the user's words «capacitor» and «inductor».

## Registry (`registry.js`)

| Signature | Returns / notes |
|---|---|
| `register(model)` | `model`. Validates id, category, variants (`timeDomain`), the required functions (`params inputs state outputs x0 output hints tfPairs tf derivation invariants readouts`, plus `deriv` for continuous and `next` for discrete variants). Fills `listed = true`, `sceneId = null`, `wizard = null` and a `linearization` returning `null` when missing. Throws (Spanish) on a duplicate id or a bad model |
| `get(id)` | `model \| null` |
| `list({ all = false } = {})` | Models in registration order: `massSpring, tanks, rlc, sir, market` (+ `pendulum` with `all`) |
| `variantOf(modelOrId, variantId?)` | Variant object; no id → first variant; aliases resolved; unknown → throws |
| `defaults(modelOrId, variantId?)` | `{ [key]: default }` |
| `defaultInput(modelOrId, variantId?)` | `{ type, ...param defaults }` of the first input spec |
| `describe(modelOrId, variantId?)` | `{ model, variant: { id, label, timeDomain, linear, timeUnit, summary }, params, defaults, inputs, defaultInput, state, outputs, tfPairs, hints /* with defaults */, sceneId }` |
| `inputSignal(spec)` | `(t) → u` with `fn.spec` = the normalized spec. Throws on an unknown type |
| `normalizeInput(spec)` | `{ type, amplitude, t0, width, omega, offset }` with defaults (`amplitude` 1, or 0 for `ninguna`; `t0` 0; `width` 1; `omega` 1; `offset` 0) |
| `inputBreakpoints(spec)` | Jump times: `[t0]` (escalón), `[t0, t0 + width]` (pulso), else `[]` |
| `simulate(modelOrId, { variant, params, input, duration, dt, method = 'rk4' })` | Trajectory (below). `params` are merged over the defaults (unknown keys and non-finite values are ignored). `duration` and `dt` default to `hints`. `method` is any `numeric.integrate` method (`euler`, `heun`, `rk4`, `rk45`) |
| `syntheticData(modelOrId, overrides?)` | Deterministic «datos medidos» from `model.wizard.measured` (below) |
| `calibrationError(modelOrId, value, data, extraParams?)` | `{ rmse, t, y }`: simulates with `data.param = value` and compares with `data` at its sample times |
| `CATEGORIES` | `{ mecanico: 'Mecánico', hidraulico: 'Hidráulico', electrico: 'Eléctrico', biologico: 'Biológico', economico: 'Económico' }` |
| `G` | 9.81 m/s² |
| `Simulator`, `RingBuffer` | See *Simulator* |
| `helpers` | Internal helpers shared by the model files (`hintsFromTF`, `quad`, `trapz`, `energyBalance`, `denseEnergy`, `lin`, `num`, `param`, `inputSpec`, `niceNumber`, `niceCeil`, `padRange`, …). Not a stable API for sections |

### Input signals

| `type` | u(t) |
|---|---|
| `'escalon'` | `offset + (t ≥ t0 ? amplitude : 0)` |
| `'pulso'` | `offset + (t0 ≤ t < t0 + width ? amplitude : 0)` |
| `'senoidal'` | `offset + (t ≥ t0 ? amplitude·sin(omega·(t − t0)) : 0)` |
| `'rampa'` | `offset + (t ≥ t0 ? amplitude·(t − t0) : 0)` (extra) |
| `'ninguna'` | `offset` |

Discrete models evaluate u at t = k.

### `simulate()` result

```
{ modelId, variant /* resolved id */, timeDomain, timeUnit, params /* merged */, input /* normalized */, duration,
  t: number[], x: number[][], u: number[], outputs: { [key]: number[] },
  stats: { method, steps, dt?, success, message } }
```

- **Continuous:** `numeric.integrate` with a fixed step, piecewise between input jumps (two samples at each jump; see deviation 6). The grid is `0, dt, 2dt, …`, restarted at each jump, and the last step of each piece is shortened to land on its end.
- **Discrete:** `x[k+1] = next(k, x[k], u(k))` for `k = 0 … round(duration) − 1`, and `t = [0, 1, …, n]`.
- The result is what `model.invariants(traj)` expects.

### Synthetic data (wizard step 4)

`syntheticData(id)` does the following:

1. simulates `wizard.variant` with `params[measured.param] = measured.trueValue` and `measured.input` for `measured.duration`;
2. samples `measured.samples` uniform times in (0, duration] by linear interpolation;
3. adds `measured.noise · N(0, 1)` from `mulberry32(measured.seed)` (Box–Muller through `util.gaussian`).

It returns `{ modelId, variant, param, trueValue, outputKey, noise, seed, input, duration, t, y }`, and the same call always gives the same numbers. `calibrationError(id, value, data)` gives the RMSE of a candidate value; at `trueValue` it is close to `noise`.

| Model | `param` | True value | Default | Noise | Samples | Output | Duration | Input |
|---|---|---|---|---|---|---|---|---|
| massSpring | `b` | 1.1 N·s/m | 0.8 | 0.004 m | 60 | `x` | 15 s | escalón 1 N |
| rlc | `R` | 30 Ω | 20 | 0.05 V | 80 | `vC` | 0.12 s | escalón 5 V |
| tanks (lineal) | `R` | 12 s/m² | 10 | 0.006 m | 60 | `h` | 60 s | escalón 0.05 m³/s |
| sir | `beta` | 0.33 /día | 0.3 | 25 personas | 40 | `I` | 120 días | ninguna |

## Model interface (actual)

Every model is the contract object of §9.2. Functions take `p` (`{ key: number }`) and `variant` (an id string; `undefined` means the first variant).

```
{ id, name, category, icon, summary, listed, sceneId, variants: [{ id, label, timeDomain, linear, timeUnit, summary }],
  variantAliases?,                                   // market: { ajuste: 'walras' }
  params(variant)  → ParamSpec[]   { key, label, symbol /*TeX*/, unit, min, max, step, default, tooltip, scale, live, display }
  inputs(variant)  → InputSpec[]   { id, label, symbol /*TeX*/, unit, description, params: ParamSpec[] /*amplitude, t0, width, omega, offset*/ }
  state(variant)   → [{ key, label, symbol /*TeX*/, unit }]
  outputs(variant) → [{ key, label, symbol /*TeX*/, unit, color /*token*/, dash? }]
  x0(p, variant) → number[]
  deriv(t, x, u, p, variant) → number[]          (continuous)
  next(k, x, u, p, variant) → number[]           (discrete: x[k+1] from x[k] and u[k])
  output(t, x, u, p, variant) → { [key]: number }
  hints(p, variant) → { duration, dt, timeScale, yRange?, stateBound?, equilibrium?, operatingPoint? }
  tfPairs(variant) → [{ outputKey, label /*TeX*/, linearized }]
  tf(p, variant, outputKey?) → { tf: TransferFunction, inputSymbol, outputSymbol /*TeX*/, inputLabel, outputLabel, note } | null
  linearization(p, variant) → { operatingPoint, tf | null, tex: string[], note, R?, tau?, eigenvalue? } | null
  derivation(p, variant, outputKey?) → [{ id, title, text, tex: string[] }]
  invariants(traj) → [{ id, label, tex, value, tolerance, ok, unit, relative?, detail, parts? }]
  readouts(p, variant) → [{ id, label, tex, value: number | null, unit, digits?, text?, approx?, tone?, tip }]
  energy?(variant) → { unit, stored(x, p), dissipated(x, u, p), input(x, u, p) }      (massSpring, rlc, pendulum)
  domain?(x, outputs, p, variant) → null | string                                  (market: telarana)
  wizard: {...} | null
}
```

**Text conventions.**
- `label`, `tooltip`, `tip`, `description`, `title`, `text`, `detail` and `note` are Spanish plain text. They use Unicode symbols (ω, ζ, ḣ) and the typographic minus, so render them as text.
- Every `symbol`, every `tfPairs` `label`, every `tex` and every `*Symbol` field is TeX. All of them render with KaTeX 0.16.47 under `throwOnError: true`; this is checked in the unit tests and in the browser (226 strings at the defaults).

### Hints

- **Linear continuous models** (`helpers.hintsFromTF`):
  - `duration` is `tf.timeHorizon()`, capped at 40 periods of the slowest oscillatory mode and rounded up to 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ᵏ;
  - `dt` is at most `duration/1500` and at most `0.1/max|p|`, adjusted to divide `duration` exactly (at most 20 000 steps);
  - `timeScale` is `duration/12` rounded to 1, 2, 2.5 or 5 × 10ᵏ, so one run takes about 12 s at 1×.
  - Torricelli uses its linearized G(s) with `duration × 1.5`.
- **SIR:** `duration` ≈ `2·ln(N/I0)/(β − γ) + 4/γ` (or `5/|β − γ|` when β ≤ γ), clamped to [30, 400] días; `dt ≤ 0.1` día; `timeScale` is `duration/15`, rounded.
- **Pendulum:** `duration` = min(8 periods, 12/c), at least 2 T₀; `dt = T₀/200`; `timeScale = 1`.
- **Cobweb:**
  - `duration` is the number of periods to reach 2 % (× 1.3, + 4) when it converges, 30 for a cycle, and the periods until a 30× growth when it diverges. It is clamped to [12, 60] ([8, 60] when divergent).
  - **Exit from the economic domain.** If, without perturbation, some period k ≥ 1 in that window has P < 0, Q_d < 0 or Q_s < 0, then `duration` is that first k. The Simulator stops there (deviation 5).
  - `yRange` is computed with P clipped to [0, max(P₀, a/b)], so a divergent cobweb no longer blows the axis up. For example, with b = 2 and d = 4, P stays within [−0.2·a/b, 1.2·max(P₀, a/b)].
  - The defaults do not leave the domain and their hints are unchanged (duration 22, P in [−3.2, 43.2]).
  - `dt = 1`, `timeScale = 2` iterations per real second, `stateBound = 1e6`.
- `yRange` is computed for the variant's **default input** (e.g. 1 N, 5 V, 0.05 m³/s). Use `'auto'` when the input changes.

### Derivation steps

| Model / variant | Step ids, in order |
|---|---|
| massSpring | `ley` → `laplace` → `despeje` → `canonica` (outputKey `x` or `v`) |
| rlc | `ley` → `laplace` → `despeje` → `canonica` (`vC`: LC·v̈C + RC·v̇C + vC = v; `i`: the integro-differential KVL) |
| tanks/lineal | `ley` → `laplace` → `despeje` → `canonica` (`h` or `qout`) |
| tanks/torricelli | `ley` → `equilibrio` → `linealizacion` → `laplace` → `despeje` → `canonica` |
| tanks/cascada | `ley` → `laplace` → `despeje` → `canonica` (`h2`, or `h1`) |
| market/walras | `ley` → `equilibrio` → `laplace` → `despeje` → `canonica` |
| market/telarana | `ley` → `diferencias` → `equilibrio` → `solucion` → `estabilidad` → `sings` (why there is no G(s), and G(z) = (1/b)/(z + d/b)). `ley` and `diferencias` include the demand shift: Q_d = a − bP_t + D_{t−1} and P_t = (a − c)/b − (d/b)P_{t−1} + D_{t−1}/b |
| sir | `ley` → `nolineal` (why there is no global G(s)) → `linealizacion` (İ ≈ (β − γ)I) → `umbral` (R₀, 1 − 1/R₀, final size) → `pico` (I_max) |
| pendulum | `ley` → `linealizacion` → `laplace` → `despeje` → `canonica` (period against amplitude) |

Each step's `tex[]` goes from the symbolic law to the expression with the current numbers substituted.

**Suggested mapping for the «Procedimiento paso a paso» (tfengine):**
- every step before `laplace` → step 1 (law and ODE; this includes Torricelli's `equilibrio` and `linealizacion`);
- `laplace` → step 2;
- `despeje` → step 3;
- `canonica` → the physical reading of step 4 (the engine computes K, τ or ωn, ζ, ωd itself).

For `sir` and `telarana`, `tf()` is `null` and the steps are the diagnostic.

### Invariants

| id | Models | Check |
|---|---|---|
| `energia` | massSpring, rlc, pendulum | ΔE + ∫P_dis dt = ∫P_in dt (details below). `tolerance` = 1e-3 × max(E_max, \|D\|, \|W\|); measured residuals are ≤ 1e-4 relative with every input at the default steps |
| `masa` | tanks (all) | V(T) − V(0) = ∫(q_in − q_out) dt, by composite Simpson over the samples, with the same tolerance. Torricelli's `Δh_lin` state does not enter it |
| `conservacion` | sir | max \|S + I + R − N\| ≤ 1e-9·N |
| `positividad` | sir | min(S, I, R) ≥ −1e-9·N |
| `monotonia` | sir | S never increases (slack 1e-9·N) |
| `formaCerrada` | market/telarana | The iteration equals P* + (−d/b)ᵗ(P₀ − P*) for a constant input, or the explicit convolution sum otherwise, to 1e-9·max\|P\| |
| `solucionExacta` | market/walras | RK4 equals the exact solution of the first-order ODE for each input type, to 1e-6·max\|P\| |

The energy terms:

| Model | Stored | Dissipated power | Input power |
|---|---|---|---|
| massSpring | ½kx² + ½mv² | b·v² | F·v |
| rlc | ½Li² + ½C·vC² | R·i² | v·i |
| pendulum (per unit mass) | ½L²ω² + gL(1 − cos θ); ½gLθ² when linear | c·L²ω² | u·L²·ω |

For the tanks, cascada uses V₁ + V₂ and q_out = h₂/R₂, and Torricelli uses q_in = max(0, q_in,0 + Δq).

**How the energy integrals are taken (`helpers.denseEnergy`).** The balance measures only the error of the trajectory, that is, of the method and step that produced it.
- The integrals are taken over the integrator's continuous trajectory, not by a coarse quadrature over the samples. Between two samples, x(t) is the cubic Hermite interpolant with x and ẋ = f(t, x, u) at both ends, which has the same order as RK4.
- Each step is integrated by 3-point Gauss–Legendre, with u(t) from `traj.input`. Intervals of zero length at input jumps are skipped.
- `parts.source` is `'trayectoria'`. For a trajectory without `modelId` or `input` (not from `simulate()`), Simpson over the samples is used and `parts.source` is `'muestras'`.
- Integrating the two powers as extra RK4 states was tried and rejected. b·v² has modes at twice the system's rates, so at Δt = 0.2 its own RK4 error (1.1e-3) would fail the check even though the trajectory is accurate to 2.5e-4.
- Wizard settings (duration 15 s, step input) give:

| Run | Relative residual | Verdict |
|---|---|---|
| massSpring b = 3, RK4, Δt = 0.2 | 1.3e-4 | se cumple (Simpson gave 2.1e-3, a false «No se cumple») |
| RLC R = 90 Ω, RK4, Δt = 1.6 ms | 9.8e-5 | se cumple |
| massSpring b = 3, Euler, Δt = 0.2 | 0.20 | still «No se cumple» |

- The cross-check compares E₁, ∫P_dis and ∫P_ent with `solve_ivp` DOP853 of the augmented system, to within 1e-3 × scale.

A deliberately corrupted trajectory fails the balance (tested). A badge can therefore show a real failure, for example with `method: 'euler'` and a coarse `dt`.

### Model conventions worth knowing

- **massSpring:** x0 = [0, 0]; u = F(t) in N.
- **rlc:** the state order is `[i, vC]`; u = v(t) in V; x0 = [0, 0].
- **tanks/lineal and cascada:** u = q_in(t) in m³/s, and the tanks start empty.
- **tanks/torricelli:**
  - u = Δq_in, a deviation; the inflow is `q_in = max(0, q_in,0 + u)`;
  - the state is `[h, Δh_lin]`, with x0 = [h₀, 0] (the equilibrium); `q_out = a√(2g·max(h, 0))`;
  - `Δh_lin` integrates the linearized model A·Δḣ = Δq − Δh/R (R = 2h₀/q_in,0) with the same input. The output `hLin = h₀ + Δh_lin` (`{ key: 'hLin', label: 'Nivel lineal (aprox.)', symbol: 'h_{lin}(t)', unit: 'm', color: '--c-out', dash: true }`, `yRange.hLin = yRange.h`) is the linear prediction, drawn dashed next to the real level. It matches h₀ + Δq·G(s) step to 1e-6 m. For Δq = +0.02 the run ends at h ≈ 1.272 against h_lin ≈ 1.070; for Δq = −0.008, at 0.2467 against 0.2141. It enters neither the mass balance nor the scene (which reads `h`);
  - a scene that draws the inflow stream should use `params.qin0 + input.value`.
- **sir:** u ∈ [0, 1] is the fraction of contacts avoided (distancing), so β_ef = β·(1 − u). With `ninguna` it is the classic SIR.
- **market:**
  - u = D, a demand shift in units: Q_d = a − b·P + D.
  - Outputs `Qd` and `Qs` are both evaluated at the **current** price. In the cobweb, `Qs[k] = c + d·P_k` is the quantity producers decide for the next period, so `Qd[k+1] = Qs[k]` (tested), and consecutive (Q, P) pairs draw the cobweb.
  - In `telarana`, D_k shifts the demand that clears period k+1 (`next` uses u(k)).
  - P* = (a − c)/(b + d) with a ∈ [60, 150] > c ∈ [0, 40], so P* > 0. d/b ranges over 0.125–8, so convergence, a cycle (d = b) and divergence are all reachable.
- **pendulum:** u = τ/(mL²) in rad/s²; x0 = [θ₀, 0].

## Simulator (`simulator.js`)

```js
const sim = new DSL.systems.Simulator(modelOrId, {
  variant, params, input /* default: defaultInput */, speed = 1, historySize = 2400, dt /* overrides hints.dt */
});
```

| Member | Behaviour |
|---|---|
| `step(realDt)` | Returns the substeps or iterations advanced. `acc += realDt·speed·timeScale`.<br>Continuous: while `acc ≥ dt` (relative slack 1e-9), one RK4 substep of `dt`, split at input jumps.<br>Discrete: while `acc ≥ 1`, `x = next(k, x, u(k))` and `k++`.<br>At most **2000** per call; the excess is dropped and the remainder is kept modulo dt. It records one history sample and emits `'step'` only if it advanced. A `realDt` ≤ 0 or `NaN`, a destroyed simulator or a halted one gives 0 |
| `advance(simAmount, { record = 'auto' })` | Advances exactly `simAmount` time units (whole `dt` steps plus a final shortened one), or `round(simAmount)` iterations, ignoring speed. Emits one `'step'`. Use it for reduced motion («mostrar el estado final»).<br>`record`: `'auto'` takes one sample each time t crosses a multiple of `hints.duration/720` (about 720 per run; every iteration when discrete); `'all'` takes every substep; `'end'` only the final state |
| `reset()` | t = k = 0 and x = x0. Recomputes `hints` and `timeScale`, clears `halted` and the history, records the initial sample and emits `'reset'` |
| `setParams(partial)` | Merges finite values of known keys. If any changed key has `live: false`, it resets fully (and emits `'reset'`). Otherwise the state is kept and `dt` and `hints` are recomputed, but **`timeScale` stays until the next reset**, so the playback speed does not jump while a slider is dragged. Emits `'params'` `{ params }` only if something changed |
| `setInput(spec)` | Live, no reset. Emits `'input'` `{ input }` |
| `setSpeed(x)` | Clamped to [0.25, 4]; a non-finite value gives 1 |
| `setVariant(id)` | Keeps the values of keys present in the new variant, uses defaults for the rest and the new variant's default input, then resets. Emits `'params'`, `'input'` and `'reset'` |
| `on(event, fn)` | `'step' \| 'reset' \| 'params' \| 'input' \| 'halt'`. Returns `unsubscribe` |
| `destroy()` | Clears the handlers; later calls do nothing |

**Getters** (they return copies): `t`, `k`, `u`, `speed`, `variant`, `timeDomain`, `timeUnit`, `model`, `state`, `outputs`, `params`, `input`, `history`, `hints`, `dt`, `timeScale`, `halted` (`null | { t, reason, kind? }`, with `kind: 'dominio'` for the domain guard) and `destroyed`. For a discrete variant, `t === k`.

**Halting on the domain guard.**
- With `step()` and `advance()`, the step that leaves the domain is the last one taken, and it is recorded in the history before `'halt'` is emitted.
- `step()` records its sample before `'halt'` and then emits `'step'`.

**Payloads:**
- `'step'` and `'reset'`: `{ t, state, outputs, u, substeps }` (`substeps` is 0 on reset);
- `'halt'`: `{ t, reason }`.

**History:** a `RingBuffer` of `{ t, outputs, state, u }`, with `{ length, capacity, push(item), get(i) /*0 = oldest; negative counts from the end*/, last(), toArray(), forEach(fn(item, i)), clear() }`.

**Determinism:** the same sequence of calls, including the `realDt` values, gives the same history bit for bit. This is tested on linear, nonlinear and discrete models.

**Cost:** 600 frames at 1× take 0.2–2 ms per model in Chromium, measured with every model at its defaults.

## Catalogue (actual values)

#### `massSpring` — Masa-resorte-amortiguador

**Variant `base`** (continuous, linear, s) — «Masa-resorte-amortiguador». Default hints: duration 15, dt 0.01, timeScale 1.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `m` | Masa | kg | 0.2 – 5 (step 0.05) | 1 | linear | yes | — |
| `b` | Amortiguamiento | N·s/m | 0 – 5 (step 0.05) | 0.8 | linear | yes | — |
| `k` | Rigidez del resorte | N/m | 0.5 – 50 (step 0.5) | 4 | linear | yes | — |

Inputs (first = default): `escalon` «Escalón» F(t) [N]: amplitude -5–5 = 1, t0 0–10 = 0; `pulso` «Pulso» F(t) [N]: amplitude -10–10 = 4, t0 0–10 = 0, width 0.05–5 = 0.5; `senoidal` «Senoidal» F(t) [N]: amplitude 0–5 = 1, omega 0.1–20 = 2, t0 0–10 = 0.

Outputs: `x` Posición (m, --c-out), `v` Velocidad (m/s, --c-zero). State: `x`, `v`.

tfPairs: `x` X(s)/F(s).

Readouts: `wn`, `zeta`, `wd`, `K`, `Mp`, `ts`, `regimen`. Derivation steps: `ley` → `laplace` → `despeje` → `canonica`. Invariants: `energia`.

`ts` depends on the regime:
- **0 < ζ < 1:** 4/(ζωn), label «Tiempo de establecimiento (≈, 2 %)», `approx: true`, TeX `t_s \approx 4/(\zeta\omega_n)`.
- **ζ ≥ 1 (critical or overdamped):** without oscillation the envelope rule is wrong (the slow pole governs), so `ts` is `new TransferFunction([1], [m, b, k]).stepInfo().settlingTime`, measured on the exact step response. Its label is «Tiempo de establecimiento (2 %)», with `approx: false` and TeX `t_s`. Examples: {m 1, b 5, k 1} gives 18.96 s (4/(ζωn) would give 1.6 s), and {1, 4, 4} gives 2.917 s. If the window cannot contain it, the value is `NaN` with a `text`.
- **ζ = 0:** there is no `ts`.

`Mp` exists only for 0 < ζ < 1 and `wd` only for ζ < 1. The other models were checked for formulas that only hold when underdamped: RLC `tau` is now regime-aware, and the pendulum's `T0` tip says it is the undamped period.


#### `tanks` — Depósitos de líquido

**Variant `lineal`** (continuous, linear, s) — «Depósito con salida lineal». Default hints: duration 60, dt 0.04, timeScale 5.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `A` | Área del depósito | m² | 0.2 – 4 (step 0.05) | 1 | linear | yes | — |
| `R` | Resistencia de la válvula | s/m² | 1 – 50 (step 0.5) | 10 | linear | yes | — |

Inputs (first = default): `escalon` «Escalón» q_{in}(t) [m³/s]: amplitude 0–0.2 = 0.05, t0 0–60 = 0; `pulso` «Pulso» q_{in}(t) [m³/s]: amplitude 0–0.2 = 0.1, t0 0–60 = 0, width 1–60 = 20; `senoidal` «Senoidal» q_{in}(t) [m³/s]: offset 0–0.2 = 0.05, amplitude 0–0.1 = 0.03, omega 0.01–2 = 0.2, t0 0–60 = 0.

Outputs: `h` Nivel (m, --c-out), `qout` Caudal de salida (m³/s, --c-zero). State: `h`.

tfPairs: `h` H(s)/Q_{in}(s).

Readouts: `tau`, `K`, `pole`, `ts`. Derivation steps: `ley` → `laplace` → `despeje` → `canonica`. Invariants: `masa`.

**Variant `torricelli`** (continuous, nonlinear, s) — «Depósito con descarga de Torricelli». Default hints: duration 150, dt 0.1, timeScale 10.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `A` | Área del depósito | m² | 0.2 – 4 (step 0.05) | 0.5 | linear | yes | — |
| `a` | Área del orificio | m² | 0.005 – 0.02 (step 5×10⁻⁴) | 0.01 | linear | yes | cm² ×10000 |
| `qin0` | Caudal de operación | m³/s | 0.01 – 0.04 (step 0.001) | 0.03 | linear | **no** (reset) | L/s ×1000 |

Inputs (first = default): `escalon` «Escalón» \Delta q_{in}(t) [m³/s]: amplitude -0.008–0.02 = 0.01, t0 0–60 = 5; `pulso` «Pulso» \Delta q_{in}(t) [m³/s]: amplitude -0.008–0.02 = 0.015, t0 0–60 = 5, width 1–60 = 20; `senoidal` «Senoidal» \Delta q_{in}(t) [m³/s]: amplitude 0–0.008 = 0.005, omega 0.01–2 = 0.1, t0 0–60 = 0.

Outputs: `h` Nivel (m, --c-out), `qout` Caudal de salida (m³/s, --c-zero), `hLin` Nivel lineal (aprox.) (m, --c-out, `dash: true`). State: `h`, `dhLin` (Δh of the linearized model).

tfPairs: `h` \Delta H(s)/\Delta Q_{in}(s) (linearized).

Readouts: `h0`, `R`, `tau`, `ts`. Derivation steps: `ley` → `equilibrio` → `linealizacion` → `laplace` → `despeje` → `canonica`. Invariants: `masa`.

**Variant `cascada`** (continuous, linear, s) — «Dos depósitos en cascada». Default hints: duration 80, dt 0.05333, timeScale 5.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `A1` | Área del depósito 1 | m² | 0.2 – 4 (step 0.05) | 1 | linear | yes | — |
| `R1` | Resistencia de la válvula 1 | s/m² | 1 – 50 (step 0.5) | 8 | linear | yes | — |
| `A2` | Área del depósito 2 | m² | 0.2 – 4 (step 0.05) | 1.5 | linear | yes | — |
| `R2` | Resistencia de la válvula 2 | s/m² | 1 – 50 (step 0.5) | 8 | linear | yes | — |

Inputs (first = default): `escalon` «Escalón» q_{in}(t) [m³/s]: amplitude 0–0.2 = 0.05, t0 0–60 = 0; `pulso` «Pulso» q_{in}(t) [m³/s]: amplitude 0–0.2 = 0.1, t0 0–60 = 0, width 1–60 = 20; `senoidal` «Senoidal» q_{in}(t) [m³/s]: offset 0–0.2 = 0.05, amplitude 0–0.1 = 0.03, omega 0.01–2 = 0.2, t0 0–60 = 0.

Outputs: `h1` Nivel del depósito 1 (m, --c-out), `h2` Nivel del depósito 2 (m, --c-zero). State: `h1`, `h2`.

tfPairs: `h2` H_2(s)/Q_{in}(s).

Readouts: `tau1`, `tau2`, `K`, `zeta`, `regimen`. Derivation steps: `ley` → `laplace` → `despeje` → `canonica`. Invariants: `masa`.


#### `rlc` — Circuito RLC serie

**Variant `serie`** (continuous, linear, s) — «RLC serie». Default hints: duration 0.12, dt 8×10⁻⁵, timeScale 0.01.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `R` | Resistencia | Ω | 2 – 100 (step 1) | 20 | linear | yes | — |
| `L` | Inductancia | H | 0.05 – 1 (step 0.01) | 0.2 | log | yes | mH ×1000 |
| `C` | Capacitancia | F | 1×10⁻⁵ – 0.001 (step 1×10⁻⁶) | 1×10⁻⁴ | log | yes | µF ×1×10⁶ |

Inputs (first = default): `escalon` «Escalón» v(t) [V]: amplitude -24–24 = 5, t0 0–0.1 = 0; `pulso` «Pulso» v(t) [V]: amplitude -24–24 = 5, t0 0–0.1 = 0, width 0.001–0.1 = 0.02; `senoidal` «Senoidal» v(t) [V]: amplitude 0–24 = 5, omega 10–1000 = 220, t0 0–0.1 = 0.

Outputs: `vC` Tensión del capacitor (V, --c-out), `i` Corriente (A, --c-zero). State: `i`, `vC`.

tfPairs: `vC` V_C(s)/V(s), `i` I(s)/V(s).

Readouts: `wn`, `zeta`, `wd`, `Q`, `tau`, `Mp`, `regimen`. Derivation steps: `ley` → `laplace` → `despeje` → `canonica`. Invariants: `energia`.

`tau` follows the regime of `regimen`:
- **ζ < 1:** «Constante de decaimiento», TeX `2L/R`, value 1/σ = 2L/R, the envelope.
- **ζ > 1:** «Constante de tiempo dominante», TeX `\tau = -1/p_{\mathrm{lenta}}`. Here τ = −1/p_lenta with p_lenta = −σ + √(σ² − ωn²), computed without cancellation as (σ + √(σ² − ωn²))/ωn². For example, R = 100 Ω, L = 0.05 H and C = 1 mF give 0.0995 s, against 2L/R = 1 ms.
- **ζ = 1:** «Constante de tiempo (polo doble)», τ = 1/σ = 2L/R.

The `canonica` step's regime sentence follows the output: with `outputKey: 'i'` it reads «…la corriente oscila con frecuencia ωd…», and its critical and overdamped sentences also speak of the current. The `vC` text is unchanged.


#### `sir` — Epidemia SIR

**Variant `base`** (continuous, nonlinear, días) — «Modelo SIR». Default hints: duration 120, dt 0.06, timeScale 10.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `beta` | Tasa de contagio | 1/día | 0.05 – 1 (step 0.01) | 0.3 | linear | yes | — |
| `gamma` | Tasa de recuperación | 1/día | 0.02 – 0.5 (step 0.01) | 0.1 | linear | yes | — |
| `N` | Población total | personas | 1000 – 1×10⁶ (step 1000) | 10000 | log | **no** (reset) | — |
| `I0` | Infectados iniciales | personas | 1 – 100 (step 1) | 10 | linear | **no** (reset) | — |

Inputs (first = default): `ninguna` «Sin intervención» u(t) [—]: no params; `escalon` «Escalón» u(t) [—]: amplitude 0–0.9 = 0.5, t0 0–120 = 20; `pulso` «Pulso» u(t) [—]: amplitude 0–0.9 = 0.6, t0 0–120 = 20, width 1–120 = 30.

Outputs: `S` Susceptibles (personas, --c-out), `I` Infectados (personas, --c-pole), `R` Recuperados (personas, --c-zero). State: `S`, `I`, `R`.

tfPairs: none.

Readouts: `R0`, `umbral`, `Imax`, `tPico`, `final`, `crecimiento`, `duracion`, `regimen`. Derivation steps: `ley` → `nolineal` → `linealizacion` → `umbral` → `pico`. Invariants: `conservacion`, `positividad`, `monotonia`.


#### `market` — Mercado: oferta y demanda

**Variant `telarana`** (discrete, linear, periodos) — «Telaraña (tiempo discreto)». Default hints: duration 22, dt 1, timeScale 2.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `a` | Demanda a precio nulo | unid. | 60 – 150 (step 1) | 100 | linear | yes | — |
| `b` | Sensibilidad de la demanda | unid./u.m. | 0.5 – 4 (step 0.05) | 2 | linear | yes | — |
| `c` | Oferta a precio nulo | unid. | 0 – 40 (step 1) | 10 | linear | yes | — |
| `d` | Sensibilidad de la oferta | unid./u.m. | 0.5 – 4 (step 0.05) | 1.5 | linear | yes | — |
| `P0` | Precio inicial | u.m. | 1 – 60 (step 0.5) | 40 | linear | **no** (reset) | — |

Inputs (first = default): `ninguna` «Sin perturbación» D_t [unid.]: no params; `escalon` «Escalón» D_t [unid.]: amplitude -30–30 = 10, t0 0–30 = 5; `pulso` «Pulso» D_t [unid.]: amplitude -30–30 = 20, t0 0–30 = 5, width 1–20 = 1.

Outputs: `P` Precio (u.m., --c-state), `Qd` Demanda al precio actual (unid., --c-out), `Qs` Oferta decidida con el precio actual (unid., --c-zero). State: `P`.

tfPairs: none.

Readouts: `Pstar`, `Qstar`, `ratio`, `periodos`, `estabilidad`. Derivation steps: `ley` → `diferencias` → `equilibrio` → `solucion` → `estabilidad` → `sings`. Invariants: `formaCerrada`.

**Domain.**
- `domain()` halts the Simulator at the first period with P < 0, Q_d < 0 or Q_s < 0. The reason names the quantity and its value, then explains the growth: «Con d/b = 1.2 la oscilación crece un 20 % por periodo.» Variants of the sentence cover d/b = 1 and d/b < 1.
- With b = 2, d = 2.4 and P₀ = 40, P₁ = −3, so the run halts at k = 1. The hints' `duration` and `yRange` end at that period.

**Variant `walras`** (continuous, linear, s) — «Ajuste continuo del precio». Default hints: duration 10, dt 0.006667, timeScale 1.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `a` | Demanda a precio nulo | unid. | 60 – 150 (step 1) | 100 | linear | yes | — |
| `b` | Sensibilidad de la demanda | unid./u.m. | 0.5 – 4 (step 0.05) | 2 | linear | yes | — |
| `c` | Oferta a precio nulo | unid. | 0 – 40 (step 1) | 10 | linear | yes | — |
| `d` | Sensibilidad de la oferta | unid./u.m. | 0.5 – 4 (step 0.05) | 1.5 | linear | yes | — |
| `P0` | Precio inicial | u.m. | 1 – 60 (step 0.5) | 40 | linear | **no** (reset) | — |
| `alpha` | Velocidad de ajuste | u.m./(unid.·s) | 0.02 – 1 (step 0.01) | 0.2 | linear | yes | — |

Inputs (first = default): `escalon` «Escalón» D(t) [unid.]: amplitude -30–30 = 10, t0 0–20 = 0; `pulso` «Pulso» D(t) [unid.]: amplitude -30–30 = 20, t0 0–20 = 2, width 0.5–20 = 3; `senoidal` «Senoidal» D(t) [unid.]: amplitude 0–30 = 10, omega 0.05–5 = 1, t0 0–20 = 0; `ninguna` «Sin perturbación» D(t) [unid.]: no params.

Outputs: `P` Precio (u.m., --c-state), `Qd` Demanda al precio actual (unid., --c-out), `Qs` Oferta al precio actual (unid., --c-zero). State: `P`.

tfPairs: `P` P(s)/D(s).

Readouts: `Pstar`, `Qstar`, `tau`, `K`, `estabilidad`. Derivation steps: `ley` → `equilibrio` → `laplace` → `despeje` → `canonica`. Invariants: `solucionExacta`.


#### `pendulum` — Péndulo simple

**Variant `nolineal`** (continuous, nonlinear, s) — «Péndulo no lineal». Default hints: duration 20, dt 0.01003, timeScale 1.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `L` | Longitud | m | 0.2 – 5 (step 0.05) | 1 | linear | yes | — |
| `c` | Amortiguamiento | 1/s | 0 – 2 (step 0.01) | 0.2 | linear | yes | — |
| `theta0` | Ángulo inicial | rad | 0 – 3 (step 0.01) | 1 | linear | **no** (reset) | ° ×57.3 |

Inputs (first = default): `ninguna` «Oscilación libre» u(t) [rad/s²]: no params; `escalon` «Escalón» u(t) [rad/s²]: amplitude -10–10 = 2, t0 0–10 = 0; `pulso` «Pulso» u(t) [rad/s²]: amplitude -20–20 = 5, t0 0–10 = 0, width 0.05–2 = 0.2.

Outputs: `theta` Ángulo (rad, --c-out), `omega` Velocidad angular (rad/s, --c-zero). State: `theta`, `omega`.

tfPairs: none.

Readouts: `wn`, `zeta`, `T0`, `T`, `errorSen`. Derivation steps: `ley` → `linealizacion` → `laplace` → `despeje` → `canonica`. Invariants: `energia`.

**Variant `lineal`** (continuous, linear, s) — «Péndulo linealizado». Default hints: duration 20, dt 0.01003, timeScale 1.

| Param | Label | Unit | Range | Default | Scale | Live | Display |
|---|---|---|---|---|---|---|---|
| `L` | Longitud | m | 0.2 – 5 (step 0.05) | 1 | linear | yes | — |
| `c` | Amortiguamiento | 1/s | 0 – 2 (step 0.01) | 0.2 | linear | yes | — |
| `theta0` | Ángulo inicial | rad | 0 – 3 (step 0.01) | 1 | linear | **no** (reset) | ° ×57.3 |

Inputs (first = default): `ninguna` «Oscilación libre» u(t) [rad/s²]: no params; `escalon` «Escalón» u(t) [rad/s²]: amplitude -10–10 = 2, t0 0–10 = 0; `pulso` «Pulso» u(t) [rad/s²]: amplitude -20–20 = 5, t0 0–10 = 0, width 0.05–2 = 0.2.

Outputs: `theta` Ángulo (rad, --c-out), `omega` Velocidad angular (rad/s, --c-zero). State: `theta`, `omega`.

tfPairs: none.

Readouts: `wn`, `zeta`, `T0`. Derivation steps: `ley` → `linealizacion` → `laplace` → `despeje` → `canonica`. Invariants: `energia`.


### Wizard data

`massSpring`, `rlc`, `tanks` (variant `lineal`) and `sir` have a `wizard`; `market` and `pendulum` have `null`.

```
wizard = {
  variant,
  boundary: { inputs: Item[], outputs: Item[], elements: Item[], environment: Item[] },   // Item = { id, label, symbol? /*TeX*/, unit? }
  laws: [{ id, title, text, tex }],
  equationTerms: [{ id, tex, label, text, side: 'lhs' | 'rhs' | 'eq' | 'flow' }],      // SIR uses 'eq' (balance rows) and 'flow'
  equation: { tex },                                   // the assembled equation (SIR: an aligned system)
  stateSpace: { tex, texWith(p) → tex },               // symbolic, and with numbers
  measured: { param, trueValue, noise, seed, samples, outputKey, duration, input },
  stocksFlows?: { stocks: [{ id, label, symbol }], flows: [{ id, label, from, to, tex }] },        // sir
  causal?: { links: [{ from, to, polarity: '+' | '-' }],
             loops: [{ id, type: 'refuerzo' | 'equilibrio', label, variables, text }] }           // sir
}
```

## Verification

- `node --test tests/unit/systems.test.mjs tests/unit/simulator.test.mjs`: 219 tests, all passing.
- **Regime-dependent readouts.** massSpring `ts` gives 18.96 s for {1, 5, 1} and 2.917 s for {1, 4, 4}, both exact, and 10 s (≈) at the defaults. RLC `tau` gives 0.0995 s for R = 100 Ω, L = 0.05 H, C = 1 mF; this is −1/p_lenta of the transfer function's poles.
- **Energy balance.** RK4 at Δt = 0.2 (massSpring, b = 3) and Δt = 1.6 ms (RLC, R = 90 Ω) passes, while Euler at Δt = 0.2 fails. The residual drops by more than 100× when Δt is divided by 4.
- **Torricelli h_lin.** It matches h₀ + Δq·G(s) step to 1e-6 m and ends at 1.070 m and 0.2141 m for Δq = +0.02 and −0.008. The real level ends at 1.272 m and 0.2467 m.
- **Cobweb domain.** b = 2, d = 2.4, P₀ = 40 halts at k = 1 with that period recorded. The defaults never halt. A model without `domain` still halts on `stateBound`.
- **Readout tips.** Every readout of every model and variant, over all parameter sets, has a Spanish `tip` of 1–160 characters.
- **Finite values everywhere.** Every model and variant was run at its defaults, at each parameter's min and max (the others at default), all at min and all at max, with every input it offers. Each run gave finite trajectories, valid hints (`dt` divides `duration`, at most 20 000 steps), finite readouts and every invariant within tolerance.
- **Step responses.** Simulated with the Simulator's RK4 policy, they match `tf(p).stepAnalytic()` to ≤ 5e-5 × max|y| over the same parameter sets. Cases: massSpring (x, v), rlc (vC, i), tanks lineal (h, qout), cascada (h1, h2, including the double pole τ₁ = τ₂), market walras (P from the equilibrium) and the linearized pendulum.
- **Torricelli.** R = (dq_out/dh)⁻¹ at h₀ matches a central-difference derivative to 1e-7 and equals 2h₀/q_in,0. The nonlinear response converges to the linearized one as Δq → 0.
- **Cobweb.** The closed form equals the iteration to 1e-9 for converging, cycling and diverging cases. With a demand shift, the explicit sum equals the iteration.
- **SIR.** S + I + R = N to 1e-9·N at every sample, at the parameter extremes and with interventions. I_max, the final size and the peak day agree with the simulation, and β ≤ γ gives no epidemic.
- **TeX.** Every string (derivations, linearizations, readouts, symbols, wizard) renders with KaTeX `throwOnError: true`, both in Node and in Chromium (index.html through file://, with zero console errors).

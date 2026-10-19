# API: `js/core/tf.js` → `DSL.core.tf` (owner: math)

This module provides the `TransferFunction` class:

- normalization, poles and zeros, DC gain and stability;
- the Routh–Hurwitz table, including its special cases;
- Bode with unwrapped phase;
- partial fractions of G(s)/s for any multiplicity;
- the analytic y(t) and g(t) with TeX;
- step metrics and canonical parameters;
- validation of the coefficients the user types.

**Requirements.** It needs `DSL.core.numeric` (loaded before it). It uses `DSL.core.latex` lazily, at call time, with a minimal fallback, and `DSL.util.formatNumber` and `parseNumber`.

**Tests.** `tests/unit/tf.test.mjs`. The cross-check against SciPy is described at the end of this file. See also [`numeric.md`](numeric.md) and [`latex.md`](latex.md).

```js
const { TransferFunction, TFInputError, partialFractions } = DSL.core.tf;
const G = new TransferFunction([4], [1, 2, 4]);      // 4/(s² + 2s + 4)
```

## Deviations from `docs/ARCHITECTURE.md` §8.2

1. **`timeHorizon()`** (all of its rules are listed in that method's section):
   - Stable modes do **not** have a 3-period minimum.
     - Every stable mode contributes `factor·(1 + 0.5·(m − 1))/|Re p|`, where m is its multiplicity.
     - By then an oscillatory mode has decayed by e^{−6}. A 3-period minimum would make heavily damped fast oscillations (for example −10 ± 1j) show a window that is mostly flat.
   - Oscillatory marginal modes still give 3 periods.
   - Unstable modes give `max(T, 6/σmax, min(3 periods, 12/σmax))`, capped at 12/σmax.
2. **`bodeRange()`** rounds outward to whole decades. `wMin = 10^floor(log10(min|r|/100))` and `wMax = 10^ceil(log10(max|r|·100))`. Roots with |r| ≤ 1e-12·max|r| are ignored.
3. **`stepInfo()`**:
   - `peak` and `peakTime` are `null` when there is no overshoot. `overshootPct` is then `0`.
   - `overshootPct` is `null` (with a note) in four cases:
     - the maximum is at t = 0⁺, because of a direct feed-through term;
     - the final value is 0;
     - the response is still above the final value and rising at the end of the window;
     - the window ends before the response settles.
   - Extra fields: `undershootPct` and `exact`.
4. **`TFInputError`** has two extra codes, used only by `fromCoeffStrings`: `'leading-zero'` and `'num-zero'`.
5. **Additions:**
   - `original`, `poleGroups()`, `zeroGroups()`, `dcGainInfo()`, `stabilityInfo()`;
   - `partialFractionsImpulse()`, `impulseAnalytic()`, `stepNumeric()`, `impulseNumeric()`, `impulseSamples()`, `toTexFactored()`;
   - the `normalized` option of `toTex`;
   - extra `routh()` fields: `limitSigns`, `specials`, `epsilon`, `axisRoots` and `tex`;
   - `residues` in `stepAnalytic()`;
   - `riseTime0to100` in `secondOrderParams().canonical`.
6. **Docs layout.** The API is documented in three files, `numeric.md`, `tf.md` and `latex.md`, not in `math.md`.

## Constructor and errors

`new TransferFunction(num, den)`:

- **Input:** `num` and `den` are arrays of finite numbers in descending powers.
- **Trimming:** both are trimmed with `poly.trim(·, 1e-14)`.
- **Normalization:** both are divided by `den[0]`, so **the denominator is monic** (`den[0] === 1` exactly). The coefficients you passed stay available in `original`.
- **No automatic pole–zero cancellation.**

The constructor throws `TFInputError` (Spanish message) in these cases:

| Case | `code` | `field` |
|---|---|---|
| Not an array, or a string | `'nonfinite'` | `'num'` / `'den'` |
| Empty array | `'empty'` | `'num'` / `'den'` |
| Non-finite coefficient (`token` = `String(c)`) | `'nonfinite'` | `'num'` / `'den'` |
| Zero denominator | `'den-zero'` | `'den'` |
| Denominator of degree 0 | `'den-degree'` | `'den'` |
| deg num > deg den | `'improper'` | `'num'` |

**`TFInputError extends Error`** has these fields:
- `name: 'TFInputError'`;
- `field: 'num' | 'den' | null`;
- `code`: `'empty' | 'token' | 'nonfinite' | 'den-zero' | 'den-degree' | 'improper' | 'leading-zero' | 'num-zero'`;
- `token: string | null`;
- `message`: Spanish, saying what failed and how to fix it.

A zero numerator is allowed in the constructor (G ≡ 0). `fromCoeffStrings` rejects it.

## Read-only properties

| Property | Value |
|---|---|
| `num`, `den` | frozen arrays (normalized; `den` is monic) |
| `original` | frozen `{ num, den }` after trimming, before normalization |
| `order` | deg den |
| `relativeDegree` | deg den − deg num (`Infinity` if num ≡ 0) |
| `isStrictlyProper` | `relativeDegree > 0` |

Results are cached per instance. Returned root arrays and objects are frozen.

## Poles, zeros, gain, stability

| Method | Returns |
|---|---|
| `poles()`, `zeros()` | `{re, im}[]`, frozen, in `polyRoots` order. `zeros()` is `[]` for a constant numerator |
| `poleGroups()`, `zeroGroups()` | `[{ value: {re, im}, multiplicity }]`, from `N.groupRoots(…, { coeffs })` |
| `dcGain()` | `num(0)/den(0)`. With a pole at the origin and num(0) ≠ 0, it is `±Infinity`: the sign of num(0) divided by the lowest nonzero den coefficient. It is `NaN` when num(0) = den(0) = 0 |
| `dcGainInfo()` | `{ value, kind: 'finito' \| 'infinito' \| 'indeterminado', limit, note }`. `note` is a Spanish explanation: G(0) = …; poles at the origin (integrator), giving an infinite gain and no settling; or a common factor s with the limit after simplifying. `limit` is the limit as s → 0 |
| `stability()` | `'estable' \| 'marginal' \| 'inestable'` (rule below) |
| `isStable()` | `stability() === 'estable'` |
| `stabilityInfo()` | `{ verdict, reason (Spanish), lhp, rhp, axis, axisRepeated, method, slowTau }`. The counts include multiplicity. `method` is `'routh'` or `'polos'`. `slowTau` is the time constant −1/Re p of the slowest mode when nothing lies on the axis or in the RHP (`Infinity` if that mode does not decay), otherwise `null` |

**Stability rule.**

1. **Routh–Hurwitz decides first**, from the coefficients of the denominator (the table of `routh()` with ε = 1e-6·min(1, min|aᵢ|)).
   - If the table has no special case, the verdict comes from the sign pattern of the first column alone: every entry positive gives `'estable'`, and each sign change is one RHP pole, giving `'inestable'`.
   - No tolerance relative to the largest pole is involved. 1e-10·s² + s + 1, s² + 10⁶s + 1, 10¹⁵s + 1, s + 1e-10 and s² + 2s + 1e-12 are all `'estable'`.
2. **Only a special case** (a zero row, or a zero first-column entry) triggers the per-pole analysis on `poleGroups()`.
   - A pole is on the jω axis when |Re p| ≤ 1e-9·max(1, |p|), with the tolerance taken per pole.
   - Re p beyond that tolerance and positive, or a **repeated** pole on the axis, gives `'inestable'`.
   - Simple poles on the axis with no RHP pole give `'marginal'`. This covers 1/s, 1/(s²+1) and 1/(s(s+1)).
3. **Slow-pole note.** For an `'estable'` verdict whose slowest mode has 6·τ > 10⁵ (the time-horizon cap), `reason` gets an extra sentence: «El modo más lento tiene τ ≈ … s: la respuesta tarda mucho en establecerse…». `stepInfo()` adds the note «Polo muy lento (τ ≈ … s)…».

## Routh–Hurwitz: `routh()`

Returns a frozen object:

```
{
  rows: number[][],          numeric table (any ε cell holds ε = epsilon)
  labels: string[],          TeX 's^{n}' … 's^{0}'
  firstColumn: number[],
  signChanges: number,       computed from limitSigns (signs as ε → 0⁺), skipping zeros
  limitSigns: (−1|0|1)[],
  special: Special | null,   the first special case
  specials: Special[],
  epsilon: number | null,    the ε used, when a zero-first-column case occurred
  axisRoots: number,         roots of the auxiliary polynomials on the jω axis
  tex: string[][],           TeX per cell: '2', '\varepsilon', '-\frac{2}{\varepsilon}', '3\,\varepsilon^{2}' …
  notes: string[]            Spanish: necessary condition, each special case, sign changes, conclusion
}
Special = { type: 'zero-first-column', row, power, epsilon }
        | { type: 'zero-row', row, power, auxiliary: number[], auxiliaryTex: 'A(s) = …' }
```

- **Zero tests.** An entry counts as zero when it is exactly 0, or when `|v| ≤ 1e-10 ×` its propagated rounding bound.
- **Zero first element, row not all zero.**
  - The ε method replaces the element with ε = 1e-6·min(1, min|aᵢ|).
  - The table is built three times, with ε, ε·1e-3 and ε·1e-6. Each cell's leading behaviour c·ε^k (for `tex`) and its sign as ε → 0⁺ are read from those three tables.
- **Zero row.**
  - The auxiliary polynomial A(s) is formed from the previous row, and the zero row is replaced by the coefficients of dA/ds.
  - The notes report how many roots of A(s) lie on the jω axis.

## Frequency response

| Method | Returns |
|---|---|
| `evalAt(s)` | complex G(s); `s` may be a number or `{re, im}` |
| `freqResponse(ω)` | complex G(jω) |
| `bodeRange()` | `{ wMin, wMax }` in whole decades (deviation 2). `{ 0.01, 100 }` when there are no nonzero roots |
| `bode(omegas?)` | `{ omega, mag, magDb, phaseDeg }`. By default, 300 log-spaced points over `bodeRange()` |

**Phase.**
- The phase is the sum of the continuous per-factor angles of (jω − r), in atan form. A factor on the axis contributes ±90° depending on the side of ω.
- It is anchored to the low-frequency asymptote: −90°·(poles at the origin − zeros at the origin), plus ±180° when the low-frequency gain is negative.
  - **Branch rule for a negative gain.** Of the two anchors +180° and −180°, the one whose curve has the smaller max|φ| over the default grid (`bodeRange()`, 300 points) is used. A tie keeps +180°.
  - The rule is decided once per instance, and an explicit `omegas` uses the same branch.
  - Examples: 1/(s − 2) runs from −180° to −90° (and not from +180° to +270°). −1/(s + 1) still runs from +180° to +90°, and (−s + 1)/(s + 1) from 0° to −180°.
- At each ω it is then snapped to the exact arg G(jω), modulo 360°.
- The result is continuous and anchored, except for genuine ±180° jumps at poles or zeros on the jω axis.

If num ≡ 0, then `mag = 0`, `magDb = −Infinity` and `phaseDeg = NaN`.

## Partial fractions and analytic responses

| Method | Returns |
|---|---|
| `partialFractionsStep()` | Expansion of Y(s) = G(s)/s (the step's 1/s is merged into the pole groups). Returns `Entry[]`, frozen |
| `partialFractionsImpulse()` | Expansion of the strictly proper part of G(s). `[]` when that part is 0 |
| `DSL.core.tf.partialFractions(num, den)` | The same for any strictly proper num/den (throws otherwise) |

`Entry = { pole: {re, im}, multiplicity, power, residue: {re, im} }` stands for `residue/(s − pole)^power`, for power = 1…multiplicity.
- Entries follow the grouped pole order, then ascending `power`.
- Residues of real poles are exactly real, and residues of conjugate poles are exactly conjugate.
- A real or imaginary part with |part| ≤ 1e-12·|r| is set to exactly 0. For example, the residues of Y(s) = (s² + 2s + 3)/(s(s² + s + 1)) have `im === 0`.

**Method.**
- Residues are computed by Taylor series: `taylorC` of N at p, divided by Q(h) = lead·Π(p − p_k + h)^{m_k}.
- They are validated by reconstruction at 5 complex sample points, with `|Σ − Y| ≤ 1e-8·(|Y| + 1e-4·Σ|terms|)`, and by checking y(0⁺) = lim s·Y(s).

| Method | Returns |
|---|---|
| `stepAnalytic({ digits } = {})` | `{ exact, fn(t), terms: Term[], tex, notes: string[], residues: Entry[], digits }`. `tex` is written with `digits` significant figures (default `stepDisplayDigits()`); `fn` and `terms` are always exact |
| `impulseAnalytic({ digits } = {})` | the same for g(t), the impulse response without D·δ(t), with its own default number of figures |
| `stepDisplayDigits()` | the number of significant figures the step TeX needs (rule below) |

**`stepDisplayDigits()`.** It returns the smallest d ∈ {4, 6, 8, 10, 12} that meets three conditions:

1. The y(t) **rebuilt from the printed numbers** (poles, σ, ω, coefficients rounded to d figures exactly as `latex.num` writes them) matches the exact response at 200 points of [0, `timeHorizon()`], within 1e-3·max|y|.
2. The printed sum of fractions matches Y(s) at complex sample points, within 1e-3 relative.
3. **Distinct poles are printed distinctly.**

If no candidate qualifies, the result is 12.

- Typical responses keep 4 figures.
- Nearly coincident poles need more. 1/(s² + 2.0001s + 1.0001) uses 6: `y(t) = 0.9999 + 9999\,e^{-1.0001t} - 10000\,e^{-t}`. Those printed numbers give y(1) = 0.2642, whereas with 4 figures the large residues cancel wrongly.
- When two poles are within 1e-3 relative of each other, a note says so («Los polos … están muy próximos: los residuos son grandes y casi se cancelan; se muestran con más cifras (6 significativas).»).

- **TeX.** `stepAnalytic().tex` looks like `'y(t) = 1 - e^{-t}\left(\cos(1.732t) + 0.5774\,\sin(1.732t)\right),\; t \ge 0'`. `impulseAnalytic()` uses `'g(t) = …,\; t > 0'`.
- **Spanish notes:** one per multiple pole (the form c·tᵏ·e^(p·t)/k!), the real form of complex pairs (e^(σt)·(A·cos ωt + B·sen ωt)) and, for the impulse response when G is biproper, the omitted D·δ(t) term with its value. Notes are plain text, never TeX (integrator, at tfengine's request); a number and `%` are joined by a non-breaking space.
- **When validation fails:** `exact = false` and `tex = ''`. `fn` becomes the numerical fallback, and a note says so; the UI must show that note. In all 42 cross-check cases and all unit families, `exact` is `true`.
- **`fn(t)`** is 0 for t < 0.

A `Term` is one of two shapes. Each has a `tex` string (`''` for a negligible term), and they appear with the origin (steady-state) term first:
- `{ kind: 'real', p, k, c, tex }` contributes `c·t^{k−1}/(k−1)!·e^{pt}`.
- `{ kind: 'osc', sigma, omega, k, A, B, tex }` contributes `t^{k−1}/(k−1)!·e^{σt}(A cos ωt + B sin ωt)`, with ω > 0. This is the real form e^{σt}(A cos + B sin) of a conjugate pair.

**TeX number formatting.**
- Numbers go through `DSL.core.latex.num(x, digits)`, with `digits` from `stepDisplayDigits()` (usually 4).
- A pole or σ that is exactly 0 is written as 0, so it produces no e^{0t} factor. When the stability analysis found poles on the jω axis, a pole with |Re p| ≤ 1e-9·max(1, |p|) is also written as 0. With a Routh «estable» verdict, a slow pole such as −1e-10 keeps its exponent.
- Terms below 1e-10 of the largest are dropped.
- Unit coefficients and exponents are omitted.

## Sampled responses

| Method | Returns |
|---|---|
| `step(tArray)` | `number[]`: the analytic `fn` when `exact`, otherwise `stepNumeric` |
| `impulse(tArray)` | `number[]`, likewise; D·δ(t) is omitted |
| `stepNumeric(tArray)`, `impulseNumeric(tArray)` | RK4 on the controllable canonical realisation |
| `stepSamples(n = 400, tEnd = timeHorizon())` | `{ t, y }` on `linspace(0, tEnd, n)`. Values with \|y\| < 1e-12·max\|y\| are set to exactly 0, so y(0) = 0 prints as 0, not 1e-17 |
| `impulseSamples(n = 400, tEnd = timeHorizon())` | `{ t, y }`, with the same flush to 0 |
| `timeHorizon({ factor = 6 } = {})` | seconds, using the rules below |

**Numerical fallback.**
- RK4 runs with dt = min(tMax/4000, 0.1/max|p|), and never more than 2·10⁶ steps. It lands exactly on each requested time; negative times give 0.
- Analytic and numerical responses agree to ≤ 2e-7 (unit tests).

**`timeHorizon` rules.** The horizon is the maximum over modes. tol = 1e-9·max(1, |p|) is the per-pole axis tolerance, and m is the multiplicity.

| Mode | Contribution |
|---|---|
| Decaying mode: Re p < 0 with an «estable» verdict (any \|Re p\|), otherwise Re p < −tol | `factor·(1 + 0.5·(m − 1))/|Re p|` |
| Oscillatory mode on the axis (marginal) | 3 periods, 6π/ω |
| Unstable modes (σmax = largest Re p) | `T = min(max(T, 6/σmax, min(3 periods, 12/σmax)), 12/σmax)` |

- With nothing else, the horizon is 10 s.
- The result is clamped to [1e-3, 1e5].

## Step metrics: `stepInfo({ settle = 0.02, rise = [0.1, 0.9], tEnd, n = 4000 } = {})`

```
{ stable, finalValue, limitValue, peak, peakTime, overshootPct, undershootPct, riseTime,
  riseTimes: { t10, t90 } | null, settlingTime, settleBand: [lo, hi] | null,
  tEnd, exact, notes: string[] }
```

The call without options is memoised per instance, and every call returns a fresh copy.

**Unstable or marginal systems.**
- Every metric is `null` and `stable = false`.
- The notes explain why: unbounded growth, a ramp (integrator), or an undamped oscillation (a pole pair on the axis).
- **A zero that cancels the pole at the origin** (num(0) = den(0) = 0, `dcGainInfo().kind === 'indeterminado'` with a finite limit, no axis pair) is handled differently:
  - The output does converge. `limitValue` is that limit, for example 1 for s/(s² + s) and 0 for s²/(s(s + 1)²).
  - The note reads «Un cero cancela el polo en el origen: la salida converge a <límite>. Como la cancelación no se aplica automáticamente, el sistema figura como marginalmente estable y no se informan valor final ni métricas de establecimiento.»
  - There is no «oscila» or «rampa» sentence. `finalValue` stays `null`.
- In every other case `limitValue` is `null`.

**Stable systems.**

- `finalValue = dcGain()`.
- **Sampling.**
  - The response is sampled with the analytic `fn` over [0, tEnd], at max(`n`, 20 samples per period of the fastest oscillation) points, capped at 200001.
  - When `tEnd` is not given, the window doubles (up to 4 times) while the response is still outside the band at the edge, or still above the final value and rising there. `tEnd` in the result is the window actually used.
- **Dense grid near the start.** With oscillatory poles, [0, min(tEnd, 4 periods)] is resampled at ≥ 50 points per period. The first peak and the 10 % and 90 % crossings are searched there. For example, 1/(s² + 10⁻⁶s + 1) gives tp = π, tr = 1.020 and Mp ≥ 99.9 %.
- **Aliased window** (even 200001 samples give fewer than 20 per period):
  - The oscillation is not sampled over the whole window. The base grid of `n` points is used, and the settling time is taken from the envelope E(t) ≥ |y − y∞| (the sum of |coefficient|·t^{k−1}/(k−1)!·e^{Re p·t}), which is an upper bound.
  - Peaks are searched only on the dense grid. A note says so.
- **`settleBand` and `settlingTime`.**
  - The band is ±`settle`·|yf|. If yf = 0, it is taken relative to max|y|.
  - The settling time is the last exit from the band, refined by bisection.
  - With oscillatory poles, a peak between two samples can leave the band even though no sample does. A sample loses at most a factor cos(πh/T), so samples above that reduced band are checked from the end and their maximum is refined by golden section. With ζ = 5e-4 this gives ts = 7822.6 s, the true last exit; plain sampling gave about 3 periods less.
  - It is `null` (with a note) if the response never enters the band within the window.
- **Pure second order.** The measured tp, Mp and tr must match the exact values within 5 %. If one does not, it is discarded (`null`) with a note («Medición descartada …»).
- **Slow pole.** When the slowest mode has 6τ > 10⁵ (the horizon cap), the note «Polo muy lento (τ ≈ … s): la respuesta tarda mucho en establecerse.» is added.
- **`peakTime`, `peak` and `overshootPct`.**
  - The extremum is found as a root of the analytic impulse response, by bisection. Golden-section search is the fallback.
  - `peak` and `peakTime` are `null` when there is no overshoot, and `overshootPct` is then 0. The `null` cases are listed in deviation 3.
- **`undershootPct`** (non-minimum phase) is the depth of the initial opposite-sign swing, in % of yf. It is computed only when y(0⁺)/yf < `rise[0]`, and is otherwise `null`.
- **`riseTime`** is `t90 − t10`, with both crossings refined by bisection. It is `null` (with a note) when y(0⁺) is already ≥ 10 % because of feed-through.
- **Notes (Spanish)** cover:
  - RHP zeros (non-minimum phase);
  - a numerical fallback;
  - no overshoot;
  - a jump at t = 0⁺;
  - a final value of 0;
  - a window that is too short;
  - the sampling used.

**Verified accuracy.**
- Overshoot and peak time match the canonical second-order formulas to ≤ 1e-7. This holds for ζ ∈ {0.1, 0.3, 0.5, 0.7, 0.9} × ωn ∈ {0.5, 2, 10}.
- For first order, tr = τ·ln 9 and ts = τ·ln 50, to 1e-9.

## Canonical parameters

**`firstOrderParams()`** gives `{ K, tau, pole }`. It applies only to K/(τs + 1) with τ > 0, and is otherwise `null`.

**`secondOrderParams()`** gives `{ K, wn, zeta, wd, sigma, damping, canonical }`.
- **Scope:** only `b0/(s² + a1 s + a0)` with a0 > 0; otherwise `null`.
- `sigma` is ζωn.
- `damping` takes one of these values:

| Condition | `damping` |
|---|---|
| ζ < −1e-12 | `'inestable'` |
| \|ζ\| ≤ 1e-12 | `'no amortiguado'` |
| `poleGroups()` has a single (double) real pole | `'críticamente amortiguado'` |
| a complex pair | `'subamortiguado'` |
| two distinct real poles | `'sobreamortiguado'` |

- The classification follows the root grouping, so it agrees with the multiplicities used by the partial fractions and y(t). For example, s² + 2.0001s + 1.0001 has two distinct real poles −1 and −1.0001. It is `'sobreamortiguado'`, not critical, even though ζ = 0.99999998.
- `wd = ωn√(1 − ζ²)` when |ζ| < 1 and the system is neither critical nor overdamped; otherwise `null`.
- `canonical` is set only for `'subamortiguado'`; otherwise it is `null`:
  - `overshootPct: 100·e^{−ζπ/√(1−ζ²)}`;
  - `peakTime: π/ωd`;
  - `settlingTime: 4/(ζωn)`;
  - `settlingApprox: true`;
  - `riseTime0to100: (π − acos ζ)/ωd`.

## TeX and composition

| Method | Returns |
|---|---|
| `toTex({ digits = 4, variable = 's', lhs = null, normalized = true })` | `'\frac{4}{s^{2} + 2 s + 4}'`, prefixed with `lhs + ' = '` when `lhs` is given. `normalized: false` uses `original` |
| `toTexFactored({ digits = 4, variable = 's', lhs = null })` | `(2s + 6)/((s + 1)²(s² + 2s + 5))` gives `'\frac{2\, \left(s + 3\right)}{\left(s + 1\right)^{2} \left(s^{2} + 2 s + 5\right)}'`.<br>Factors follow the `poleGroups()` and `zeroGroups()` order. Conjugate pairs become quadratic factors, a root at the origin becomes `s`, and multiplicities become exponents. The gain is omitted when it is 1, and written as `-` when it is −1 |
| `series(other)` | `new TransferFunction(num·num', den·den')`, with no cancellation |

## Static constructors and text input

| Signature | Notes |
|---|---|
| `TransferFunction.fromFirstOrder(K, tau)` | K/(τs + 1) |
| `TransferFunction.fromSecondOrder(K, zeta, wn)` | Kωn²/(s² + 2ζωn s + ωn²). Throws `Error` if ωn ≤ 0 |
| `TransferFunction.parseCoeffs(str, field?)` | `number[]`; throws `TFInputError` |
| `TransferFunction.fromCoeffStrings(numStr, denStr, { maxDenDegree = 4 } = {})` | `TransferFunction`; throws `TFInputError` |

**Text format** (`parseCoeffs`):
- Leading and trailing spaces, including non-breaking spaces, are ignored, as is one pair of `[ ]` or `( )`.
- Coefficients are separated by spaces or `;`.
- A trailing comma after a token is a separator: `"1, 2, 3"` → `[1, 2, 3]`. A lone `,` token is also a separator.
- Each token goes through `DSL.util.parseNumber`, so `,` and `.` both work as the decimal mark: `"1,5 −2 3e-1"` → `[1.5, −2, 0.3]`.

**`parseCoeffs` errors**, all Spanish:

| `code` | Cause | Message |
|---|---|---|
| `empty` | nothing to read | «Escriba los coeficientes del denominador separados por espacios, en potencias descendentes de s; por ejemplo: 1 2 5.» |
| `token` | the token contains a comma (for example `"1,2,3"`) | «… no es un coeficiente válido. Separe los coeficientes con espacios; la coma o el punto marcan los decimales.» |
| `token` | any other token that is not a number | «… no es un número. …» |
| `nonfinite` | the value overflows | — |

**`fromCoeffStrings` order of checks** (each sets `field`):
1. parse num, then den;
2. all-zero num → `num-zero`;
3. all-zero den → `den-zero`;
4. leading 0 in num or den (with more than one coefficient) → `leading-zero`;
5. den of degree < 1 → `den-degree`;
6. den of degree > `maxDenDegree` → `den-degree`, with a message naming the limit;
7. deg num > deg den → `improper`.

## Contraste con SciPy

**Command:**

```
timeout 900 uv run --with numpy --with scipy python tests/crosscheck/run.py    (npm run crosscheck)
```

**How it runs.**
- `tests/crosscheck/dump.mjs` loads the JS engine through `tests/helpers/load.mjs`.
- It evaluates the fixed cases in `tests/crosscheck/cases.json`: 42 transfer functions, 9 polynomials, the integrator runs, and 3 energy balances of `DSL.systems.simulate`. The JSON goes to `test-results/math/crosscheck-js.json`.
- `run.py` computes independent references and prints a ratio table, where error/tolerance ≤ 1 passes.
- Exit codes: 1 on any mismatch, 2 if the dump fails.

**Transfer-function cases.** They include:
- first and second order (canonical ζ = 0.1–0.7);
- critical damping, triple and quadruple poles, a double complex pair, double + simple;
- LHP, RHP and origin zeros, and zeros on the jω axis;
- integrators, undamped, marginal + stable, real and oscillatory unstable, a double integrator;
- biproper systems, a stiff system (poles 0.01 and 100), an extremely stiff one (1e-10·s² + s + 1, tag `stiff`), a pole almost at the origin (s + 1e-10), nearly double real poles (s² + 2.0001s + 1.0001), a nearly repeated complex pair;
- a RHP pole with negative low-frequency gain, 1/(s − 2) (Bode branch);
- the three Routh special cases, and non-normalized or negative leading coefficients.

**Tolerances** (the `TOL` table in `run.py`). S is the pole scale max(1, max|p|).

| Check | Reference | Tolerance |
|---|---|---|
| Normalization | G(s) at 2 complex points | 1e-13 relative; `den[0] = 1` |
| Simple poles and zeros | `np.roots`, optimal matching (`linear_sum_assignment`) | 1e-9·S |
| m-fold poles | `np.roots` | 50·EPS^{1/m}·S, which is NumPy's own accuracy limit |
| Pole group centres | cluster mean of `np.roots` | 1e-9·S (at least 1e3·EPS·max\|p\|) |
| Backward error of the poles | Π(s − p) vs den | 1e-8 relative to Π(s + \|p\|) |
| DC gain | exact formula with the ±∞ / NaN conventions | 1e-12 relative |
| Stability | expected value and an independent rule: Routh first column in exact arithmetic (`Fraction`, a cell is 0 when its subtraction cancels to 1e-10); only a special case falls back to `np.roots` per pole (\|Re p\| ≤ max(1e-9·max(1, \|p\|), 50·EPS^{1/m}·S)) | exact match |
| Routh sign changes | number of RHP poles from `np.roots` | exact match |
| Step and impulse | `scipy.signal.step` / `impulse` on the same grid. For `stiff` cases, the residue sum of `scipy.signal.residue` instead (SciPy's realisation loses about 2e-7 there; mpmath confirms the JS values to 1e-16) | 1e-8·max\|y_ref\| + 1e-12 |
| Bode \|G\| | `scipy.signal.bode` | 1e-7 dB |
| Bode phase (mod 360°) | `scipy.signal.bode` | 1e-6° |
| Bode phase continuity (no jω-axis roots) | offset to SciPy constant | 1e-6° |
| Bode low-frequency anchor | −90°·(poles − zeros at 0), ±180° for a negative gain: the branch with the smaller max\|φ\| (tie: +180°), on the SciPy curve or on the JS curve when roots lie on the jω axis | 15° |
| Partial-fraction reconstruction | Y(s) at 5 complex points | 1e-9·(\|Y\| + 1e-3·Σ\|terms\|) |
| Residues (distinct, well-separated poles) | `scipy.signal.residue` | 1e-7·max(1, \|r\|) |
| `overshootPct` / `undershootPct` | 200 001-point SciPy step | 1e-5 percentage points |
| `peakTime`, t10, t90, `settlingTime` | the same grid | 2 grid steps |
| Canonical formulas (ζ, ωn, Mp, tp) | closed form | 1e-14 for ζ and ωn; 1e-7 otherwise |
| Polynomial roots | `np.roots` | as for poles, plus exact conjugate pairs |
| `euler`, `heun`, `rk4` runs | independent Python implementation of the same method on the same grid | 1e-9 at t1 |
| `rk45` (rtol 1e-9, atol 1e-12) | `solve_ivp` DOP853 at rtol 1e-13 | ≤ max(10 × SciPy RK45's error at the same rtol/atol, 1e-8) |
| Orders of convergence | log₂ of the error ratio for dt and dt/2 | \|p − p_theory\| ≤ 0.25 |
| Energy balances (mass-spring b = 3 with RK4 at Δt = 0.2, RLC R = 90 Ω with RK4 at Δt = 1.6 ms, a mass-spring pulse) | `solve_ivp` DOP853 (rtol 1e-12) of the augmented system [x, ∫P_dis, ∫P_ent] | E₁, ∫P_dis and ∫P_ent within 1e-3 × max(E, ∫P_dis, ∫P_ent), and the JS balance holds |

Every case also requires `exact = true`: the analytic y(t) must be used, never the numerical fallback.

**Last run** (2026-10-17): 62 of 62 comparisons pass, exit 0.
- Worst ratios: poles 3.8e-2 (quadruple pole), step 1.5e-3, Bode |G| about 3e-14 dB, phase about 1e-13°, partial fractions 1.2e-4, metrics 0.24.
- Energy balances: ratios 0.24, 0.64 and 2.6e-3. The JS residuals are 1.3e-4, 9.8e-5 and 2.9e-6 relative.
- Integrators: euler, heun and rk4 match the independent implementation to ≤ 1.2e-15. rk45 reaches 3.0e-9, against SciPy RK45's 3.0e-9. The observed orders are 1.05, 1.99 and 3.96.

# API: `js/core/numeric.js` → `DSL.core.numeric` (owner: math)

Complex numbers, real polynomials, polynomial roots (with grouping of multiple roots), ODE integrators and small numeric utilities.

- Everything is pure and deterministic: there is no DOM access and no randomness.
- It loads after `js/core/ns.js` and uses `DSL.util.formatNumber` only to build messages and strings.
- Tests: `tests/unit/numeric.test.mjs`. Cross-check against NumPy/SciPy: `tests/crosscheck/run.py`, described in [`tf.md`](tf.md#contraste-con-scipy).

Related docs: [`tf.md`](tf.md) (`DSL.core.tf`) and [`latex.md`](latex.md) (`DSL.core.latex`). Together the three files replace the single `docs/api/math.md` named in `docs/ARCHITECTURE.md` §2.

## Deviations from `docs/ARCHITECTURE.md` §8.1

1. **`rk45` with `tEval` uses Dormand–Prince's own continuous extension** (Shampine's 4th-order interpolant), not cubic Hermite.
   - Between accepted steps the interpolation error is at the level of the step error.
   - Cubic Hermite added about h⁴/384·|x⁗|: 1.2e-7 on the cross-check pendulum, against 3.0e-9 now. SciPy RK45 gives 3e-9 there.
   - The fixed-step methods still use cubic Hermite.
2. **`polyRoots` re-centres clusters of a multiple root.**
   - Aberth stops each member of a cluster at the noise level, so the cluster centroid is only accurate to about u^{1/m}.
   - Each cluster that `groupRoots` validates is therefore shifted rigidly, so that its centroid equals the multiple root refined by Newton on p^{(m−1)}.
   - The spread is kept: the members are **not** collapsed into one fake exact value, as §8.1 requires.
3. **`polyRoots` snaps nearly imaginary roots.** When `|re| ≤ 1e-12·|im|`, `re = 0` exactly, so a root such as ±2j lands exactly on the jω axis.
4. **Additions** (not in the contract):
   - `EPS`, `cx.inv`, `poly.taylorC`, `sortRoots`, `groupRoots`, `FEVALS`;
   - `integrate` stops cleanly with `success: false` when the state stops being finite, or when `rk45` needs a step below `dtMin`.

## Conventions

- **Polynomials** are arrays of real coefficients in **descending powers**, so `[1, 2, 5]` is s² + 2s + 5.
- **Complex numbers** are plain objects `{ re, im }`. Every complex function also accepts a JS number, read as a real value.
- **Imaginary unit:** **j**, in `cx.toString`.

## Complex numbers: `N.C`, `N.cx`

| Signature | Returns / notes |
|---|---|
| `N.C(re, im = 0)` | `{ re, im }` |
| `cx.add(a, b)`, `sub`, `mul` | complex |
| `cx.div(a, b)` | complex, using Smith's algorithm (no overflow for large \|b\|) |
| `cx.inv(a)` | 1/a |
| `cx.scale(a, k)`, `neg(a)`, `conj(a)` | complex |
| `cx.abs(a)` | `Math.hypot(re, im)` |
| `cx.arg(a)` | radians in (−π, π]; −π is returned as π |
| `cx.exp(a)` | complex; the result is exactly real for a real argument |
| `cx.sqrt(a)` | principal root, honouring the sign of `−0` in the imaginary part |
| `cx.pow(a, n)` | integer power by squaring; `n` is rounded, and negative `n` goes through `inv` |
| `cx.fromPolar(r, θ)` | complex |
| `cx.isReal(a, eps = 1e-9)` | `\|im\| ≤ eps·max(1, \|re\|)` |
| `cx.equals(a, b, eps = 1e-9)` | `\|a − b\| ≤ eps·max(1, \|a\|, \|b\|)` |
| `cx.toString(a, digits = 4)` | `'-1 + 2j'`, `'3'`, `'-j'`, `'0.5 - 1.5j'`, with an ASCII minus |

## Polynomials: `N.poly`

| Signature | Returns / notes |
|---|---|
| `trim(p, eps = 0)` | Drops leading coefficients with `\|c\| ≤ eps·max\|c\|`. The zero polynomial, or an empty or missing `p`, gives `[0]` |
| `degree(p)` | `trim(p).length − 1`; **−1** for the zero polynomial |
| `isZero(p)` | `true` when every coefficient is exactly 0, or for an empty or missing `p` |
| `eval(p, x)` | real Horner |
| `evalC(p, z)` | complex Horner |
| `add(p, q)`, `sub(p, q)` | aligned on the constant term |
| `mul(p, q)`, `scale(p, k)` | coefficient array |
| `deriv(p)` | coefficient array; `[0]` for a constant |
| `divmod(p, q)` | `{ q, r }`. Remainder coefficients at or below 64·EPS·scale are set to 0, and the remainder is trimmed. Throws (Spanish) on a zero divisor |
| `fromRoots(roots)` | Real monic coefficients of Π(s − rᵢ). Complex roots must come in conjugate pairs; residual imaginary noise is dropped |
| `taylorC(p, z, m)` | `[{re, im}]` of length `m`: the Taylor coefficients `c_j = p^{(j)}(z)/j!`, computed by repeated synthetic division. `tf` uses it for partial fractions |

## Roots: `N.polyRoots(coeffs, { tol = 1e-12, maxIter = 500 })`

Returns a complex array whose length equals the degree after exact trimming (`trim(p, 0)`).

**Errors.** It throws, with a Spanish message, when:
- `coeffs` is not an array-like;
- any coefficient is not a finite number;
- the polynomial is zero.

A constant polynomial gives `[]`.

**Steps.**
1. **Leading zero coefficients** are trimmed exactly.
2. **Trailing zero coefficients** produce exact roots `{re: 0, im: 0}`, one per zero.
3. **Degrees 1 and 2** are solved in closed form; the quadratic uses the stable formula.
4. **Degree ≥ 3: Aberth–Ehrlich**, Gauss–Seidel sweep.
   - Starting points come from the Newton polygon (Bini 1996, σ = 0.7). They are deterministic.
   - When |z| > 1, p/p′ is evaluated through the reciprocal polynomial.
   - A root stops when `|p(z)| ≤ 2n·EPS·Σ|aₖ||z|^k` (Horner backward error) or when its step is `≤ tol·|z|`.
   - Then up to 4 Newton polishing steps run on the original polynomial. A step is accepted only if it lowers the relative residual.
5. **Cleanup.**
   - When `|im| ≤ 1e-9·max(1, |z|)`, the root becomes exactly real.
   - Conjugate pairs are matched greedily by distance and made **exactly** conjugate (the real parts are averaged).
   - When `|re| ≤ 1e-12·|im|`, `re = 0`.
   - `−0` becomes `0`.
6. **Multiple roots** (degree ≥ 3) are re-centred; see deviation 2.
7. **Order.** Real part ascending. Real parts within `1e-9·max(1, max|z|)` count as tied and are ordered by imaginary part ascending. A conjugate pair is therefore adjacent, with the negative imaginary part first.

**Verified accuracy.** `tests/crosscheck` compares against `np.roots`: Wilkinson 8, multiple roots, roots of unity, magnitudes over 6 decades, leading and trailing zeros.
- Simple roots: within `1e-9·scale`.
- An m-fold root: within `50·EPS^{1/m}·scale`.
- The backward error of Π(s − r) is ≤ 1e-8 relative to Π(s + |r|).

## `N.sortRoots(roots)`

A copy, sorted with the same order as `polyRoots`. Accepts numbers or `{re, im}`.

## `N.groupRoots(roots, { coeffs } | { tau = 1e-6 })`

Groups nearly coincident roots into multiple roots. Returns `[{ value: {re, im}, multiplicity, members: {re, im}[] }]`, sorted like `polyRoots`.

- **Without `coeffs`:** single-linkage clustering with `|a − b| ≤ tau·max(|a|, |b|) + 1e-14·S`, where S = max|r|.
- **With `coeffs`** (the polynomial the roots came from), which is the mode `tf` uses:
  - The tolerances tried are 1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 1e-6 and 1e-7, in that order.
  - At each one, every group centre is refined by Newton on p^{(m−1)}. A refinement that moves by more than 4× the cluster spread is rejected.
  - The grouping is accepted only if expanding the centres rebuilds `coeffs` (made monic): `|Δcₖ| ≤ 1e-9·Eₖ + 1e-14·max E`, with E = Π(s + |r|).
  - The widest tolerance that passes wins. If none passes, every root is its own group.
- **Conjugate symmetry:** groups of equal multiplicity are made exactly conjugate.

## Integrators: `N.integrate(f, x0, t0, t1, opts) → { t, x, stats }`

```
f(t, x: number[]) → number[]                           dx/dt (the returned array may be f's own buffer)
opts.method   'euler' | 'heun' | 'rk4' | 'rk45'        default 'rk4'
opts.dt       fixed step (required for euler/heun/rk4); initial step for rk45 (default (t1 − t0)/100)
opts.rtol     1e-6 (rk45)      opts.atol 1e-9 (rk45)
opts.dtMin    1e-12·max(1, t1 − t0) (rk45)   opts.dtMax t1 − t0 (rk45)
opts.maxSteps 100000 (accepted steps)
opts.tEval    optional times, non-decreasing, inside [t0, t1] (1e-12 relative slack): output only there
stats = { method, steps, rejected, fevals, success: boolean, message: string (Spanish) }
```

**Errors.** It throws (Spanish message) on:
- an unknown method;
- non-finite `t0` or `t1`;
- `t1 < t0`;
- a missing or non-positive `dt` for a fixed-step method;
- a `tEval` that is not ascending or lies outside [t0, t1].

**Output.**
- Without `tEval`: `t[0] = t0`, then one entry per accepted step, the last one exactly `t1`.
- With `tEval`:
  - only those times are returned, and `t` is a copy of `tEval`;
  - points at or before `t0` take `x0`;
  - points that coincide with the end of a step take that step's state.
- `t0 === t1` returns `x0` only, repeated for each `tEval` point.

**Fixed-step methods** (`euler`, `heun`, `rk4`).
- They take `max(1, ceil((t1 − t0)/dt − 1e-9))` steps on the grid `t0 + k·dt`. The last step is shortened so it lands exactly on `t1`.
- `tEval` points between steps use cubic Hermite with f evaluated at both ends. Those evaluations are counted in `stats.fevals`.

**`rk45`** is Dormand–Prince 5(4) with FSAL.
- The error norm is RMS over components of `e/(atol + rtol·max(|x|, |x_new|))`.
- A step is accepted when the norm is ≤ 1. The step factor is `0.9·err^{−1/5}`, clamped to [0.2, 5].
- Rejected steps only shrink, with the factor bounded below by 0.2.
- `tEval` points use the DP continuous extension (see deviation 1).

**Partial results** (nothing is thrown). `success` is `false`, and the `message` says where and why, in these cases:
- `maxSteps` is reached;
- the state becomes non-finite (fixed-step methods);
- the step falls below `dtMin`;
- more than `4·maxSteps + 100` attempts are made (`rk45`).

The steps up to that point are returned.

**Verified accuracy** (unit tests and cross-check):
- Observed orders of convergence: 1.05 (euler), 1.99 (heun) and 3.96 (rk4).
- The fixed-step runs match an independent Python implementation of the same method to ≤ 1e-9.
- `rk45` with rtol 1e-9 reaches 3.0e-9 on the damped nonlinear pendulum, the same as SciPy RK45 with the same tolerances.

### Single steps

These return the new state. When `out` is given they write into it, so `out === x` is allowed. A shared work buffer avoids allocations in frame loops, and it is re-entrant-safe.

```
N.eulerStep(f, t, x, dt, out?)
N.heunStep(f, t, x, dt, out?)
N.rk4Step(f, t, x, dt, out?)
N.steppers        { euler, heun, rk4 }  (the same functions)
N.FEVALS          { euler: 1, heun: 2, rk4: 4 }  f evaluations per step
```

## Utilities

| Signature | Notes |
|---|---|
| `N.EPS` | 2.220446049250313e-16 |
| `N.linspace(a, b, n)` | Includes both ends; the last value is exactly `b`. `n ≤ 0` gives `[]`; `n = 1` gives `[a]` |
| `N.logspace(d0, d1, n)` | `10^linspace(d0, d1, n)` |
| `N.unwrap(radians[])` | Removes jumps larger than π by adding multiples of 2π. Non-finite differences are skipped |
| `N.interp1(xs, ys, xq)` | Linear interpolation, clamped to the end values. `xq` may be a number or an array; `NaN` if `xs` is empty |
| `N.rmse(a, b)` | Over the common length; `NaN` if that length is 0 |
| `N.maxAbs(a)` | max \|aᵢ\|; 0 for `[]` |
| `N.nearlyEqual(a, b, rtol = 1e-9, atol = 1e-12)` | `\|a − b\| ≤ max(atol, rtol·max(\|a\|, \|b\|))` |
| `N.factorial(n)` | Cached. `NaN` for n < 0; `Infinity` for n > 170; `n` is rounded |

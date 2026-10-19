# API: math (index)

ARCHITECTURE §2 and §8 name a single `docs/api/math.md`. The math key documented its three files
separately, so this page is only the index (added by the integrator at math's request).

| File | Namespace | Reference |
|---|---|---|
| `js/core/numeric.js` | `DSL.core.numeric`: complex numbers, polynomials, `polyRoots`, `integrate` (euler, heun, rk4, rk45), single steppers, utilities | [numeric.md](numeric.md) |
| `js/core/tf.js` | `DSL.core.tf`: `TransferFunction`, `TFInputError`, `partialFractions` | [tf.md](tf.md) (includes the SciPy tolerance table) |
| `js/core/latex.js` | `DSL.core.latex`: TeX helpers and KaTeX rendering with a plain-text fallback | [latex.md](latex.md) |

Tests: `tests/unit/numeric.test.mjs`, `tests/unit/tf.test.mjs`, `tests/unit/latex.test.mjs` and the SciPy
cross-check `tests/crosscheck/run.py` (`npm run crosscheck`).

## Integration notes

- `stepAnalytic().notes` and `stepInfo().notes` are **plain text** (no TeX). Exponents are written
  `e^(σt)` / `e^(p·t)`; `#transferencia` shows `^(…)` as a superscript. Number and `%` are joined by a
  non-breaking space.

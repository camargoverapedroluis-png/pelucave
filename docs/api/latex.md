# API: `js/core/latex.js` → `DSL.core.latex` (owner: math)

This module generates TeX for numbers, complex numbers, polynomials and fractions, and renders it with KaTeX. When KaTeX is absent it falls back to plain text.

- It loads after `numeric.js` and `tf.js`. `tf.js` calls it lazily, so the load order does not matter for TeX generation.
- It uses `DSL.util.formatNumber` and `DSL.util.escapeHtml`.
- Tests: `tests/unit/latex.test.mjs`, with a fake KaTeX and with no KaTeX at all.

## Deviations from `docs/ARCHITECTURE.md` §8.3

These are additions only:

- `complexPair()` and `text()`;
- `num(NaN)` returns `'\text{indefinido}'`, and `num(-Infinity)` returns `'-\infty'`;
- `renderInto()` also renders the container itself when it carries `data-tex`, and re-renders when the TeX, the display mode or the engine changes.

## Generating TeX

All numbers use a decimal point, an ASCII minus, 4 significant digits by default and `DSL.util.formatNumber`'s scientific range.

| Signature | Returns / notes |
|---|---|
| `num(x, digits = 4)` | Examples:<br>`'1.5'`, `'-2'`, `'0.001234'`<br>`'1.2 \times 10^{-5}'`; a mantissa of 1 is written as just `'10^{-5}'`<br>`'\infty'`, `'-\infty'`, `'\text{indefinido}'` (NaN) |
| `complex(z, digits = 4)` | `'-1 + 2j'`, `'3'`, `'j'`, `'-j'`, `'0.5 - 1.5j'`. A scientific magnitude gets `'\,'` before j. `z` may be a number |
| `complexPair(z, digits = 4)` | `'-1 \pm 2j'`, `'\pm 2j'` (σ = 0). A real `z` gives `num(re)` |
| `poly(coeffs, variable = 's', { digits = 4 } = {})` | Descending powers: `'s^{2} + 0.5 s - 3'`, `'-s^{3} + 2'`. Zero and NaN terms are omitted, unit coefficients are hidden, and signs are kept. A scientific coefficient is followed by `'\, '` (`'1.2 \times 10^{-5}\, s'`). `'0'` when every term is zero |
| `frac(numTex, denTex)` | `'\frac{numTex}{denTex}'` |
| `text(s)` | `'\text{…}'`, with ``\ { } $ & # % _ ^ ~`` escaped |

## Rendering

**KaTeX options:** `{ displayMode, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }`.

| Signature | Returns / notes |
|---|---|
| `available()` | `true` when `window.katex.render` exists |
| `render(el, tex, { display = false } = {})` | `true` when KaTeX rendered and removed the `tex-fallback` class.<br>Without KaTeX, or if KaTeX throws, it sets `el.textContent = tex`, adds the class `tex-fallback` and returns `false`.<br>A missing `el` gives `false` |
| `toHtml(tex, { display = false } = {})` | KaTeX `renderToString` output. The fallback is `'<code class="tex-fallback">…escaped tex…</code>'` |
| `renderInto(container)` | Renders every `[data-tex]` descendant, plus the container itself when it matches. Returns the number of `[data-tex]` elements found, including ones skipped as already rendered |

**`renderInto` details:**
- `data-tex` holds the TeX.
- `data-tex-display` selects display mode when present with any value other than `"false"`.
- Each rendered element gets `data-tex-rendered="<engine><mode>:<tex>"`. Here `<engine>` is `k` (KaTeX) or `f` (fallback), and `<mode>` is `D` (display) or `I` (inline).
- An element whose key is unchanged is skipped, which makes `renderInto` idempotent.
- After KaTeX loads, or after `data-tex` changes, the next call re-renders.
- Rendering a container that has `data-tex` replaces its children.

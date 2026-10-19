/*
 * js/core/latex.js — Propietario: math.
 * Generación de TeX (números, complejos, polinomios, fracciones) y render con KaTeX, con respaldo
 * en texto cuando KaTeX no está cargado → DSL.core.latex. API: docs/api/latex.md.
 */
(function (DSL) {
  'use strict';

  var KATEX_OPTS = { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' };
  var SCI_RE = /^(-?)(\d+(?:\.\d+)?)e([+-]?\d+)$/;

  function katexLib() {
    var k = typeof window !== 'undefined' ? window.katex : undefined;
    return k && typeof k.render === 'function' ? k : null;
  }

  /** TeX de un número: punto decimal, signo ASCII, 4 cifras significativas, 1.2 \times 10^{-5}. */
  function num(x, digits) {
    if (digits === undefined || digits === null) digits = 4;
    x = Number(x);
    if (x !== x) return '\\text{indefinido}';
    if (x === Infinity) return '\\infty';
    if (x === -Infinity) return '-\\infty';
    var s = DSL.util.formatNumber(x, digits, { sci: 'e', ascii: true });
    var m = s.match(SCI_RE);
    if (!m) return s;
    var exp = parseInt(m[3], 10);
    return m[1] + (m[2] === '1' ? '' : m[2] + ' \\times ') + '10^{' + exp + '}';
  }

  function re(z) { return typeof z === 'number' ? z : z.re; }
  function im(z) { return typeof z === 'number' ? 0 : (z.im || 0); }

  /** TeX de un complejo con la unidad imaginaria j: '-1 + 2j', '-j', '3'. */
  function complex(z, digits) {
    var r = re(z), i = im(z);
    var mi = num(Math.abs(i), digits);
    if (mi === '0') return num(r, digits);
    var jPart = (mi === '1' ? '' : mi + (mi.indexOf('\\times') >= 0 ? '\\,' : '')) + 'j';
    var mr = num(r, digits);
    if (mr === '0') return (i < 0 ? '-' : '') + jPart;
    return mr + (i < 0 ? ' - ' : ' + ') + jPart;
  }

  /** Par conjugado σ ± jω: '-1 \pm 2j'. Para un valor real devuelve el número. */
  function complexPair(z, digits) {
    var r = re(z), i = Math.abs(im(z));
    var mi = num(i, digits);
    if (mi === '0') return num(r, digits);
    var jPart = (mi === '1' ? '' : mi) + 'j';
    var mr = num(r, digits);
    return (mr === '0' ? '\\pm ' : mr + ' \\pm ') + jPart;
  }

  /** Polinomio en potencias descendentes: 's^{2} + 0.5 s - 3'. Omite términos nulos y coeficientes unitarios. */
  function poly(coeffs, variable, opts) {
    var v = variable || 's';
    var digits = opts && opts.digits !== undefined ? opts.digits : 4;
    var c = Array.prototype.slice.call(coeffs || []);
    var n = c.length - 1, parts = [];
    for (var i = 0; i < c.length; i++) {
      if (c[i] === 0 || c[i] !== c[i]) continue;
      var pw = n - i;
      var mag = num(Math.abs(c[i]), digits);
      if (mag === '0') continue;
      var vp = pw === 0 ? '' : pw === 1 ? v : v + '^{' + pw + '}';
      var body;
      if (pw === 0) body = mag;
      else if (mag === '1') body = vp;
      else body = mag + (mag.indexOf('\\times') >= 0 || mag === '\\infty' ? '\\, ' : ' ') + vp;
      parts.push({ neg: c[i] < 0, body: body });
    }
    if (!parts.length) return '0';
    var out = (parts[0].neg ? '-' : '') + parts[0].body;
    for (var k = 1; k < parts.length; k++) out += (parts[k].neg ? ' - ' : ' + ') + parts[k].body;
    return out;
  }

  function frac(numTex, denTex) {
    return '\\frac{' + numTex + '}{' + denTex + '}';
  }

  var TEXT_ESC = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
  /** Texto literal dentro de una fórmula: \text{…} con los caracteres especiales escapados. */
  function text(s) {
    return '\\text{' + String(s === undefined || s === null ? '' : s).replace(/[\\{}$&#%_^~]/g, function (ch) { return TEXT_ESC[ch]; }) + '}';
  }

  function setFallback(el, tex) {
    el.textContent = tex;
    if (el.classList) el.classList.add('tex-fallback');
  }

  /** Dibuja tex dentro de el. true si lo hizo KaTeX; false si quedó el texto TeX de respaldo. */
  function render(el, tex, opts) {
    if (!el) return false;
    tex = tex === undefined || tex === null ? '' : String(tex);
    var display = !!(opts && opts.display);
    var k = katexLib();
    if (k) {
      try {
        k.render(tex, el, { displayMode: display, throwOnError: KATEX_OPTS.throwOnError, strict: KATEX_OPTS.strict, output: KATEX_OPTS.output });
        if (el.classList) el.classList.remove('tex-fallback');
        return true;
      } catch (err) {
        // KaTeX no debería lanzar con throwOnError:false; si lo hace, queda el texto TeX.
      }
    }
    setFallback(el, tex);
    return false;
  }

  /** Cadena HTML con el TeX renderizado (KaTeX renderToString) o <code class="tex-fallback">. */
  function toHtml(tex, opts) {
    tex = tex === undefined || tex === null ? '' : String(tex);
    var display = !!(opts && opts.display);
    var k = katexLib();
    if (k && typeof k.renderToString === 'function') {
      try {
        return k.renderToString(tex, { displayMode: display, throwOnError: KATEX_OPTS.throwOnError, strict: KATEX_OPTS.strict, output: KATEX_OPTS.output });
      } catch (err) { /* respaldo abajo */ }
    }
    return '<code class="tex-fallback">' + DSL.util.escapeHtml(tex) + '</code>';
  }

  /** Renderiza cada [data-tex] del contenedor (y el propio contenedor). Idempotente. Devuelve cuántos hay. */
  function renderInto(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return 0;
    var list = Array.prototype.slice.call(container.querySelectorAll('[data-tex]'));
    if (typeof container.matches === 'function' && container.matches('[data-tex]')) list.unshift(container);
    var engine = katexLib() ? 'k' : 'f';
    var count = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var tex = el.getAttribute('data-tex');
      if (tex === null || tex === undefined) continue;
      var dAttr = el.getAttribute('data-tex-display');
      var display = dAttr !== null && dAttr !== undefined && dAttr !== 'false';
      var key = engine + (display ? 'D' : 'I') + ':' + tex;
      count++;
      if (el.getAttribute('data-tex-rendered') === key) continue;
      render(el, tex, { display: display });
      el.setAttribute('data-tex-rendered', key);
    }
    return count;
  }

  function available() { return !!katexLib(); }

  DSL.core.latex = {
    num: num,
    complex: complex,
    complexPair: complexPair,
    poly: poly,
    frac: frac,
    text: text,
    render: render,
    toHtml: toHtml,
    renderInto: renderInto,
    available: available
  };
})(window.DSL);

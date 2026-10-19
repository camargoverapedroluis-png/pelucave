// tests/unit/charts.test.mjs — Propietario: charts.
// Pruebas de DSL.viz.charts en node:vm: auxiliares puros (colores, límites «bonitos», décadas,
// remuestreo, cruces, raíces, etiquetas, anotaciones) y controladores con un Chart.js falso que
// ejecuta el plugin de dibujo: ritmo de ~30 fps, arrays propios, ventana, tope de puntos, fuera de
// pantalla, morph y fantasma, movimiento reducido, teclado, leyenda, tema, «Ver datos» y destrucción.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain } from '../helpers/load.mjs';

const FILES = ['js/ui/icons-data.js', 'js/viz/charts.js'];

const CSS = {
  '--ink': '#E6EDF3',
  '--muted': '#9AA8B6',
  '--subtle': '#6B7A89',
  '--c-grid': 'rgba(154, 168, 182, 0.14)',
  '--c-axis': '#4A5A6A',
  '--c-plot-bg': '#0F1823',
  '--c-in': '#B8C4D1',
  '--c-out': '#86C3EA',
  '--c-state': '#BBA8E8',
  '--c-pole': '#EC9088',
  '--c-zero': '#6DD4B8',
  '--c-ghost': '#86C3EA',
  '--c-series-1': '#86C3EA',
  '--c-series-2': '#6DD4B8',
  '--c-stable-region': 'rgba(109, 212, 184, 0.06)',
  '--c-unstable-region': 'rgba(236, 144, 136, 0.06)',
  '--ghost-opacity': '0.35',
  '--chart-line-width': '2',
  '--chart-ref-dash': '4 3',
  '--dur-morph': '300ms',
  '--dur-morph-drag': '120ms',
  '--font-body': 'IBM Plex Sans, sans-serif',
};

/** Chart.js falso: guarda la configuración, calcula escalas lineales/log y ejecuta los plugins. */
function makeFakeChart() {
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.options = config.options;
      this.data = config.data;
      this.ctx = canvas.getContext('2d');
      this.width = 640;
      this.height = 360;
      this.modes = [];
      this.renders = 0;
      this.destroyed = false;
      this.scales = {};
      FakeChart.instances.push(this);
      this.layout();
    }
    layout() {
      const p = (this.options.layout && this.options.layout.padding) || {};
      this.chartArea = { left: 60 + (p.left || 0), top: p.top || 0, right: this.width - (p.right || 0), bottom: this.height - 46 - (p.bottom || 0) };
      const sc = this.options.scales || {};
      Object.keys(sc).forEach((k) => {
        const o = sc[k];
        const horiz = k === 'x';
        const a = this.chartArea;
        const log = o.type === 'logarithmic';
        const min = o.min;
        const max = o.max;
        const f = (v) => (log ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) : (v - min) / (max - min));
        this.scales[k] = {
          axis: k,
          type: o.type || 'linear',
          min,
          max,
          ticks: [],
          getPixelForValue: (v) => (horiz ? a.left + f(v) * (a.right - a.left) : a.bottom - f(v) * (a.bottom - a.top)),
          getValueForPixel: (px) => {
            const t = horiz ? (px - a.left) / (a.right - a.left) : (a.bottom - px) / (a.bottom - a.top);
            return log ? Math.pow(10, Math.log10(min) + t * (Math.log10(max) - Math.log10(min))) : min + t * (max - min);
          },
        };
      });
    }
    draw() {
      (this.config.plugins || []).forEach((pl) => {
        if (pl.beforeDatasetsDraw) pl.beforeDatasetsDraw(this);
        if (pl.afterDatasetsDraw) pl.afterDatasetsDraw(this);
      });
    }
    update(mode) { this.modes.push(mode); this.layout(); this.draw(); }
    render() { this.renders++; this.draw(); }
    resize() { if (this.options.onResize) this.options.onResize(this, { width: this.width, height: this.height }); this.update('resize'); }
    destroy() { this.destroyed = true; }
  }
  FakeChart.instances = [];
  FakeChart.defaults = { font: {}, elements: { line: {}, point: {} } };
  return FakeChart;
}

function setup(options = {}) {
  const Chart = options.noChart ? undefined : makeFakeChart();
  const { DSL, env, document } = loadDSL(FILES, {
    cssVars: Object.assign({}, CSS, options.cssVars || {}),
    globals: Chart ? { Chart } : {},
    media: options.media || {},
  });
  // Envuelve las fábricas: tras crear, el IntersectionObserver falso informa de que el marco se ve
  // (en el navegador lo hace solo en el primer frame).
  const raw = DSL.viz.charts;
  const charts = Object.create(raw);
  ['createTimeChart', 'createStepChart', 'createPoleZeroChart', 'createXYChart', 'createBodeChart'].forEach((name) => {
    charts[name] = (...args) => {
      const h = raw[name](...args);
      if (!h.inert && !options.offscreen) h.frames.forEach((f) => env.intersect(f, true));
      return h;
    };
  });
  const mount = (testid, cls) => {
    const frame = document.createElement('div');
    frame.className = cls || 'ch-frame';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-testid', testid);
    frame.appendChild(canvas);
    document.body.appendChild(frame);
    return { frame, canvas };
  };
  return { DSL, env, document, charts, Chart, mount };
}

/** Hermano siguiente (el DOM falso no tiene nextSibling). Compara con ok() para no volcar objetos. */
function nextOf(el) {
  const list = el.parentNode.childNodes;
  return list[list.indexOf(el) + 1] || null;
}

function curveOf(chart) {
  return chart.data.datasets.find((d) => d._role === 'curve');
}

function ghostOf(chart) {
  return chart.data.datasets.find((d) => d._role === 'ghost');
}

/* ======================================================================= auxiliares puros */

describe('auxiliares puros', () => {
  const { charts, DSL } = setup();
  const H = charts.helpers;

  test('parseColor y withAlpha', () => {
    assert.deepEqual(toPlain(H.parseColor('#86C3EA')), { r: 134, g: 195, b: 234, a: 1 });
    assert.deepEqual(toPlain(H.parseColor('#fff')), { r: 255, g: 255, b: 255, a: 1 });
    assert.equal(H.parseColor('#11223380').a, 128 / 255);
    assert.deepEqual(toPlain(H.parseColor('rgba(10, 20, 30, 0.5)')), { r: 10, g: 20, b: 30, a: 0.5 });
    assert.deepEqual(toPlain(H.parseColor('rgb(10 20 30 / 25%)')), { r: 10, g: 20, b: 30, a: 0.25 });
    assert.equal(H.parseColor('CanvasText'), null);
    assert.equal(H.withAlpha('#86C3EA', 0.35), 'rgba(134, 195, 234, 0.35)');
    assert.equal(H.withAlpha('rgba(10, 20, 30, 0.5)', 0.5), 'rgba(10, 20, 30, 0.25)');
    assert.equal(H.withAlpha('GrayText', 0.5), 'GrayText');
  });

  test('tokens: tokenName, color y cssRef vía tema', () => {
    assert.equal(H.tokenName('--c-out'), '--c-out');
    assert.equal(H.tokenName('var(--c-in)'), '--c-in');
    assert.equal(H.tokenName('c-out'), '--c-out');
    assert.equal(H.tokenName('#fff'), null);
    assert.equal(charts.color('--c-out'), '#86C3EA');
    assert.equal(charts.color('c-out'), '#86C3EA');
    assert.equal(charts.color('--no-existe'), 'GrayText');
    const th = charts.theme();
    assert.equal(th.ink, '#E6EDF3');
    assert.equal(th.muted, '#9AA8B6');
    assert.equal(th.colors.out, '#86C3EA');
    assert.equal(th.colors.pole, '#EC9088');
    assert.equal(th.ghostOpacity, 0.35);
    assert.deepEqual(toPlain(th.refDash), [4, 3]);
    assert.deepEqual(toPlain(th.morph), { release: 300, drag: 120 });
    assert.equal(Object.getPrototypeOf(charts), DSL.viz.charts);
  });

  test('niceNum, niceBounds y phaseBounds', () => {
    assert.equal(H.niceNum(0.37, true), 0.5);
    assert.equal(H.niceNum(1.2, false), 2);
    assert.equal(H.niceNum(7.5, true), 10);
    assert.deepEqual(toPlain(H.niceBounds(0, 1.395)), { min: 0, max: 1.5, step: 0.5 });
    const neg = H.niceBounds(-3, -1);
    assert.equal(neg.max, 0);
    assert.ok(neg.min <= -3);
    const flat = H.niceBounds(1, 1);
    assert.ok(flat.min < 1 && flat.max > 1);
    const cross = H.niceBounds(-0.2, 1.6, { pad: 0 });
    assert.ok(cross.min <= -0.2 && cross.max >= 1.6);
    assert.deepEqual(toPlain(H.phaseBounds(-103.5, 0)), { min: -120, max: 0, step: 30 });
    assert.deepEqual(toPlain(H.phaseBounds(-180, 0)), { min: -180, max: 0, step: 30 });
    assert.deepEqual(toPlain(H.phaseBounds(-270, 0)), { min: -270, max: 0, step: 45 });
    assert.deepEqual(toPlain(H.phaseBounds(-90, -90)), { min: -105, max: -75, step: 15 });
  });

  test('symmetricRange da semirrango y paso comunes', () => {
    assert.deepEqual(toPlain(H.symmetricRange(3)), { half: 4, step: 1 });
    assert.deepEqual(toPlain(H.symmetricRange(1.87)), { half: 3, step: 1 });
    const r = H.symmetricRange(0);
    assert.ok(r.half > 0 && r.step > 0);
    const big = H.symmetricRange(120);
    assert.ok(big.half >= 150 && Number.isInteger(big.half / big.step));
  });

  test('logTicks y fmtDecade', () => {
    const t = H.logTicks(0.02, 300);
    assert.deepEqual(toPlain(t.filter((k) => k.label).map((k) => k.value)), [0.1, 1, 10, 100]);
    assert.ok(t.every((k) => k.value >= 0.02 * (1 - 1e-9) && k.value <= 300 * (1 + 1e-9)));
    assert.ok(t.some((k) => k.value === 0.02) && t.some((k) => k.value === 300));
    // Menos de una década: se rotulan 2 y 5.
    const short = H.logTicks(1.5, 6);
    assert.deepEqual(toPlain(short.filter((k) => k.label).map((k) => k.value)), [2, 5]);
    assert.deepEqual(toPlain(H.logTicks(0, 10)), []);
    assert.equal(H.fmtDecade(0.1), '0.1');
    assert.equal(H.fmtDecade(1000), '1000');
    assert.equal(H.fmtDecade(1e6), '10⁶');
    assert.equal(H.fmtDecade(1e-5), '10⁻⁵');
  });

  test('resample (lineal y logarítmico) y sampleIndices', () => {
    assert.deepEqual(toPlain(H.resample([0, 1, 2], [0, 10, 20], [-1, 0.5, 1.5, 3])), [0, 5, 15, 20]);
    const lg = H.resample([1, 100], [0, 40], [10]);
    assert.ok(Math.abs(lg[0] - 3.6363636) < 1e-6);
    const lgLog = H.resample([1, 100], [0, 40], [10], null, true);
    assert.ok(Math.abs(lgLog[0] - 20) < 1e-12);
    assert.deepEqual(toPlain(H.sampleIndices(5, 10)), [0, 1, 2, 3, 4]);
    const s = H.sampleIndices(1000, 5);
    assert.deepEqual(toPlain(s), [0, 250, 500, 749, 999]);
  });

  test('findCrossing ignora un arranque que ya toca el nivel', () => {
    const xs = [1, 2, 3, 4];
    assert.equal(H.findCrossing(xs, [2, 1, -1, -2], 0), 2.5);
    assert.equal(H.findCrossing(xs, [0, 0.01, 1, -1], 0, false, 0.05), 3.5);
    assert.equal(H.findCrossing(xs, [1, 2, 3, 4], 0), null);
    const w = H.findCrossing([1, 100], [1, -1], 0, true);
    assert.ok(Math.abs(w - 10) < 1e-12);
  });

  test('raíces: orden, multiplicidad y estabilidad', () => {
    const sorted = H.sortRoots([{ re: -1, im: -2 }, { re: -3, im: 0 }, { re: -1, im: 2 }, -0.5]);
    assert.deepEqual(toPlain(sorted), [{ re: -0.5, im: 0 }, { re: -1, im: 2 }, { re: -1, im: -2 }, { re: -3, im: 0 }]);
    const g = H.groupRoots(H.sortRoots([-2, -2, { re: -2, im: 1e-9 }, -1]));
    assert.deepEqual(toPlain(g), [{ start: 0, count: 1 }, { start: 1, count: 3 }]);
    assert.equal(H.classifyPoles([{ re: -1, im: 2 }, { re: -1, im: -2 }]), 'estable');
    assert.equal(H.classifyPoles([{ re: 0, im: 1 }, { re: 0, im: -1 }]), 'marginal');
    assert.equal(H.classifyPoles([0, 0]), 'inestable');
    assert.equal(H.classifyPoles([0.1, -1]), 'inestable');
    assert.equal(H.classifyPoles([]), 'estable');
  });

  test('fmtComplex usa decimales fijos, menos tipográfico y j', () => {
    assert.equal(H.fmtComplex({ re: -1, im: 2 }), '−1.00 + 2.00j');
    assert.equal(H.fmtComplex({ re: -1, im: -2 }), '−1.00 − 2.00j');
    assert.equal(H.fmtComplex({ re: -0.5, im: 0 }), '−0.50');
    assert.equal(H.fmtComplex({ re: 1e-15, im: 3 }), '0.00 + 3.00j');
    assert.equal(H.fmtComplex({ re: -0.7, im: 1.87351 }, 3), '−0.700 + 1.874j');
  });

  test('placeLabels evita solapes, respeta prioridades y descarta opcionales sin sitio', () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 100 };
    const labels = [
      { text: 'a', w: 80, h: 20, candidates: [{ x: 10, y: 10 }] },
      { text: 'b', w: 80, h: 20, candidates: [{ x: 10, y: 10 }, { x: 100, y: 10 }] },
    ];
    H.placeLabels(labels, bounds);
    assert.deepEqual(toPlain(labels[0].rect), { x: 10, y: 10, w: 80, h: 20 });
    assert.deepEqual(toPlain(labels[1].rect), { x: 100, y: 10, w: 80, h: 20 });
    // Sin candidato libre: desplazamiento vertical.
    const shifted = [
      { w: 150, h: 20, candidates: [{ x: 10, y: 40 }] },
      { w: 150, h: 20, candidates: [{ x: 10, y: 40 }] },
    ];
    H.placeLabels(shifted, bounds);
    assert.notEqual(shifted[1].rect.y, 40);
    // Prioridad: la de menor número se coloca primero aunque llegue después.
    const prio = [
      { w: 180, h: 90, priority: 2, optional: true, candidates: [{ x: 5, y: 5 }] },
      { w: 180, h: 90, priority: 0, candidates: [{ x: 5, y: 5 }] },
    ];
    H.placeLabels(prio, bounds);
    assert.ok(prio[1].rect);
    assert.equal(prio[0].rect, null);
  });

  test('placeLabels con zonas blandas (curvas): las evita si puede; la opcional sin sitio libre no se dibuja', () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 100 };
    const curve = [{ x: 0, y: 30, w: 200, h: 20 }];            // banda horizontal y ∈ [30, 50]
    // Primer candidato sobre la curva, segundo libre: gana el segundo.
    const a = [{ w: 60, h: 20, candidates: [{ x: 10, y: 35 }, { x: 10, y: 70 }] }];
    H.placeLabels(a, bounds, [], curve);
    assert.deepEqual(toPlain(a[0].rect), { x: 10, y: 70, w: 60, h: 20 });
    // Opcional: el desplazamiento vertical la saca de la curva si hay sitio dentro de los límites.
    const b = [{ w: 60, h: 20, optional: true, candidates: [{ x: 10, y: 35 }] }];
    H.placeLabels(b, bounds, [], curve);
    assert.ok(b[0].rect);
    assert.ok(b[0].rect.y + 20 <= 30 || b[0].rect.y >= 50, 'no pisa la banda');
    // Opcional sin ningún sitio libre de la curva: no se dibuja.
    const full = [{ x: 0, y: 0, w: 200, h: 100 }];
    const c = [{ w: 60, h: 20, optional: true, candidates: [{ x: 10, y: 35 }] }];
    H.placeLabels(c, bounds, [], full);
    assert.equal(c[0].rect, null);
    // Obligatoria sin sitio libre de la curva: se coloca como sin zonas blandas.
    const d = [{ w: 60, h: 20, candidates: [{ x: 10, y: 35 }] }];
    H.placeLabels(d, bounds, [], full);
    assert.deepEqual(toPlain(d[0].rect), { x: 10, y: 35, w: 60, h: 20 });
  });

  test('curveObstacles: columnas de 4 px que cubren el trazo visible, sin series ocultas ni fuera del área', () => {
    const area = { left: 10, right: 110, top: 0, bottom: 100 };
    const lin = (min, max, pmin, pmax) => ({ getPixelForValue: (v) => pmin + (v - min) / (max - min) * (pmax - pmin) });
    const chart = {
      scales: { x: lin(0, 10, 10, 110), y: lin(0, 1, 100, 0) },
      data: { datasets: [
        { _role: 'curve', data: Array.from({ length: 101 }, (_, i) => ({ x: i / 10, y: i / 100 })) },
        { _role: 'ghost', data: [{ x: 0, y: 1 }, { x: 10, y: 1 }] },
        { _role: 'curve', hidden: true, data: [{ x: 0, y: 0.5 }, { x: 10, y: 0.5 }] },
      ] },
      isDatasetVisible: (i) => i !== 2,
    };
    const obs = H.curveObstacles(chart, area, (ds) => ds._role === 'curve');
    assert.ok(obs.length >= 25 && obs.length <= 27, 'una columna cada 4 px: ' + obs.length);
    obs.forEach((r) => assert.equal(r.w, 4));
    // La recta y = x/10 va de (10, 100) a (110, 0): cada columna contiene su tramo.
    const at = (px) => obs.find((r) => px >= r.x && px < r.x + r.w);
    const r50 = at(60);
    assert.ok(r50.y <= 50 && r50.y + r50.h >= 50, 'el punto medio (60, 50) queda dentro');
    // La serie oculta (y = 0.5 → py = 50, en x = 10…110) no aporta una banda horizontal.
    const r20 = at(20);
    assert.ok(!(r20.y <= 50 && r20.y + r20.h >= 50), 'la serie oculta no cuenta');
    // Fuera del área vertical: no cuenta.
    const off = H.curveObstacles({ ...chart, data: { datasets: [{ _role: 'curve', data: [{ x: 1, y: 5 }, { x: 2, y: 6 }] }] }, isDatasetVisible: () => true }, area, () => true);
    assert.equal(off.length, 0);
  });

  test('normalizeAnnotations acepta el contrato y la forma de stepInfo', () => {
    const fromInfo = H.normalizeAnnotations({
      finalValue: 1, peak: 1.395, peakTime: 1.31, overshootPct: 39.5, settlingTime: 5.25,
      riseTimes: { t10: 0.2, t90: 0.7 }, settleBand: 0.02,
    }, true);
    assert.deepEqual(toPlain(fromInfo), {
      finalValue: 1, band: 0.02, peak: { t: 1.31, y: 1.395 }, overshootPct: 39.5, settlingTime: 5.25, riseTime: { t10: 0.2, t90: 0.7 },
    });
    const contract = H.normalizeAnnotations({ finalValue: 2, band: 0.05, peak: { t: 1, y: 2.4 }, settlingTime: 3, riseTime: { t10: 0.1, t90: 0.5 } }, true);
    assert.equal(contract.band, 0.05);
    assert.deepEqual(toPlain(contract.peak), { t: 1, y: 2.4 });
    // Sin sobrepaso apreciable no hay pico; sin banda si showBand es false.
    const flat = H.normalizeAnnotations({ finalValue: 1, peak: 1.0001, peakTime: 9, overshootPct: 0.01 }, false);
    assert.equal(flat.peak, null);
    assert.equal(flat.band, null);
    assert.equal(H.normalizeAnnotations(null), null);
    const mid = H.lerpAnnotations(contract, Object.assign({}, contract, { finalValue: 4 }), 0.5);
    assert.equal(mid.finalValue, 3);
    assert.equal(mid.alpha.final, 1);
  });
});

/* ======================================================================= sin Chart.js */

describe('sin Chart.js', () => {
  test('las fábricas devuelven un handle inerte y avisan una sola vez', () => {
    const { charts, env, mount } = setup({ noChart: true });
    const { canvas } = mount('a');
    const h = charts.createStepChart(canvas, { ariaLabel: 'Respuesta al escalón' });
    const b = charts.createBodeChart(mount('b').canvas, mount('c').canvas, {});
    assert.equal(h.inert, true);
    assert.equal(h.chart, null);
    assert.doesNotThrow(() => { h.update([]); h.clearGhost(); h.describe('x'); h.destroy(); });
    assert.deepEqual(toPlain(b.charts), []);
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.equal(canvas.getAttribute('aria-label'), 'Respuesta al escalón');
    assert.equal(env.console.warn.length, 1);
    assert.match(String(env.console.warn[0][0]), /Chart\.js no está cargado/);
    assert.equal(env.console.error.length, 0);
  });
});

/* ======================================================================= serie temporal */

describe('createTimeChart', () => {
  const series = [{ key: 'x', label: 'Posición x', color: '--c-out', unit: 'm' }, { key: 'v', label: 'Velocidad v', color: '--c-zero', unit: 'm/s' }];

  test('push no toca los arrays de Chart.js: se copian al repintar, como mucho ~30 veces por segundo', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('t');
    const h = charts.createTimeChart(canvas, { series, window: 10 });
    assert.ok(frame.querySelector('.ch-plot'));
    assert.equal(canvas.getAttribute('role'), 'img');
    const chart = h.chart;
    const ds = chart.data.datasets[0];
    assert.equal(chart.options.plugins.decimation.enabled, true);
    assert.equal(chart.options.plugins.decimation.algorithm, 'min-max');
    let t = 0;
    for (let i = 0; i < 5; i++) h.push((t += 0.01), { x: i, v: -i });
    assert.equal(ds.data.length, 0, 'antes del frame Chart.js no ve las muestras');
    env.frame(16);
    assert.equal(ds.data.length, 5);
    assert.equal(ds.data[4].y, 4);
    // 60 frames de 16 ms con muestras continuas → unos 30 repintados.
    const before = h.stats().updates;
    for (let f = 0; f < 60; f++) {
      for (let k = 0; k < 4; k++) h.push((t += 0.004), { x: Math.sin(t), v: Math.cos(t) });
      env.frame(16);
    }
    const updates = h.stats().updates - before;
    assert.ok(updates >= 25 && updates <= 33, `repintados: ${updates}`);
    assert.ok(chart.modes.every((m) => m === 'none'));
    assert.equal(h.stats().pushes, 245);
    h.destroy();
  });

  test('ventana deslizante, historia completa con tope de puntos y t decreciente', () => {
    const { charts, env, mount } = setup();
    const h = charts.createTimeChart(mount('t').canvas, { series, window: 10, maxPoints: 500 });
    for (let i = 0; i <= 3000; i++) h.push(i * 0.01, { x: i, v: 0 });
    env.frame(16);
    const sc = h.chart.config.options.scales.x;
    assert.ok(Math.abs(sc.max - 30) < 1e-9 && Math.abs(sc.min - 20) < 1e-9);
    assert.ok(h.stats().points <= 550);
    assert.ok(h.chart.data.datasets[0].data[0].x >= 19.9);
    h.setWindow(null);
    for (let i = 3001; i <= 6000; i++) h.push(i * 0.01, { x: i, v: 0 });
    env.frame(40);
    assert.ok(h.stats().points <= 550, 'historia completa diezmada al superar maxPoints');
    const data = h.chart.data.datasets[0].data;
    assert.equal(data[data.length - 1].x, 60);
    h.push(1, { x: 0, v: 0 });
    env.frame(40);
    assert.equal(h.stats().points, 1);
    h.clear();
    env.frame(40);
    assert.equal(h.chart.data.datasets[0].data.length, 0);
    h.destroy();
  });

  test('yRange automático solo crece; un rango fijo se respeta', () => {
    const { charts, env, mount } = setup();
    const h = charts.createTimeChart(mount('t').canvas, { series: series.slice(0, 1), window: 5 });
    h.push(0, { x: 0 });
    h.push(1, { x: 3 });
    env.frame(40);
    const y = h.chart.config.options.scales.y;
    const max1 = y.max;
    assert.ok(max1 >= 3);
    for (let i = 2; i < 20; i++) h.push(i, { x: 0.5 });
    env.frame(40);
    assert.ok(y.max >= max1 - 1e-12, 'no encoge mientras corre');
    h.setYRange([-2, 2]);
    env.frame(40);
    assert.equal(y.min, -2);
    assert.equal(y.max, 2);
    h.destroy();
  });

  test('un yRange fijo ya rige el primer dibujo (Chart.js dibuja al crearse); sin él, el provisional −1..1', () => {
    const { charts, Chart, mount } = setup();
    const n0 = Chart.instances.length;
    const h = charts.createTimeChart(mount('t').canvas, { series: series.slice(0, 1), yRange: [-15000, 10000] });
    const cfg = Chart.instances[n0].config.options.scales.y;
    assert.equal(cfg.min, -15000);
    assert.equal(cfg.max, 10000);
    assert.equal(cfg.chStep, 5000, 'las mismas marcas que applyAxes(): múltiplos de 5000');
    assert.equal(cfg.ticks.stepSize, undefined);
    h.destroy();
    const a = charts.createTimeChart(mount('t2').canvas, { series: series.slice(0, 1) });
    const ya = a.chart.config.options.scales.y;
    assert.equal(ya.min, -1);
    assert.equal(ya.max, 1);
    a.destroy();
  });

  test('flush(): lo pendiente fuera de pantalla se dibuja ya y no queda ningún repintado diferido', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('t');
    const h = charts.createTimeChart(canvas, { series });
    env.intersect(frame, false);
    h.push(0, { x: 1, v: 1 });
    h.push(0.5, { x: 2, v: 1 });
    const u0 = h.stats().updates;
    h.flush();
    assert.equal(h.stats().updates, u0 + 1);
    assert.equal(h.chart.data.datasets[0].data.length, 2);
    env.tick(1200);
    assert.equal(h.stats().updates, u0 + 1, 'sin un segundo dibujo del temporizador');
    h.flush();
    assert.equal(h.stats().updates, u0 + 1, 'nada pendiente: no dibuja');
    h.destroy();
    h.flush();
  });

  test('fuera de pantalla no se anima: se dibuja el estado final por temporizador', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('t');
    const h = charts.createTimeChart(canvas, { series });
    env.intersect(frame, false);
    const u0 = h.stats().updates;
    h.push(0, { x: 1, v: 1 });
    h.push(0.5, { x: 2, v: 1 });
    env.tick(450);
    assert.equal(h.stats().updates, u0 + 1);
    assert.equal(h.chart.data.datasets[0].data.length, 2);
    h.destroy();
  });

  test('leyenda con dos series: el botón oculta la serie; el resumen nombra el último valor', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('demo-t');
    const h = charts.createTimeChart(canvas, { series, ariaLabel: 'Masa-resorte' });
    const btn = frame.querySelector('[data-testid="demo-t-legend-s-v"]');
    assert.ok(btn);
    assert.equal(btn.getAttribute('aria-pressed'), 'true');
    btn.click();
    env.frame(40);
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
    assert.equal(h.chart.data.datasets[1].hidden, true);
    h.push(0, { x: 1.25, v: 0 });
    env.tick(1100);
    env.frame(40);
    assert.match(canvas.getAttribute('aria-label'), /Masa-resorte/);
    h.destroy();
  });
});

/* ======================================================================= escalón */

describe('createStepChart', () => {
  const t = Array.from({ length: 101 }, (_, i) => i * 0.1);
  const resp = (z) => t.map((x) => 1 - Math.exp(-z * x) * Math.cos(2 * x));
  const info = { finalValue: 1, peak: 1.4, peakTime: 1.5, overshootPct: 40, settlingTime: 6, riseTimes: { t10: 0.1, t90: 0.6 }, settleBand: 0.02 };

  test('primera actualización: revelado; después morph en 300 ms con fantasma discontinuo', () => {
    const { charts, env, mount } = setup();
    const { canvas } = mount('s');
    const h = charts.createStepChart(canvas, { ariaLabel: 'Respuesta al escalón' });
    h.update([{ key: 'y', label: 'Respuesta y(t)', t, y: resp(0.5) }], { annotations: info });
    assert.equal(h.stats().tweening, true, 'revelado en curso');
    env.frames(50, 16);
    assert.equal(h.stats().tweening, false);
    const c = curveOf(h.chart);
    assert.equal(c.data[30].y, resp(0.5)[30]);
    assert.equal(ghostOf(h.chart).hidden, true, 'sin fantasma en la primera');
    assert.match(canvas.getAttribute('aria-label'), /^Respuesta al escalón: valor final 1.*sobrepaso 40\s%/);

    h.update([{ key: 'y', label: 'Respuesta y(t)', t, y: resp(1.5) }], { annotations: info, mode: 'release' });
    env.frame(16);
    env.frame(16);
    const mid = curveOf(h.chart).data[30].y;
    const a = resp(0.5)[30];
    const b = resp(1.5)[30];
    assert.ok(mid > Math.min(a, b) && mid < Math.max(a, b), 'valor intermedio durante el morph');
    env.frames(25, 16);
    assert.equal(curveOf(h.chart).data[30].y, b);
    const g = ghostOf(h.chart);
    assert.equal(g.hidden, false);
    assert.equal(g.data[30].y, a);
    assert.deepEqual(toPlain(g.borderDash), [4, 3]);
    assert.equal(g.borderColor, 'rgba(134, 195, 234, 0.35)');
    h.destroy();
  });

  test('un arrastre conserva el fantasma de antes de empezar; ghost:false y clearGhost lo quitan', () => {
    const { charts, env, mount } = setup();
    const h = charts.createStepChart(mount('s').canvas, {});
    h.update([{ key: 'y', t, y: resp(0.5) }]);
    env.frames(50);
    h.update([{ key: 'y', t, y: resp(0.8) }], { mode: 'drag' });
    h.update([{ key: 'y', t, y: resp(1.1) }], { mode: 'drag' });
    h.update([{ key: 'y', t, y: resp(1.4) }], { mode: 'release' });
    env.frames(30);
    assert.equal(ghostOf(h.chart).data[30].y, resp(0.5)[30]);
    h.update([{ key: 'y', t, y: resp(2) }], { ghost: false });
    env.frames(30);
    assert.equal(ghostOf(h.chart).hidden, true);
    h.update([{ key: 'y', t, y: resp(1) }]);
    env.frames(30);
    assert.equal(ghostOf(h.chart).hidden, false);
    h.clearGhost();
    env.frames(2);
    assert.equal(ghostOf(h.chart).hidden, true);
    h.destroy();
  });

  test('movimiento reducido: sin revelado ni morph', () => {
    const { charts, mount, DSL } = setup({ media: { '(prefers-reduced-motion: reduce)': true } });
    assert.equal(DSL.prefs.reducedMotion, true);
    const h = charts.createStepChart(mount('s').canvas, {});
    h.update([{ key: 'y', t, y: resp(0.5) }], { annotations: info });
    assert.equal(h.stats().tweening, false);
    h.update([{ key: 'y', t, y: resp(1.5) }], { annotations: info });
    assert.equal(h.stats().tweening, false);
    assert.equal(curveOf(h.chart).data[30].y, resp(1.5)[30]);
    h.destroy();
  });

  test('motion:change a reducido termina las interpolaciones en curso', () => {
    const { charts, env, mount } = setup();
    const h = charts.createStepChart(mount('s').canvas, {});
    h.update([{ key: 'y', t, y: resp(0.5) }]);
    env.frames(50);
    h.update([{ key: 'y', t, y: resp(1.5) }]);
    env.frame(16);
    assert.equal(h.stats().tweening, true);
    env.setMedia('(prefers-reduced-motion: reduce)', true);
    env.frame(16);
    assert.equal(h.stats().tweening, false);
    assert.equal(curveOf(h.chart).data[30].y, resp(1.5)[30]);
    h.destroy();
  });

  test('teclado: Inicio muestra el detalle del primer punto, Mayús+flecha avanza uno, Escape lo oculta', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('demo-s');
    const h = charts.createStepChart(canvas, {});
    h.update([{ key: 'y', label: 'Respuesta y(t)', t, y: resp(0.5) }], { annotations: info });
    env.frames(50);
    const tip = frame.querySelector('[data-testid="demo-s-tooltip"]');
    env.fire(canvas, 'keydown', { key: 'Home' });
    assert.ok(tip.classList.contains('is-visible'));
    assert.match(tip.textContent, /^t = 0 s/);
    env.fire(canvas, 'keydown', { key: 'ArrowRight', shiftKey: true });
    assert.match(tip.textContent, /^t = 0\.1 s/);
    env.tick(300);
    const live = frame.querySelector('[aria-live]');
    assert.match(live.textContent, /t = 0\.1/);
    env.fire(canvas, 'keydown', { key: 'Escape' });
    assert.ok(!tip.classList.contains('is-visible'));
    h.destroy();
  });

  test('leyenda: curva, Anterior, y∞ ± 2 % y «Pico y tiempos»; describe() fija y libera la etiqueta', () => {
    const { charts, env, mount } = setup();
    const { canvas, frame } = mount('demo-s');
    const h = charts.createStepChart(canvas, {});
    h.update([{ key: 'y', label: 'Respuesta y(t)', t, y: resp(0.5) }], { annotations: info });
    env.frames(50);
    const items = frame.querySelectorAll('.ch-legend__item').map((b) => b.textContent);
    assert.deepEqual(toPlain(items), ['Respuesta y(t)', 'Anterior', 'y∞ ± 2 %', 'Pico y tiempos']);
    const marks = frame.querySelector('[data-testid="demo-s-legend-marks"]');
    marks.click();
    assert.equal(marks.getAttribute('aria-pressed'), 'false');
    h.describe('Texto propio');
    assert.equal(canvas.getAttribute('aria-label'), 'Texto propio');
    h.update([{ key: 'y', t, y: resp(1) }], { annotations: info });
    assert.equal(canvas.getAttribute('aria-label'), 'Texto propio');
    h.describe(null);
    assert.match(canvas.getAttribute('aria-label'), /valor final/);
    h.destroy();
  });

  test('tableSpec y dataToggle «Ver datos»', () => {
    const { charts, env, mount, document } = setup();
    const { canvas, frame } = mount('demo-s');
    const h = charts.createStepChart(canvas, { dataToggle: true });
    h.update([{ key: 'y', label: 'Respuesta y(t)', t, y: resp(0.5) }]);
    const spec = h.tableSpec();
    assert.equal(spec.rows.length, 101);
    assert.equal(spec.columns[0].label, 'Tiempo t');
    const btn = document.querySelector('[data-testid="demo-s-data-toggle"]');
    const panel = document.querySelector('[data-testid="demo-s-data"]');
    assert.ok(btn && panel);
    assert.ok(nextOf(frame) === btn.parentNode, 'el conmutador va tras el marco');
    const isHidden = () => panel.hidden === true || panel.hasAttribute('hidden');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(isHidden(), true);
    btn.click();
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.equal(isHidden(), false);
    assert.equal(panel.querySelectorAll('tr').length, 102, 'cabecera + 101 filas');
    btn.click();
    assert.equal(isHidden(), true);
    h.destroy();
    assert.equal(document.querySelector('[data-testid="demo-s-data-toggle"]'), null);
  });
});

/* ======================================================================= plano s */

describe('createPoleZeroChart', () => {
  test('escala 1:1, paso común, resumen con veredicto y movimiento por índice ordenado', () => {
    const { charts, env, mount } = setup();
    const { canvas } = mount('pz');
    const h = charts.createPoleZeroChart(canvas, { ariaLabel: 'Mapa de polos y ceros' });
    h.update({ poles: [{ re: -1, im: 2 }, { re: -1, im: -2 }], zeros: [-3] });
    env.frames(30);
    const c = h.chart;
    const ux = Math.abs(c.scales.x.getPixelForValue(1) - c.scales.x.getPixelForValue(0));
    const uy = Math.abs(c.scales.y.getPixelForValue(1) - c.scales.y.getPixelForValue(0));
    assert.ok(Math.abs(ux - uy) < 1e-6, `1:1 (${ux} vs ${uy})`);
    const o = c.config.options.scales;
    assert.equal(o.x.ticks.stepSize, o.y.ticks.stepSize);
    assert.equal(o.x.ticks.autoSkip, false);
    assert.ok(Math.abs(o.x.min + o.x.max) < 1e-9 && Math.abs(o.y.min + o.y.max) < 1e-9, 'simétrico');
    const label = canvas.getAttribute('aria-label');
    assert.match(label, /p1 = −1\.00 \+ 2\.00j; p2 = −1\.00 − 2\.00j/);
    assert.match(label, /z1 = −3\.00/);
    assert.match(label, /sistema estable/);
    h.update({ poles: [{ re: 0.5, im: 2 }, { re: 0.5, im: -2 }], zeros: [] });
    env.frame(16);
    env.frame(16);
    assert.equal(h.stats().tweening, true);
    env.frames(30);
    assert.match(canvas.getAttribute('aria-label'), /sistema inestable/);
    const rows = h.tableSpec().rows;
    assert.deepEqual(toPlain(rows.map((r) => r.nombre)), ['p1', 'p2']);
    h.destroy();
  });

  test('las etiquetas de un eje se aclaran sin cambiar la cuadrícula', () => {
    const { charts, env, mount } = setup();
    const h = charts.createPoleZeroChart(mount('pz').canvas, {});
    h.update({ poles: [{ re: -0.2, im: 30 }, { re: -0.2, im: -30 }] });
    env.frames(30);
    const c = h.chart;
    const o = c.config.options.scales;
    const step = o.x.ticks.stepSize;
    const ppu = Math.abs(c.scales.x.getPixelForValue(1) - c.scales.x.getPixelForValue(0));
    assert.equal(o.y.ticks.stepSize, step);
    assert.ok(step * ppu >= 24, `celdas de al menos 24 px (${step * ppu})`);
    // Aquí la celda mide menos de 44 px: en x se rotula una marca de cada dos; en y, todas.
    assert.ok(step * ppu < 44);
    const xl = [0, 1, 2, 3].map((k) => o.x.ticks.callback(k * step, k, []));
    const yl = [0, 1, 2, 3].map((k) => o.y.ticks.callback(k * step, k, []));
    assert.deepEqual(toPlain(xl.map((v) => v === '')), [false, true, false, true]);
    assert.ok(yl.every((v) => v !== ''));
    h.destroy();
  });
});

/* ======================================================================= Bode */

describe('createBodeChart', () => {
  const omega = Array.from({ length: 200 }, (_, i) => Math.pow(10, -2 + (4 * i) / 199));
  const mag = (k) => omega.map((w) => 20 * Math.log10(k / Math.hypot(1, w)));
  const ph = omega.map((w) => (-Math.atan(w) * 180) / Math.PI);

  test('dos gráficas con el mismo eje ω logarítmico; marcadores −3 dB y cruce por 0 dB', () => {
    const { charts, env, mount, document } = setup();
    const a = mount('bode-mag');
    const b = mount('bode-phase');
    const h = charts.createBodeChart(a.canvas, b.canvas, { ariaLabel: 'Diagrama de Bode', markers: { minus3dB: true, crossover: true }, testid: 'bode' });
    h.update({ omega, magDb: mag(10), phaseDeg: ph });
    env.frames(40);
    const [m, p] = h.charts;
    const xm = m.config.options.scales.x;
    const xp = p.config.options.scales.x;
    assert.equal(xm.type, 'logarithmic');
    assert.equal(xm.min, xp.min);
    assert.equal(xm.max, xp.max);
    assert.equal(m.config.options.scales.y.title.text, 'Magnitud (dB)');
    assert.equal(p.config.options.scales.y.title.text, 'Fase (°)');
    assert.equal(p.config.options.scales.x.title.text, 'Frecuencia ω (rad/s)');
    // Leyenda común fuera de los marcos.
    const legend = document.querySelector('[data-testid="bode-legend"]');
    assert.ok(legend.classList.contains('ch-legend--outside'));
    assert.ok(nextOf(legend) === a.frame, 'la leyenda va justo antes del marco de magnitud');
    assert.match(legend.textContent, /Ancho de banda \(−3\sdB\)/);
    assert.match(legend.textContent, /Cruce por 0\sdB/);
    assert.match(a.canvas.getAttribute('aria-label'), /magnitud/);
    assert.match(b.canvas.getAttribute('aria-label'), /fase/);
    // Cursor compartido: el teclado en la magnitud muestra ω, dB y grados.
    env.fire(a.canvas, 'keydown', { key: 'Home' });
    const tip = document.querySelector('[data-testid="bode-tooltip"]');
    assert.match(tip.textContent, /ω = 0\.01/);
    assert.match(tip.textContent, /dB/);
    assert.match(tip.textContent, /°/);
    h.destroy();
    assert.equal(document.querySelector('[data-testid="bode-legend"]'), null);
  });

  test('morph en ω logarítmica y fantasma de la curva anterior', () => {
    const { charts, env, mount } = setup();
    const h = charts.createBodeChart(mount('m').canvas, mount('p').canvas, {});
    h.update({ omega, magDb: mag(1), phaseDeg: ph });
    env.frames(40);
    h.update({ omega, magDb: mag(10), phaseDeg: ph }, { mode: 'release' });
    env.frame(16);
    env.frame(16);
    assert.equal(h.stats().tweening, true);
    env.frames(30);
    assert.equal(h.stats().tweening, false);
    const sets = h.charts[0].data.datasets;
    const ghost = sets.find((d) => d.borderDash && d.borderDash.length && !d.hidden);
    assert.ok(ghost, 'fantasma visible');
    h.destroy();
  });
});

/* ======================================================================= XY */

describe('createXYChart', () => {
  test('telaraña (segments), tallos, aspecto 1:1 y morph de forma igual', () => {
    const { charts, env, mount } = setup();
    const h = charts.createXYChart(mount('xy').canvas, { aspect: 'equal', xRange: [0, 10], yRange: [0, 10] });
    h.update([
      { key: 'id', label: 'Identidad', kind: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '--c-in', dash: true },
      { key: 'web', label: 'Telaraña', kind: 'segments', points: [{ x: 8, y: 8 }, { x: 8, y: 2.6 }, { x: 8, y: 2.6 }, { x: 2.6, y: 2.6 }], color: '--c-state' },
    ]);
    env.frames(40);
    const c = h.chart;
    const ux = Math.abs(c.scales.x.getPixelForValue(1) - c.scales.x.getPixelForValue(0));
    const uy = Math.abs(c.scales.y.getPixelForValue(1) - c.scales.y.getPixelForValue(0));
    assert.ok(Math.abs(ux - uy) < 1e-6);
    const web = c.data.datasets.find((d) => d.label === 'Telaraña');
    assert.ok(web.data.some((p) => p.y === null), 'segmentos separados por huecos');
    h.destroy();

    const s = charts.createXYChart(mount('stems').canvas, { xLabel: 'Periodo k' });
    s.update([{ key: 'P', label: 'Precio', kind: 'stems', points: [0, 1, 2, 3].map((k) => ({ x: k, y: 5 + k })) }]);
    env.frames(40);
    const x = s.chart.config.options.scales.x;
    assert.ok(x.min < 0 && x.max > 3, 'margen para el primer y el último tallo');
    const y = s.chart.config.options.scales.y;
    assert.ok(y.min <= 0, 'los tallos parten de 0');
    s.update([{ key: 'P', label: 'Precio', kind: 'stems', points: [0, 1, 2, 3].map((k) => ({ x: k, y: 6 - k })) }]);
    env.frame(16);
    env.frame(16);
    assert.equal(s.stats().tweening, true);
    env.frames(30);
    s.destroy();
  });

  test('setXRange cambia el marco x sin rehacer la gráfica: el panel «Ver datos» abierto sigue abierto', () => {
    const { charts, env, mount, Chart, document } = setup();
    const h = charts.createXYChart(mount('eq').canvas, { xRange: [-0.18, 6.18], dataToggle: true });
    const pts = (n) => Array.from({ length: n }, (_, k) => ({ x: k, y: 1 - Math.exp(-k) }));
    h.update([{ key: 'd', label: 'Discreto', kind: 'stems', points: pts(7) }]);
    env.frames(40);
    const chart = h.chart;
    const n0 = Chart.instances.length;
    const toggle = document.querySelector('[data-testid="eq-data-toggle"]');
    const panel = document.querySelector('[data-testid="eq-data"]');
    toggle.click();
    const isOpen = () => !(panel.hidden === true || panel.hasAttribute('hidden'));
    assert.equal(isOpen(), true);
    assert.equal(panel.querySelectorAll('tr').length, 1 + 7);
    h.setXRange([-0.24, 8.24]);
    h.update([{ key: 'd', label: 'Discreto', kind: 'stems', points: pts(9) }]);
    env.frames(40);
    env.tick(400);
    assert.equal(h.chart, chart, 'la misma instancia de Chart.js');
    assert.equal(Chart.instances.length, n0, 'sin gráficas nuevas');
    const x = chart.config.options.scales.x;
    assert.ok(Math.abs(x.min + 0.24) < 1e-9 && Math.abs(x.max - 8.24) < 1e-9, `${x.min} … ${x.max}`);
    assert.equal(isOpen(), true, 'el panel sigue abierto');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(panel.querySelectorAll('tr').length, 1 + 9, 'y sigue a los datos nuevos');
    // mismo marco: no hace nada; null vuelve al marco automático
    h.setXRange([-0.24, 8.24]);
    h.setXRange(null);
    env.frames(40);
    // marco automático de tallos enteros: 0.6 a cada lado
    assert.ok(Math.abs(x.min + 0.6) < 1e-9 && Math.abs(x.max - 8.6) < 1e-9, `automático: ${x.min} … ${x.max}`);
    h.destroy();
    h.setXRange([0, 1]);
  });
});

/* ======================================================================= tema, bus y destrucción */

describe('tema y ciclo de vida', () => {
  test('theme:change relee los tokens y recolorea ejes, curvas y valores por defecto', () => {
    const { charts, env, mount, DSL, Chart } = setup();
    const h = charts.createStepChart(mount('s').canvas, {});
    h.update([{ key: 'y', t: [0, 1, 2], y: [0, 1, 1] }]);
    env.frames(40);
    assert.equal(h.chart.config.options.scales.x.ticks.color, '#9AA8B6');
    env.setCssVar('--muted', '#123456');
    env.setCssVar('--c-out', '#1C6EA4');
    DSL.bus.emit('theme:change', { theme: 'light' });
    assert.equal(h.chart.config.options.scales.x.ticks.color, '#123456');
    assert.equal(curveOf(h.chart).borderColor, '#1C6EA4');
    assert.equal(Chart.defaults.color, '#123456');
    h.destroy();
  });

  test('los colores de las curvas se resuelven una vez por tema: update() no relee los tokens; theme:change sí', () => {
    const { charts, env, mount, DSL } = setup();
    const h = charts.createStepChart(mount('s').canvas, {});
    h.update([{ key: 'y', t: [0, 1, 2], y: [0, 1, 1] }]);
    env.frames(40);
    assert.equal(curveOf(h.chart).borderColor, '#86C3EA');
    // Un token cambiado sin «theme:change» no se vuelve a leer en cada update() (sin getComputedStyle).
    env.setCssVar('--c-out', '#1C6EA4');
    h.update([{ key: 'y', t: [0, 1, 2], y: [0, 0.5, 1] }], { mode: 'release' });
    env.frames(40);
    assert.equal(curveOf(h.chart).borderColor, '#86C3EA', 'memoria del tema vigente');
    DSL.bus.emit('theme:change', { theme: 'light' });
    assert.equal(curveOf(h.chart).borderColor, '#1C6EA4', 'el cambio de tema rehace la memoria');
    h.update([{ key: 'y', t: [0, 1, 2], y: [0, 1, 1] }], { mode: 'release' });
    env.frames(40);
    assert.equal(curveOf(h.chart).borderColor, '#1C6EA4');
    h.destroy();
  });

  test('destroy restaura el DOM, suelta el bus y deja el handle inerte', () => {
    const { charts, env, mount, DSL, document } = setup();
    const busBefore = DSL.bus.count('theme:change');
    const { canvas, frame } = mount('s');
    canvas.setAttribute('aria-label', 'original');
    const h = charts.createStepChart(canvas, { dataToggle: true });
    const p = charts.createPoleZeroChart(mount('p').canvas, {});
    assert.equal(DSL.bus.count('theme:change'), busBefore + 1, 'una sola suscripción para todas');
    assert.equal(charts.helpers.liveCount(), 2);
    h.update([{ key: 'y', t: [0, 1, 2], y: [0, 1, 1] }]);
    const chart = h.chart;
    h.destroy();
    p.destroy();
    assert.equal(chart.destroyed, true);
    assert.equal(h.chart, null);
    assert.equal(h.alive, false);
    assert.equal(charts.helpers.liveCount(), 0);
    assert.equal(DSL.bus.count('theme:change'), busBefore);
    assert.ok(canvas.parentNode === frame, 'el lienzo vuelve a su marco');
    assert.equal(frame.querySelector('.ch-plot'), null);
    assert.equal(document.querySelector('.ch-data'), null);
    assert.equal(canvas.getAttribute('aria-label'), 'original');
    assert.equal(canvas.getAttribute('role'), null);
    assert.equal(canvas.getAttribute('tabindex'), null);
    assert.ok(!canvas.classList.contains('ch-canvas'));
    assert.doesNotThrow(() => { h.update([]); h.destroy(); env.frames(5); env.tick(1000); });
    assert.equal(env.console.error.length, 0);
  });

  test('dataTable muestrea filas uniformemente y anuncia el muestreo', () => {
    const { charts, document } = setup();
    const box = document.createElement('div');
    const rows = Array.from({ length: 1000 }, (_, i) => ({ t: i / 100, y: Math.sin(i / 100), name: 'p' + i }));
    const table = charts.dataTable(box, {
      caption: 'Respuesta',
      columns: [{ key: 't', label: 'Tiempo t', unit: 's', digits: 4 }, { key: 'y', label: 'Salida y' }, { key: 'name', label: 'Nombre' }],
      rows,
      maxRows: 200,
    });
    assert.equal(table.localName, 'table');
    assert.ok(table.classList.contains('ch-table'));
    assert.ok(table.parentNode === box);
    const trs = table.querySelectorAll('tr');
    assert.equal(trs.length, 201);
    assert.match(table.querySelector('caption').textContent, /Respuesta.*200.*1000/);
    assert.match(trs[0].textContent, /Tiempo t \(s\)/);
    const empty = charts.dataTable(document.createElement('div'), { caption: 'Vacía', columns: [{ key: 't', label: 't' }], rows: [] });
    assert.match(empty.textContent, /Todavía no hay datos/);
  });
});

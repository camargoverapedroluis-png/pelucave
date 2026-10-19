// tests/e2e/charts.spec.mjs — Propietario: charts.
// Capa de gráficas (DSL.viz.charts) sobre tests/pages/charts.html: render en ambos temas,
// streaming limitado a ~30 fps, morph y fantasma, polos animados, Bode compartido, teclado,
// tooltips, leyendas, tablas «Ver datos», alta densidad de píxeles, movimiento reducido y destrucción.
// El fixture guard falla el test ante cualquier console.error, error de página o petición de red.
import { test, expect, TIMING } from '../helpers/fixtures.mjs';

const CANVASES = ['ch-demo-time', 'ch-demo-step', 'ch-demo-pz', 'ch-demo-bode-mag', 'ch-demo-bode-phase', 'ch-demo-phase', 'ch-demo-cobweb', 'ch-demo-stems'];

async function open(page, gotoTestPage, opts = {}) {
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoTestPage('charts.html');
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
  await frames(page, 2);
}

/** Espera n frames de animación del navegador. */
async function frames(page, n = 1) {
  await page.evaluate((k) => new Promise((resolve) => {
    let left = k;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}

async function settle(page, ms = 800) {
  await page.waitForTimeout(ms);
}

/** Lleva el marco a la vista: fuera de pantalla las gráficas aplican el estado final sin animar. */
async function onScreen(page, testid) {
  await page.getByTestId(testid).evaluate((el) => el.closest('.ch-frame').scrollIntoView({ block: 'center' }));
  await frames(page, 3);
}

test.describe('capturas', () => {
  for (const theme of ['dark', 'light']) {
    for (const [w, hgt] of [[1440, 900], [1024, 768]]) {
      test(`página de prueba ${theme} ${w}`, async ({ page, gotoTestPage }, testInfo) => {
        await page.setViewportSize({ width: w, height: hgt });
        await open(page, gotoTestPage);
        if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
        await page.evaluate(() => window.__demo.apply({ zeta: 0.25 }, 'release'));
        await settle(page);
        await page.screenshot({ path: testInfo.outputPath(`charts-${theme}-${w}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test('móvil 390 sin desbordamiento horizontal', async ({ page, gotoTestPage }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, gotoTestPage);
    await settle(page, 500);
    await page.screenshot({ path: testInfo.outputPath('charts-dark-390.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('detalle con tooltip y foco de teclado', async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage);
    await settle(page, 500);
    const step = page.getByTestId('ch-demo-step');
    await step.scrollIntoViewIfNeeded();
    const box = await step.boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await expect(page.getByTestId('ch-demo-step-tooltip')).toHaveClass(/is-visible/);
    await frames(page, 2);
    await page.getByTestId('ch-demo-step').locator('xpath=ancestor::section[1]').screenshot({ path: testInfo.outputPath('charts-hover-step.png') });
  });
});

test.describe('estructura y accesibilidad', () => {
  test('cada lienzo es una imagen enfocable con resumen y ayuda de teclado', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    for (const id of CANVASES) {
      const c = page.getByTestId(id);
      await expect(c).toHaveAttribute('role', 'img');
      await expect(c).toHaveAttribute('tabindex', '0');
      const label = await c.getAttribute('aria-label');
      expect(label && label.length, `${id} aria-label`).toBeGreaterThan(10);
      const hint = await c.evaluate((el) => {
        const d = document.getElementById(el.getAttribute('aria-describedby'));
        return d ? d.textContent : '';
      });
      // FND-19: role=img se mantiene; la ayuda no promete lo que un lector en modo exploración no hace.
      expect(hint).toContain('flechas para recorrer los datos');
      expect(hint).toContain('modo de foco');
      expect(hint).toContain('Ver datos');
      const wrapped = await c.evaluate((el) => el.parentElement.classList.contains('ch-plot') && !!el.closest('.ch-frame'));
      expect(wrapped).toBe(true);
    }
    await expect(page.getByTestId('ch-demo-step')).toHaveAttribute('aria-label', /Respuesta al escalón: valor final 1.*sobrepaso/);
    await expect(page.getByTestId('ch-demo-pz')).toHaveAttribute('aria-label', /estable/);
    await expect(page.getByTestId('ch-demo-bode-phase')).toHaveAttribute('aria-label', /fase/);
  });

  test('Chart.js no anima ni recibe eventos; la decimación está activa en la serie temporal', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const info = await page.evaluate(() => {
      const h = window.__demo.h;
      const c = h.time.chart;
      return {
        animation: c.options.animation,
        events: c.options.events,
        decimation: c.options.plugins.decimation.enabled,
        algorithm: c.options.plugins.decimation.algorithm,
        parsing: c.options.parsing,
        pointRadius: c.data.datasets[0].pointRadius,
        maintain: c.options.maintainAspectRatio,
      };
    });
    expect(info.animation).toBe(false);
    expect(info.events).toEqual([]);
    expect(info.decimation).toBe(true);
    expect(info.algorithm).toBe('min-max');
    expect(info.parsing).toBe(false);
    expect(info.pointRadius).toBe(0);
    expect(info.maintain).toBe(false);
  });
});

test.describe('serie temporal', () => {
  test('una ráfaga de push se dibuja a ~30 fps y la ventana se desliza', TIMING, async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const d = window.__demo;
      const h = d.h.time;
      const s0 = h.stats();
      const t0 = performance.now();
      let n = 0;
      const tick = () => {
        // 10 muestras por frame: 600 en 60 frames.
        for (let k = 0; k < 10; k++) d.streamTo(d.simT() + 1 / 600);
        if (++n < 60) requestAnimationFrame(tick);
        else requestAnimationFrame(() => requestAnimationFrame(() => {
          const s1 = h.stats();
          const sc = h.chart.scales.x;
          resolve({
            updates: s1.updates - s0.updates,
            pushes: s1.pushes - s0.pushes,
            ms: performance.now() - t0,
            min: sc.min,
            max: sc.max,
            simT: d.simT(),
            points: s1.points,
          });
        }));
      };
      requestAnimationFrame(tick);
    }));
    expect(r.pushes).toBeGreaterThanOrEqual(590);
    expect(r.updates).toBeGreaterThan(3);
    // Como mucho un repintado cada ~29 ms (más un par de margen por los bordes del intervalo).
    expect(r.updates).toBeLessThanOrEqual(Math.ceil(r.ms / 29) + 2);
    // Ventana de 10 s pegada al último instante.
    expect(r.max - r.min).toBeCloseTo(10, 6);
    expect(Math.abs(r.max - r.simT)).toBeLessThan(0.05);
    expect(r.points).toBeGreaterThan(100);
  });

  test('push con t decreciente reinicia; setWindow(null) muestra todo; clear vacía', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(async () => {
      const h = window.__demo.h.time;
      const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      h.setWindow(null);
      h.clear();
      for (let i = 0; i <= 40; i++) h.push(i * 0.5, { x: Math.sin(i), v: Math.cos(i) });
      await new Promise((res) => setTimeout(res, 80));
      await raf();
      const a = { min: h.chart.scales.x.min, max: h.chart.scales.x.max, n: h.stats().points };
      h.push(0, { x: 1, v: 0 });
      await new Promise((res) => setTimeout(res, 80));
      await raf();
      const b = h.stats().points;
      h.clear();
      await raf();
      return { a, b, c: h.stats().points };
    });
    expect(r.a.min).toBe(0);
    expect(r.a.max).toBe(20);
    expect(r.a.n).toBe(41);
    expect(r.b).toBe(1);
    expect(r.c).toBe(0);
  });

  test('la leyenda oculta y vuelve a mostrar una serie', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const btn = page.getByTestId('ch-demo-time-legend-s-v');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await frames(page, 3);
    expect(await page.evaluate(() => window.__demo.h.time.chart.data.datasets[1].hidden)).toBe(true);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await frames(page, 3);
    expect(await page.evaluate(() => window.__demo.h.time.chart.data.datasets[1].hidden)).toBe(false);
  });
});

test.describe('respuesta al escalón', () => {
  test('morph suave hacia la curva nueva y fantasma discontinuo de la anterior', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await onScreen(page, 'ch-demo-step');
    await settle(page, 300);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const d = window.__demo;
      const h = d.h.step;
      const idx = 40;
      const curve = () => h.chart.data.datasets.find((s) => s._role === 'curve');
      const before = curve().data[idx].y;
      const target = d.system(0.9, d.params.wn, d.params.zero ? d.params.a : null).y[idx];
      d.apply({ zeta: 0.9 }, 'release');
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const mid = curve().data[idx].y;
        const tweening = h.stats().tweening;
        setTimeout(() => {
          const ghost = h.chart.data.datasets.find((s) => s._role === 'ghost');
          resolve({
            before, target, mid, tweening,
            after: curve().data[idx].y,
            ghostHidden: ghost.hidden,
            ghostDash: ghost.borderDash,
            ghostColor: ghost.borderColor,
            ghostY: ghost.data[idx].y,
            ghostOpacity: getComputedStyle(document.documentElement).getPropertyValue('--ghost-opacity').trim(),
          });
        }, 600);
      })));
    }));
    expect(r.tweening).toBe(true);
    const lo = Math.min(r.before, r.target);
    const hi = Math.max(r.before, r.target);
    expect(r.mid).toBeGreaterThan(lo - 1e-9);
    expect(r.mid).toBeLessThan(hi + 1e-9);
    expect(Math.abs(r.mid - r.target)).toBeGreaterThan(1e-6);
    expect(r.after).toBeCloseTo(r.target, 9);
    expect(r.ghostHidden).toBe(false);
    expect(r.ghostDash.length).toBeGreaterThan(0);
    expect(r.ghostY).toBeCloseTo(r.before, 9);
    expect(r.ghostColor).toMatch(new RegExp(`rgba\\(.*, ${Number(r.ghostOpacity)}\\)$`));
  });

  test('un arrastre conserva como fantasma la curva de antes de empezar', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(async () => {
      const d = window.__demo;
      const h = d.h.step;
      const idx = 60;
      const y0 = d.system(d.params.zeta, d.params.wn, d.params.a).y[idx];
      d.apply({ zeta: 0.5 }, 'drag');
      d.apply({ zeta: 0.6 }, 'drag');
      d.apply({ zeta: 0.7 }, 'release');
      await new Promise((res) => setTimeout(res, 500));
      const ghost = h.chart.data.datasets.find((s) => s._role === 'ghost');
      return { y0, g: ghost.data[idx].y };
    });
    expect(r.g).toBeCloseTo(r.y0, 9);
  });

  test('anotaciones en la leyenda: y∞ ± 2 % y «Pico y tiempos» se pueden ocultar', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const legend = page.getByTestId('ch-demo-step-legend');
    await expect(legend).toContainText('Respuesta y(t)');
    await expect(legend).toContainText('Anterior');
    await expect(legend).toContainText('y∞ ± 2 %');
    await expect(legend).toContainText('Pico y tiempos');
    const marks = page.getByTestId('ch-demo-step-legend-marks');
    await marks.click();
    await expect(marks).toHaveAttribute('aria-pressed', 'false');
  });

  test('teclado: flechas recorren la curva, Fin va al último punto, Escape oculta', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await settle(page, 300);
    const canvas = page.getByTestId('ch-demo-step');
    await canvas.focus();
    await page.keyboard.press('Home');
    const tip = page.getByTestId('ch-demo-step-tooltip');
    await expect(tip).toHaveClass(/is-visible/);
    await expect(tip).toContainText('t = 0 s');
    // Mayús + flecha: de una en una muestra.
    await page.keyboard.press('Shift+ArrowRight');
    const t1 = await page.evaluate(() => window.DSL.util.formatNumber(window.__demo.h.step.chart.data.datasets.find((s) => s._role === 'curve').data[1].x, 4));
    await expect(tip).toContainText('t = ' + t1 + ' s');
    await page.keyboard.press('End');
    const tEnd = await page.evaluate(() => {
      const t = window.__demo.h.step.chart.data.datasets.find((s) => s._role === 'curve').data;
      return window.DSL.util.formatNumber(t[t.length - 1].x, 4);
    });
    await expect(tip).toContainText('t = ' + tEnd + ' s');
    await page.waitForTimeout(350);
    const liveText = await canvas.evaluate((el) => el.parentElement.querySelector('[aria-live]').textContent);
    expect(liveText).toContain('t = ');
    await page.keyboard.press('Escape');
    await expect(tip).not.toHaveClass(/is-visible/);
  });

  test('«Ver datos» abre una tabla con las muestras', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const btn = page.getByTestId('ch-demo-step-data-toggle');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByTestId('ch-demo-step-data');
    await expect(panel).toBeVisible();
    const rows = await panel.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(20);
    expect(rows).toBeLessThanOrEqual(200);
    await expect(panel.locator('thead')).toContainText('Tiempo');
    await btn.click();
    await expect(panel).toBeHidden();
  });
});

test.describe('polos y ceros', () => {
  test('tooltip «p1 = −0.70 + 1.87j» al pasar sobre el polo; cuadrícula 1:1', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await settle(page, 500);
    const canvas = page.getByTestId('ch-demo-pz');
    await canvas.scrollIntoViewIfNeeded();
    const pt = await canvas.evaluate((el) => {
      const c = window.__demo.h.pz.chart;
      const sx = c.scales.x;
      const sy = c.scales.y;
      const p = { re: -0.7, im: 2 * Math.sqrt(1 - 0.35 * 0.35) };
      return {
        x: sx.getPixelForValue(p.re),
        y: sy.getPixelForValue(p.im),
        ux: Math.abs(sx.getPixelForValue(1) - sx.getPixelForValue(0)),
        uy: Math.abs(sy.getPixelForValue(1) - sy.getPixelForValue(0)),
        stepX: sx.ticks[1].value - sx.ticks[0].value,
        stepY: sy.ticks[1].value - sy.ticks[0].value,
      };
    });
    expect(Math.abs(pt.ux - pt.uy)).toBeLessThan(0.75);
    expect(pt.stepX).toBeCloseTo(pt.stepY, 9);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + pt.x + 3, box.y + pt.y - 2);
    const tip = page.getByTestId('ch-demo-pz-tooltip');
    await expect(tip).toHaveClass(/is-visible/);
    await expect(tip).toContainText('p1 = −0.70 + 1.87j');
    await expect(tip).toContainText('ζ');
  });

  test('los polos se desplazan suavemente al cambiar ζ', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await onScreen(page, 'ch-demo-pz');
    await settle(page, 500);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const h = window.__demo.h.pz;
      window.__demo.apply({ zeta: 0.7 }, 'release');
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const mid = h.stats().tweening;
        setTimeout(() => resolve({ mid, end: h.stats().tweening, label: h.chart.canvas.getAttribute('aria-label') }), 600);
      })));
    }));
    expect(r.mid).toBe(true);
    expect(r.end).toBe(false);
    expect(r.label).toContain('−1.4');
  });
});

test.describe('Bode', () => {
  test('dos gráficas con el mismo eje ω logarítmico y marcas por décadas', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await settle(page, 500);
    const r = await page.evaluate(() => {
      const [m, p] = window.__demo.h.bode.charts;
      return {
        types: [m.scales.x.type, p.scales.x.type],
        mins: [m.scales.x.min, p.scales.x.min],
        maxs: [m.scales.x.max, p.scales.x.max],
        lefts: [m.chartArea.left, p.chartArea.left],
        rights: [m.chartArea.right, p.chartArea.right],
        labels: p.scales.x.ticks.filter((t) => t.label).map((t) => t.value),
        yTitles: [m.options.scales.y.title.text, p.options.scales.y.title.text],
        xTitle: p.options.scales.x.title.text,
        phaseStep: p.scales.y.ticks[1].value - p.scales.y.ticks[0].value,
      };
    });
    expect(r.types).toEqual(['logarithmic', 'logarithmic']);
    expect(r.mins[0]).toBe(r.mins[1]);
    expect(r.maxs[0]).toBe(r.maxs[1]);
    expect(r.lefts[0]).toBe(r.lefts[1]);
    expect(r.rights[0]).toBe(r.rights[1]);
    expect(r.labels).toEqual([0.1, 1, 10, 100]);
    expect(r.yTitles).toEqual(['Magnitud (dB)', 'Fase (°)']);
    expect(r.xTitle).toBe('Frecuencia ω (rad/s)');
    expect([15, 30, 45, 90]).toContain(r.phaseStep);
    // Leyenda común fuera de los marcos.
    const legend = page.getByTestId('ch-demo-bode-legend');
    await expect(legend).toHaveClass(/ch-legend--outside/);
    await expect(legend).toContainText('Ancho de banda (−3 dB)');
  });

  test('el cursor sobre la magnitud se refleja en la fase (cursor compartido)', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await settle(page, 400);
    const mag = page.getByTestId('ch-demo-bode-mag');
    await mag.scrollIntoViewIfNeeded();
    const box = await mag.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const tip = page.getByTestId('ch-demo-bode-tooltip');
    await expect(tip).toHaveClass(/is-visible/);
    await expect(tip).toContainText('ω =');
    await expect(tip).toContainText('dB');
    await expect(tip).toContainText('°');
  });
});

test.describe('fuera de pantalla', () => {
  test('una gráfica fuera de la vista aplica el destino sin animar ni dejar la revelación a medias', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page, 3);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const d = window.__demo;
      const idx = 30;
      const target = d.system(1.2, d.params.wn, d.params.a).y[idx];
      d.apply({ zeta: 1.2 }, 'release');
      setTimeout(() => {
        const y = d.h.step.chart.data.datasets.find((s) => s._role === 'curve').data[idx].y;
        resolve({ y, target, tweening: d.h.step.stats().tweening });
      }, 120);
    }));
    expect(r.tweening).toBe(false);
    expect(r.y).toBeCloseTo(r.target, 12);
  });
});

test.describe('tema y movimiento', () => {
  test('el cambio de tema recolorea ejes y curvas desde los tokens', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const before = await page.evaluate(() => {
      const c = window.__demo.h.step.chart;
      return { tick: c.options.scales.x.ticks.color, line: c.data.datasets.find((s) => s._role === 'curve').borderColor };
    });
    await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    await frames(page, 2);
    const after = await page.evaluate(() => {
      const ch = window.DSL.viz.charts;
      const c = window.__demo.h.step.chart;
      return {
        tick: c.options.scales.x.ticks.color,
        line: c.data.datasets.find((s) => s._role === 'curve').borderColor,
        muted: ch.color('--muted'),
        out: ch.color('--c-out'),
        theme: ch.theme().theme,
      };
    });
    expect(after.theme).toBe('light');
    expect(after.tick).not.toBe(before.tick);
    expect(after.tick).toBe(after.muted);
    expect(after.line).not.toBe(before.line);
    expect(after.line).toBe(after.out);
  });

  test('con movimiento reducido no hay morph: el destino se aplica en el acto', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage, { reducedMotion: true });
    const r = await page.evaluate(() => {
      const d = window.__demo;
      const idx = 50;
      const target = d.system(1.4, d.params.wn, d.params.a).y[idx];
      d.apply({ zeta: 1.4 }, 'release');
      const y = d.h.step.chart.data.datasets.find((s) => s._role === 'curve').data[idx].y;
      return { y, target, tweening: [d.h.step.stats().tweening, d.h.pz.stats().tweening, d.h.bode.stats().tweening], reduced: window.DSL.prefs.reducedMotion };
    });
    expect(r.reduced).toBe(true);
    expect(r.y).toBeCloseTo(r.target, 12);
    expect(r.tweening).toEqual([false, false, false]);
  });
});

test.describe('alta densidad', () => {
  test.use({ deviceScaleFactor: 2 });
  test('el lienzo usa el doble de píxeles físicos', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="ch-demo-step"]');
      return { w: c.width, cw: c.clientWidth, h: c.height, ch: c.clientHeight };
    });
    expect(Math.abs(r.w - 2 * r.cw)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.h - 2 * r.ch)).toBeLessThanOrEqual(2);
  });
});

test.describe('ciclo de vida', () => {
  test('al cambiar el tamaño de la ventana las gráficas se ajustan y el plano s sigue 1:1', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const w0 = await page.evaluate(() => window.__demo.h.step.chart.width);
    await page.setViewportSize({ width: 1024, height: 768 });
    await settle(page, 400);
    const r = await page.evaluate(() => {
      // El plano s queda fuera de pantalla en esta página: desde FND-04 su repintado (también el de la carga)
      // se aplaza OFF_DELAY = 400 ms, así que leer sus escalas a los 400 ms era una carrera. flush() dibuja ya
      // el estado final pendiente, que es el que se verá al llegar a la gráfica.
      window.__demo.h.step.flush();
      window.__demo.h.pz.flush();
      const c = window.__demo.h.pz.chart;
      return {
        w: window.__demo.h.step.chart.width,
        ux: Math.abs(c.scales.x.getPixelForValue(1) - c.scales.x.getPixelForValue(0)),
        uy: Math.abs(c.scales.y.getPixelForValue(1) - c.scales.y.getPixelForValue(0)),
      };
    });
    expect(r.w).toBeLessThan(w0);
    expect(Math.abs(r.ux - r.uy)).toBeLessThan(0.75);
  });

  test('destroy restaura el DOM, suelta Chart.js y el bus, y deja el handle inerte', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(() => {
      const DSL = window.DSL;
      const d = window.__demo;
      d.live.stop();
      const busBefore = DSL.bus.count('theme:change');
      const canvases = Array.from(document.querySelectorAll('canvas'));
      Object.values(d.h).forEach((h) => h.destroy());
      let threw = false;
      try {
        d.h.step.update([{ key: 'y', t: [0, 1], y: [0, 1] }]);
        d.h.time.push(1, { x: 1 });
        d.h.pz.update({ poles: [{ re: -1, im: 0 }] });
        d.h.bode.describe('x');
      } catch (e) { threw = true; }
      return {
        threw,
        plots: document.querySelectorAll('.ch-plot').length,
        legends: document.querySelectorAll('.ch-legend').length,
        toggles: document.querySelectorAll('.ch-data').length,
        tips: document.querySelectorAll('.ch-tooltip').length,
        charts: canvases.filter((c) => window.Chart.getChart(c)).length,
        roles: canvases.filter((c) => c.hasAttribute('role') || c.hasAttribute('tabindex')).length,
        live: DSL.viz.charts.helpers.liveCount(),
        busDelta: busBefore - DSL.bus.count('theme:change'),
        alive: d.h.step.alive,
        chart: d.h.step.chart,
      };
    });
    expect(r.threw).toBe(false);
    expect(r.plots).toBe(0);
    expect(r.legends).toBe(0);
    expect(r.toggles).toBe(0);
    expect(r.tips).toBe(0);
    expect(r.charts).toBe(0);
    expect(r.roles).toBe(0);
    expect(r.live).toBe(0);
    expect(r.busDelta).toBe(1);
    expect(r.alive).toBe(false);
    expect(r.chart).toBe(null);
  });
});

/* ======================================================================= auditoría foundation (FND) */

/** Envuelve chart.update de cada gráfica para contar dibujados (window.__upd[clave]). */
async function countUpdates(page) {
  return page.evaluate(() => {
    const d = window.__demo;
    const charts = { step: d.h.step.chart, pz: d.h.pz.chart, bodeMag: d.h.bode.charts[0], bodePhase: d.h.bode.charts[1], phase: d.h.phase.chart };
    window.__upd = {};
    const off = {};
    for (const [k, c] of Object.entries(charts)) {
      window.__upd[k] = 0;
      const orig = c.update.bind(c);
      c.update = (...a) => { window.__upd[k]++; return orig(...a); };
      off[k] = c.canvas.closest('.ch-frame').getBoundingClientRect().top > window.innerHeight + 64;
    }
    return off;
  });
}

test.describe('auditoría foundation: tablas «Ver datos»', () => {
  test('FND-01: una tabla abierta sigue a los datos en menos de 500 ms (escalón, polos, Bode, serie temporal y XY)', TIMING, async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    for (const k of ['step', 'pz', 'bode', 'time', 'stems']) {
      const id = 'ch-demo-' + k;
      await page.getByTestId(id + '-data-toggle').click();
      await expect(page.getByTestId(id + '-data')).toBeVisible();
      const r = await page.evaluate(async ({ k, id }) => {
        const d = window.__demo;
        const panel = document.querySelector(`[data-testid="${id}-data"]`);
        const body = () => (panel.querySelector('tbody') || panel).textContent;
        const before = body();
        const change = {
          step: () => d.apply({ zeta: 0.9 }, 'release'),
          pz: () => d.apply({ wn: 3.5 }, 'release'),
          bode: () => d.apply({ a: 6.5 }, 'release'),
          time: () => d.streamTo(d.simT() + 3),
          stems: () => {
            const m = d.market(2, 14);
            d.h.stems.update([{ key: 'P', label: 'Precio P(k)', kind: 'stems', points: m.P.map((p, i) => ({ x: i, y: p })), color: '--c-out' }]);
          },
        };
        const t0 = performance.now();
        change[k]();
        return new Promise((resolve) => {
          const iv = setInterval(() => {
            const ms = performance.now() - t0;
            if (body() !== before) { clearInterval(iv); resolve({ ms, changed: true }); }
            else if (ms > 2000) { clearInterval(iv); resolve({ ms, changed: false }); }
          }, 10);
        });
      }, { k, id });
      expect(r.changed, `${k}: la tabla cambia`).toBe(true);
      expect(r.ms, `${k}: en menos de 500 ms`).toBeLessThan(500);
    }
  });

  test('FND-01: al refrescarse, el panel conserva desplazamiento y foco; en vivo refresca como mucho 2 veces por segundo', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.getByTestId('ch-demo-step-data-toggle').click();
    const r = await page.evaluate(async () => {
      const d = window.__demo;
      const panel = document.querySelector('[data-testid="ch-demo-step-data"]');
      panel.scrollTop = 140;
      panel.focus({ preventScroll: true });
      const top0 = panel.scrollTop;
      const before = panel.textContent;
      d.apply({ zeta: 1.3 }, 'release');
      await new Promise((res) => setTimeout(res, 450));
      return { top0, top: panel.scrollTop, changed: panel.textContent !== before, focused: document.activeElement === panel };
    });
    expect(r.top0).toBeGreaterThan(100);
    expect(r.changed).toBe(true);
    expect(Math.abs(r.top - r.top0)).toBeLessThanOrEqual(1);
    expect(r.focused).toBe(true);

    await page.getByTestId('ch-demo-time-data-toggle').click();
    const n = await page.evaluate(async () => {
      const d = window.__demo;
      const panel = document.querySelector('[data-testid="ch-demo-time-data"]');
      let refreshes = 0;
      const mo = new MutationObserver((list) => { refreshes += list.filter((m) => m.target === panel).length; });
      mo.observe(panel, { childList: true });
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          d.streamTo(d.simT() + 1 / 60);
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      await new Promise((res) => setTimeout(res, 600));
      mo.disconnect();
      return refreshes;
    });
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
  });

  test('FND-02: muestreo por serie: 16 muestras discretas junto a 400 de una curva se conservan enteras', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const r = await page.evaluate(() => {
      const ch = window.DSL.viz.charts;
      const rows = [];
      for (let k = 0; k < 16; k++) rows.push({ s: 'Muestras discretas', t: k * 0.4, y: Math.sin(k) });
      for (let i = 0; i < 400; i++) rows.push({ s: 'Curva continua', t: i * 0.016, y: Math.cos(i / 40) });
      const count = (t, name) => Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr.textContent.includes(name)).length;
      const auto = ch.dataTable(null, { columns: [{ key: 's', label: 'Serie' }, { key: 't', label: 'Tiempo', unit: 's' }, { key: 'y', label: 'Salida' }], rows });
      const byKey = ch.dataTable(null, { columns: [{ key: 't', label: 'Tiempo' }, { key: 'y', label: 'Salida' }, { key: 's', label: 'Serie' }], rows, groupKey: 's' });
      const uniform = ch.dataTable(null, { columns: [{ key: 't' }, { key: 'y' }], rows: rows.map((x) => ({ t: x.t, y: x.y })) });
      return {
        total: auto.querySelectorAll('tbody tr').length,
        discrete: count(auto, 'Muestras discretas'),
        caption: auto.querySelector('caption').textContent,
        totalKey: byKey.querySelectorAll('tbody tr').length,
        discreteKey: count(byKey, 'Muestras discretas'),
        uniformCaption: uniform.querySelector('caption').textContent,
        uniformTotal: uniform.querySelectorAll('tbody tr').length,
      };
    });
    expect(r.discrete).toBe(16);
    expect(r.total).toBeLessThanOrEqual(200);
    expect(r.total).toBeGreaterThan(150);
    expect(r.caption).toContain('muestreo por serie');
    expect(r.caption).toContain('Muestras discretas 16 de 16');
    expect(r.caption).toMatch(/Curva continua \d+ de 400/);
    expect(r.discreteKey).toBe(16);
    expect(r.totalKey).toBeLessThanOrEqual(200);
    expect(r.uniformCaption).toContain('(muestreo uniforme)');
    expect(r.uniformTotal).toBe(200);
  });
});

test.describe('auditoría foundation: ejes', () => {
  test('FND-03: un rango fijo [−15000, 10000] da marcas múltiplos de 5000 ancladas en 0', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.evaluate(() => window.__demo.h.time.setYRange([-15000, 10000]));
    await frames(page, 3);
    const ticks = await page.evaluate(() => window.__demo.h.time.chart.scales.y.ticks.map((t) => t.value));
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.every((v) => Math.abs(v / 5000 - Math.round(v / 5000)) < 1e-9), ticks.join(', ')).toBe(true);
    expect(ticks.some((v) => v === 0)).toBe(true);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(-15000);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(10000);
  });

  test('FND-03: sin avisos de Chart.js por exceso de marcas al transformar entre escalas muy distintas', async ({ page, gotoTestPage }) => {
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning' || /Limiting|ticks/i.test(m.text())) warnings.push(m.text()); });
    await open(page, gotoTestPage);
    await onScreen(page, 'ch-demo-step');
    await page.evaluate(async () => {
      const d = window.__demo;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = Array.from({ length: 200 }, (_, i) => i * 0.05);
      for (const A of [1e6, 1, 1e-3, 5e4, 1, 1e7, 1]) {
        d.h.step.update([{ key: 'y', label: 'y', t, y: t.map((x) => A * (1 - Math.exp(-x))) }], { mode: 'release' });
        d.h.pz.update({ poles: [{ re: -1000 * A, im: 0 }, { re: -1, im: 2 }, { re: -1, im: -2 }] }, { mode: 'release' });
        d.h.time.setYRange(A > 10 ? [-15000 * A, 10000 * A] : [-1, 1]);
        await wait(250);
      }
      await wait(900);
    });
    expect(warnings).toEqual([]);
  });

  test('FND-03: etiquetas compactas para |v| ≥ 1e5 y el título del eje y nunca pisa las marcas (hasta 1e7)', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await onScreen(page, 'ch-demo-step');
    for (const A of [5e5, -5e5, 3e6, 1e7]) {
      await page.evaluate((amp) => {
        const t = Array.from({ length: 200 }, (_, i) => i * 0.05);
        window.__demo.h.step.update([{ key: 'y', label: 'Salida', t, y: t.map((x) => amp * (1 - Math.exp(-x))) }], { mode: 'release' });
      }, A);
      await settle(page, 900);
      const r = await page.evaluate(() => {
        const c = window.__demo.h.step.chart;
        const y = c.scales.y;
        const ctx = c.ctx;
        ctx.save();
        ctx.font = window.Chart.helpers.toFont(y.options.ticks.font).string;
        const labels = y.ticks.map((t) => String(t.label));
        const widest = Math.max(...labels.map((l) => ctx.measureText(l).width));
        ctx.restore();
        const title = window.Chart.helpers.toFont(y.options.title.font);
        return { labels, values: y.ticks.map((t) => t.value), widest, width: y.width, titleH: title.lineHeight, display: y.options.title.display };
      });
      const big = r.labels.filter((l, i) => Math.abs(r.values[i]) >= 1e5);
      expect(big.length, `${A}: ${r.labels.join(' | ')}`).toBeGreaterThan(0);
      for (const l of big) {
        expect(l, `${A}: etiqueta compacta`).toMatch(/×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
        expect(l.length, `${A}: «${l}» corta`).toBeLessThanOrEqual(7);
      }
      expect(r.display).toBe(true);
      // Caja del eje: título girado + etiquetas medidas (con su separación) caben sin solaparse.
      expect(r.width, `${A}: ancho del eje`).toBeGreaterThanOrEqual(r.widest + r.titleH + 4);
    }
  });

  test('FND-03: plano s de 1/(s+1000): marcas «redondas» que incluyen el 0 y etiquetas sin solaparse', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await onScreen(page, 'ch-demo-pz');
    await page.evaluate(() => window.__demo.h.pz.update({ poles: [{ re: -1000, im: 0 }], zeros: [] }, { mode: 'release' }));
    await settle(page, 900);
    const r = await page.evaluate(() => {
      const c = window.__demo.h.pz.chart;
      const ctx = c.ctx;
      const out = {};
      for (const id of ['x', 'y']) {
        const sc = c.scales[id];
        ctx.save();
        ctx.font = window.Chart.helpers.toFont(sc.options.ticks.font).string;
        const shown = sc.ticks.filter((t) => t.label !== '' && t.label !== null && t.label !== undefined);
        const boxes = shown.map((t) => {
          const w = ctx.measureText(String(t.label)).width;
          const p = sc.getPixelForValue(t.value);
          return id === 'x' ? { a: p - w / 2, b: p + w / 2, label: String(t.label) } : { a: p - 7, b: p + 7, label: String(t.label) };
        }).sort((u, v) => u.a - v.a);
        ctx.restore();
        out[id] = { values: sc.ticks.map((t) => t.value), boxes };
      }
      return out;
    });
    for (const id of ['x', 'y']) {
      const v = r[id].values;
      expect(v.some((x) => x === 0), `${id}: incluye 0 (${v.join(', ')})`).toBe(true);
      const step = v[1] - v[0];
      const mant = step / Math.pow(10, Math.floor(Math.log10(step)));
      expect([1, 2, 2.5, 5, 10].some((m) => Math.abs(m - mant) < 1e-9), `${id}: paso redondo ${step}`).toBe(true);
      v.forEach((x) => expect(Math.abs(x / step - Math.round(x / step)) < 1e-9, `${id}: ${x} múltiplo de ${step}`).toBe(true));
      const b = r[id].boxes;
      for (let i = 1; i < b.length; i++) {
        expect(b[i].a, `${id}: «${b[i - 1].label}» y «${b[i].label}» no se solapan`).toBeGreaterThanOrEqual(b[i - 1].b + 2);
      }
    }
  });
});

test.describe('auditoría foundation: fuera de pantalla', () => {
  test('FND-04: un arrastre de 3 s con las gráficas fuera de la vista hace ≤ 10 dibujados por gráfica', async ({ page, gotoTestPage }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 420 });
    await open(page, gotoTestPage);
    await settle(page, 700);
    const off = await countUpdates(page);
    expect(off).toEqual({ step: true, pz: true, bodeMag: true, bodePhase: true, phase: true });
    const r = await page.evaluate(async () => {
      const d = window.__demo;
      const t0 = performance.now();
      let z = 0.35;
      let moves = 0;
      await new Promise((resolve) => {
        const tick = () => {
          const el = performance.now() - t0;
          z = 0.3 + 0.5 * (0.5 - 0.5 * Math.cos(el / 600));
          d.apply({ zeta: z }, 'drag');
          moves++;
          if (el < 3000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      d.apply({ zeta: z }, 'release');
      const during = { ...window.__upd };
      await new Promise((res) => setTimeout(res, 500));
      const idx = 40;
      const target = d.system(z, d.params.wn, d.params.a).y[idx];
      const drawn = d.h.step.chart.data.datasets.find((s) => s._role === 'curve').data[idx].y;
      return { moves, during, after: { ...window.__upd }, target, drawn };
    });
    expect(r.moves).toBeGreaterThan(100);
    for (const [k, n] of Object.entries(r.after)) {
      expect(n, `${k}: dibujados durante el arrastre`).toBeLessThanOrEqual(10);
      expect(n, `${k}: el estado final se dibujó 500 ms después`).toBeGreaterThan(r.during[k] - 1);
    }
    expect(Object.values(r.after).every((n, i) => n >= 1)).toBe(true);
    expect(r.drawn).toBeCloseTo(r.target, 12);
    // Al volver a la vista, una gráfica con cambios pendientes se dibuja en el acto.
    const v = await page.evaluate(async () => {
      const d = window.__demo;
      const before = window.__upd.step;
      d.apply({ zeta: 1.1 }, 'release');
      const t0 = performance.now();
      d.h.step.frame.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise((resolve) => {
        const check = () => (window.__upd.step > before || performance.now() - t0 > 1000 ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      });
      return { n: window.__upd.step - before, ms: performance.now() - t0 };
    });
    expect(v.n).toBeGreaterThan(0);
    expect(v.ms).toBeLessThan(250);
  });

  test('FND-04: 20 cambios de ancho entre 1024 y 1440 hacen como mucho 3 dibujados por gráfica fuera de la vista', async ({ page, gotoTestPage }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 420 });
    await open(page, gotoTestPage);
    await settle(page, 1200);
    const off = await countUpdates(page);
    expect(Object.values(off).every(Boolean)).toBe(true);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) await page.setViewportSize({ width: i % 2 ? 1440 : 1024, height: 420 });
    const spent = Date.now() - t0;
    await settle(page, 1200);
    const r = await page.evaluate(() => {
      const d = window.__demo;
      const charts = { step: d.h.step.chart, pz: d.h.pz.chart, bodeMag: d.h.bode.charts[0], bodePhase: d.h.bode.charts[1], phase: d.h.phase.chart };
      const size = {};
      for (const [k, c] of Object.entries(charts)) size[k] = Math.abs(c.width - c.canvas.parentElement.clientWidth) <= 1;
      return { upd: { ...window.__upd }, size };
    });
    for (const [k, n] of Object.entries(r.upd)) expect(n, `${k} (20 cambios en ${spent} ms)`).toBeLessThanOrEqual(3);
    expect(Object.values(r.size).every(Boolean), JSON.stringify(r.size)).toBe(true);
  });

  test('FND-04: charts.flush() y beforeprint dibujan lo pendiente en el acto y anulan el repintado diferido', async ({ page, gotoTestPage }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await open(page, gotoTestPage);
    await settle(page, 700);
    await countUpdates(page);
    const r = await page.evaluate(() => {
      const d = window.__demo;
      const ch = window.DSL.viz.charts;
      d.apply({ zeta: 0.6 }, 'release');
      const a = window.__upd.step;
      ch.flush();
      const b = window.__upd.step;
      d.apply({ zeta: 0.8 }, 'release');
      window.dispatchEvent(new Event('beforeprint'));
      const c = window.__upd.step;
      return { a, b, c, fn: typeof ch.flush };
    });
    expect(r.fn).toBe('function');
    expect(r.a).toBe(0);
    expect(r.b).toBe(1);
    expect(r.c).toBe(2);
    await settle(page, 700);
    expect(await page.evaluate(() => window.__upd.step)).toBe(2);
  });
});

test.describe('auditoría foundation: revelado inicial', () => {
  test('FND-05: el revelado espera a la primera vista y los tallos se descubren con la curva', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await settle(page, 300);
    const before = await page.evaluate(() => {
      const h = window.__demo.h.stems;
      return { off: h.frame.getBoundingClientRect().top > window.innerHeight, ...h.stats() };
    });
    expect(before.off).toBe(true);
    expect(before.introPending).toBe(true);
    expect(before.reveal).toBe(1);
    const samples = await page.evaluate(async () => {
      const ch = window.DSL.viz.charts;
      const h = window.__demo.h.stems;
      const c = h.chart;
      const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      probe.fillStyle = ch.color('--c-out');
      probe.fillRect(0, 0, 1, 1);
      const [R, G, B] = probe.getImageData(0, 0, 1, 1).data;
      const hitsIn = (x, y, w, hh) => {
        if (w < 1 || hh < 1) return 0;
        const px = c.ctx.getImageData(x, y, w, hh).data;
        let n = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] > 160 && Math.abs(px[i] - R) + Math.abs(px[i + 1] - G) + Math.abs(px[i + 2] - B) < 60) n++;
        }
        return n;
      };
      h.frame.scrollIntoView({ block: 'center', behavior: 'instant' });
      const out = [];
      let checked = false;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          const s = h.stats();
          const sample = { t: performance.now() - t0, tweening: s.tweening, reveal: s.reveal, pending: s.introPending };
          if (!checked && s.reveal > 0.3 && s.reveal < 0.7) {
            checked = true;
            const a = c.chartArea;
            const dpr = c.currentDevicePixelRatio || 1;
            const clipX = a.left + (a.right - a.left + 8) * s.reveal;
            const top = Math.round(a.top * dpr);
            const hh = Math.round((a.bottom - a.top) * dpr);
            const x0 = Math.ceil((clipX + 3) * dpr);
            sample.right = hitsIn(x0, top, Math.floor(a.right * dpr) - x0, hh);
            sample.left = hitsIn(Math.round(a.left * dpr), top, Math.floor((clipX - 3) * dpr) - Math.round(a.left * dpr), hh);
            sample.checked = true;
          }
          out.push(sample);
          if (performance.now() - t0 < 1500) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return out;
    });
    expect(samples.slice(0, 6).some((s) => s.tweening), JSON.stringify(samples.slice(0, 6))).toBe(true);
    const mid = samples.find((s) => s.checked);
    expect(mid, 'un frame con el revelado a medias').toBeTruthy();
    expect(mid.left, 'a la izquierda del recorte ya hay tallos').toBeGreaterThan(0);
    expect(mid.right, 'ningún tallo a la derecha del recorte').toBe(0);
    const last = samples[samples.length - 1];
    expect(last).toMatchObject({ tweening: false, reveal: 1, pending: false });
  });

  test('FND-05: con movimiento reducido no hay barrido: el estado final se ve en el acto', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage, { reducedMotion: true });
    const s0 = await page.evaluate(() => window.__demo.h.stems.stats());
    expect(s0).toMatchObject({ introPending: false, reveal: 1, tweening: false });
    await onScreen(page, 'ch-demo-stems');
    const s1 = await page.evaluate(() => window.__demo.h.stems.stats());
    expect(s1).toMatchObject({ introPending: false, reveal: 1, tweening: false });
  });
});

test.describe('auditoría foundation: leyendas', () => {
  test('FND-18: cada muestra de leyenda dibuja el patrón de trazos de su serie', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.evaluate(() => window.__demo.h.phase.update([
      { key: 'a', label: 'Serie A', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '--c-out', dash: [2, 3] },
      { key: 'b', label: 'Serie B', kind: 'line', points: [{ x: 0, y: 1 }, { x: 1, y: 0 }], color: '--c-in', dash: [8, 3] },
      { key: 'c', label: 'Serie C', kind: 'line', points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], color: '--c-state' },
    ], { mode: 'release' }));
    await frames(page, 2);
    const keys = await page.getByTestId('ch-demo-phase-legend').evaluate((el) => Array.from(el.querySelectorAll('.ch-legend__item')).map((it) => {
      const line = it.querySelector('svg.ch-key [stroke-dasharray]');
      return { label: it.textContent.trim(), dash: line ? line.getAttribute('stroke-dasharray') : null };
    }));
    const byLabel = Object.fromEntries(keys.map((k) => [k.label, k.dash]));
    const ratio = (s) => { const [on, off] = s.split(/[\s,]+/).map(Number); return on / off; };
    expect(byLabel['Serie A']).toBeTruthy();
    expect(byLabel['Serie B']).toBeTruthy();
    expect(byLabel['Serie A']).not.toBe(byLabel['Serie B']);
    expect(ratio(byLabel['Serie A'])).toBeCloseTo(2 / 3, 2);
    expect(ratio(byLabel['Serie B'])).toBeCloseTo(8 / 3, 2);
    expect(byLabel['Serie C']).toBeNull();
  });
});

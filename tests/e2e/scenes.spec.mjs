// tests/e2e/scenes.spec.mjs — Propietario: scenes.
// Escenas físicas (DSL.viz.scenes) sobre tests/pages/scenes.html con fotogramas sintéticos:
// capturas por escena en varios instantes y en ambos temas, estructura accesible, resumen vivo,
// colores desde los tokens, textos sin solapes ni recortes, movimiento reducido (sin movimiento
// decorativo, estado intacto), tamaño adaptable y coste por fotograma. Casos límite (SCN-01, SCN-02):
// mercado con lecturas de millones y equilibrio junto al origen (ranuras, choques, telaraña dentro del
// cuadro) y contraste muestreado en píxeles de los rótulos sobre el agua de los tanques.
// El fixture guard falla el test ante cualquier console.error, error de página o petición de red.
import { test, expect, TIMING } from '../helpers/fixtures.mjs';
import fs from 'node:fs';

const KEYS = ['mass', 'tank-lineal', 'tank-torricelli', 'tank-cascada', 'rlc', 'sir', 'market-telarana', 'market-walras'];
const FRACTIONS = [0, 0.12, 0.35, 1];

async function open(page, gotoTestPage, opts = {}) {
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  await gotoTestPage('scenes.html');
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
  await frames(page, 2);
}

async function frames(page, n = 1) {
  await page.evaluate((k) => new Promise((resolve) => {
    let left = k;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}

/** Textos visibles de una escena: fuera del SVG o solapados entre sí (cajas de pantalla). */
async function textProblems(page, key, prefix = 'sc-demo-') {
  return page.evaluate((testid) => {
    const svg = document.querySelector(`[data-testid="${testid}"]`);
    const sb = svg.getBoundingClientRect();
    const boxes = [...svg.querySelectorAll('text')]
      .filter((t) => getComputedStyle(t).visibility !== 'hidden' && t.textContent.trim() !== '')
      .map((t) => {
        const r = t.getBoundingClientRect();
        return { t: t.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      })
      .filter((b) => b.x1 - b.x0 > 0);
    const out = [];
    for (const b of boxes) {
      if (b.x0 < sb.left - 0.5 || b.x1 > sb.right + 0.5 || b.y0 < sb.top - 0.5 || b.y1 > sb.bottom + 0.5) out.push(`fuera del lienzo: «${b.t}»`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > 1 && oy > 3) out.push(`solape: «${a.t}» / «${b.t}»`);
      }
    }
    return out;
  }, `${prefix}${key}`);
}

/** Atributos de los elementos con movimiento decorativo y de estado. */
async function snapshot(page) {
  return page.evaluate(() => {
    const q = (sel) => [...document.querySelectorAll(sel)].map((n) => n.getAttribute('transform') || n.getAttribute('points') || '');
    return {
      dots: q('[data-testid="sc-demo-rlc"] .sc-dot--zero'),
      particles: q('[data-testid="sc-demo-sir"] .sc-particle--pole, [data-testid="sc-demo-sir"] .sc-particle--zero'),
      surface: q('[data-testid="sc-demo-tank-lineal"] .sc-surface'),
      mass: q('[data-testid="sc-demo-mass-mass"]'),
      liquid: q('[data-testid="sc-demo-tank-lineal"] .sc-liquid'),
    };
  });
}

test.describe('capturas', () => {
  for (const theme of ['dark', 'light']) {
    for (const [w, hgt] of [[1440, 900], [1024, 768]]) {
      test(`página completa ${theme} ${w}`, async ({ page, gotoTestPage }, testInfo) => {
        await open(page, gotoTestPage, { viewport: { width: w, height: hgt } });
        if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
        await page.evaluate(() => { window.__scenes.setFraction(0.3); window.__scenes.advance(20, 1 / 60); });
        await frames(page, 2);
        await page.screenshot({ path: testInfo.outputPath(`scenes-${theme}-${w}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  for (const theme of ['dark', 'light']) {
    test(`cada escena en cuatro instantes (${theme})`, async ({ page, gotoTestPage }, testInfo) => {
      await open(page, gotoTestPage, { viewport: { width: 1440, height: 900 } });
      if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
      for (const f of FRACTIONS) {
        await page.evaluate((x) => { window.__scenes.setFraction(x); window.__scenes.advance(12, 1 / 60); }, f);
        await frames(page, 1);
        for (const key of KEYS) {
          await page.getByTestId(`demo-card-${key}`).screenshot({ path: testInfo.outputPath(`${key}-${theme}-${Math.round(f * 100)}.png`) });
        }
      }
    });
  }

  test('móvil 390: escenas estrechas sin desbordamiento', async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage, { viewport: { width: 390, height: 844 } });
    await page.evaluate(() => { window.__scenes.setFraction(0.35); window.__scenes.advance(10, 1 / 60); });
    await frames(page, 2);
    await page.screenshot({ path: testInfo.outputPath('scenes-dark-390.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const key of KEYS) {
      await page.getByTestId(`demo-card-${key}`).screenshot({ path: testInfo.outputPath(`${key}-390.png`) });
    }
  });
});

test.describe('estructura y accesibilidad', () => {
  test('cada escena es una imagen SVG con nombre y resumen textual en español', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    for (const key of KEYS) {
      const svg = page.getByTestId(`sc-demo-${key}`);
      await expect(svg).toHaveAttribute('role', 'img');
      await expect(svg).toHaveClass(/\bsc-root\b/);
      await expect(svg).toHaveAttribute('aria-label', /^Escena .+\. .{20,}/);
      const sumId = await svg.getAttribute('aria-describedby');
      const summary = page.locator(`[id="${sumId}"]`);
      await expect(summary).toHaveAttribute('data-testid', `sc-demo-${key}-summary`);
      const text = await summary.textContent();
      expect(text.length).toBeGreaterThan(30);
      expect(text).not.toMatch(/NaN|undefined|Infinity|\d,\d/);
      // el resumen no es una región viva por defecto (nunca se anuncia cada frame)
      await expect(summary).not.toHaveAttribute('aria-live', /.+/);
    }
  });

  test('los colores salen de los tokens y siguen al tema', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const read = () => page.evaluate(() => {
      const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      const rgb = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
      const mass = document.querySelector('[data-testid="sc-demo-mass"] .sc-mass');
      const demand = document.querySelector('[data-testid="sc-demo-market-telarana"] .sc-curve--out');
      const infected = document.querySelector('[data-testid="sc-demo-sir"] .sc-pop--i');
      const out = {
        massStroke: getComputedStyle(mass).stroke, cOut: rgb(css('--c-out')),
        demand: getComputedStyle(demand).stroke,
        infected: getComputedStyle(infected).fill, cPole: rgb(css('--c-pole')),
        bg: getComputedStyle(document.querySelector('[data-testid="sc-demo-rlc"]')).backgroundColor, plot: rgb(css('--c-plot-bg')),
      };
      probe.remove();
      return out;
    });
    const dark = await read();
    expect(dark.massStroke).toBe(dark.cOut);
    expect(dark.demand).toBe(dark.cOut);
    expect(dark.infected).toBe(dark.cPole);
    expect(dark.bg).toBe(dark.plot);
    await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    // los puntos de la rejilla funden su color (transición corta): se espera a que terminen
    await expect.poll(async () => { const l = await read(); return l.infected === l.cPole; }, { timeout: 3000 }).toBe(true);
    const light = await read();
    expect(light.massStroke).toBe(light.cOut);
    expect(light.infected).toBe(light.cPole);
    expect(light.bg).toBe(light.plot);
    expect(light.cOut).not.toBe(dark.cOut);
  });

  // estrecho: 320 px de ancho (la tarjeta en un móvil de 390 px); la altura la fija .sc-stage (proporción 16/10 con alto mínimo de 260 px)
  for (const [label, width] of [['ancho', null], ['estrecho 320 px', 320]]) {
    test(`textos sin solapes ni recortes (${label})`, async ({ page, gotoTestPage }) => {
      await open(page, gotoTestPage, { viewport: { width: 1440, height: 900 } });
      if (width) {
        await page.addStyleTag({ content: `.sc-stage { width: ${width}px; }` });
        await frames(page, 3);
      }
      const problems = [];
      for (const f of FRACTIONS) {
        await page.evaluate((x) => { window.__scenes.setFraction(x); window.__scenes.advance(6, 1 / 60); }, f);
        await frames(page, 2);
        for (const key of KEYS) {
          for (const p of await textProblems(page, key)) problems.push(`${key} @${f}: ${p}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test('el SVG sigue al tamaño del contenedor (caja de vista en píxeles CSS)', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const check = () => page.evaluate(() => [...document.querySelectorAll('.sc-stage')].map((st) => {
      const svg = st.querySelector('svg.sc-root');
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      return [Math.abs(vb[2] - st.clientWidth) < 1, Math.abs(vb[3] - st.clientHeight) < 1];
    }));
    for (const ok of await check()) expect(ok).toEqual([true, true]);
    await page.setViewportSize({ width: 800, height: 900 });
    await frames(page, 4);
    for (const ok of await check()) expect(ok).toEqual([true, true]);
  });
});

test.describe('movimiento', () => {
  test('sin movimiento reducido, puntos de corriente, partículas y superficie se mueven en el mismo instante', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.evaluate(() => window.__scenes.setFraction(0.3));
    const a = await snapshot(page);
    await page.evaluate(() => window.__scenes.hold(30, 1 / 60));
    const b = await snapshot(page);
    expect(b.dots).not.toEqual(a.dots);
    expect(b.particles).not.toEqual(a.particles);
    expect(b.surface).not.toEqual(a.surface);
    expect(b.mass).toEqual(a.mass);          // el estado no cambia: la masa no se mueve
  });

  test('movimiento reducido: nada decorativo se mueve y el estado se sigue mostrando', async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage, { reducedMotion: true });
    expect(await page.evaluate(() => window.DSL.prefs.reducedMotion)).toBe(true);
    await page.evaluate(() => window.__scenes.setFraction(0.3));
    const a = await snapshot(page);
    await page.evaluate(() => window.__scenes.hold(30, 1 / 60));
    const b = await snapshot(page);
    expect(b).toEqual(a);
    // el estado sí cambia: otra fracción mueve la masa y el nivel
    await page.evaluate(() => window.__scenes.setFraction(0.6));
    const c = await snapshot(page);
    expect(c.mass).not.toEqual(a.mass);
    expect(c.liquid).not.toEqual(a.liquid);
    // la corriente sigue indicando su sentido con la flecha (instante con corriente apreciable)
    await page.evaluate(() => window.__scenes.setFraction(0.12));
    await expect(page.locator('[data-testid="sc-demo-rlc"] g.sc-arrow--zero[visibility="visible"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="sc-demo-rlc"] g.sc-arrow--zero')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('scenes-reduced.png'), fullPage: true });
  });

  test('reproducción continua sin errores; el resumen cambia', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    await page.evaluate(() => window.__scenes.setFraction(0));
    const before = await page.getByTestId('demo-live-mass').textContent();
    await page.getByTestId('demo-play').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('demo-theme').click();
    await page.waitForTimeout(300);
    await page.getByTestId('demo-play').click();
    const after = await page.getByTestId('demo-live-mass').textContent();
    expect(after).not.toBe(before);
  });
});

test.describe('catálogo real (DSL.systems)', () => {
  const REAL = ['mass', 'tank-lineal', 'tank-torricelli', 'tank-cascada', 'rlc', 'sir', 'sir-u', 'market-telarana', 'market-walras'];

  test('cada modelo del catálogo se ve con sus valores por defecto: resumen válido y textos sin solapes', async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage, { viewport: { width: 1440, height: 900 } });
    const keys = await page.evaluate(() => window.__scenes.real.cases.map((c) => c.key));
    expect(keys).toEqual(REAL);
    const problems = [];
    for (const f of [0, 0.04, 0.15, 0.4, 1]) {
      await page.evaluate((x) => window.__scenes.real.setFraction(x), f);
      await frames(page, 1);
      for (const key of REAL) {
        for (const p of await textProblems(page, key, 'sc-real-')) problems.push(`${key} @${f}: ${p}`);
        const sum = await page.getByTestId(`sc-real-${key}-summary`).textContent();
        if (/NaN|undefined|Infinity|\d,\d/.test(sum) || sum.length < 30) problems.push(`${key} @${f}: resumen «${sum}»`);
      }
    }
    expect(problems).toEqual([]);
    // Torricelli: la entrada del catálogo es Δq sobre q_in0 = 0.03 m³/s (escalón de 0.01 en t = 5 s)
    await page.evaluate(() => window.__scenes.real.setFraction(1));
    await expect(page.getByTestId('sc-real-tank-torricelli-summary')).toContainText('Entra q_in = 0.04');
    // SIR con distanciamiento: la tasa mostrada es la efectiva β(1 − u)·S·I/N
    await expect(page.getByTestId('sc-real-sir-u-summary')).toContainText('con distanciamiento u = 50');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
      await page.evaluate(() => window.__scenes.real.setFraction(0.3));
      await frames(page, 2);
      for (const key of REAL) {
        await page.getByTestId(`real-card-${key}`).screenshot({ path: testInfo.outputPath(`real-${key}-${theme}.png`) });
      }
    }
  });

  test('catálogo real en un móvil de 390 px', async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage, { viewport: { width: 390, height: 844 } });
    const problems = [];
    for (const f of [0.04, 0.3, 1]) {
      await page.evaluate((x) => window.__scenes.real.setFraction(x), f);
      await frames(page, 1);
      for (const key of REAL) {
        for (const p of await textProblems(page, key, 'sc-real-')) problems.push(`${key} @${f}: ${p}`);
      }
    }
    expect(problems).toEqual([]);
    await page.evaluate(() => window.__scenes.real.setFraction(0.3));
    await frames(page, 2);
    for (const key of REAL) {
      await page.getByTestId(`real-card-${key}`).screenshot({ path: testInfo.outputPath(`real-${key}-390.png`) });
    }
  });
});

/* ------------------------------------------------------------------ casos límite (SCN-01, SCN-02) */

/** Cajas (pantalla) de una escena de mercado: lecturas con su ranura, etiquetas del cuadro, resto de textos, cuadro P–Q y telaraña. */
async function marketLayout(page, testid) {
  return page.evaluate((id) => {
    const svg = document.querySelector(`[data-testid="${id}"]`);
    const sb = svg.getBoundingClientRect();
    const shown = (n) => getComputedStyle(n).visibility !== 'hidden' && n.textContent.trim() !== '';
    const box = (n) => { const r = n.getBoundingClientRect(); return { t: n.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
    const texts = [...svg.querySelectorAll('text')].filter(shown);
    const strip = texts.filter((n) => n.classList.contains('sc-readout')).map((n) => {
      const [s0, s1] = n.getAttribute('data-slot').split(' ').map(Number);
      return { ...box(n), s0: sb.left + s0, s1: sb.left + s1 };
    });
    const labels = texts.filter((n) => n.classList.contains('sc-plot-label')).map(box);
    const others = texts.filter((n) => !n.classList.contains('sc-readout') && !n.classList.contains('sc-plot-label')).map(box);
    const cobweb = [...svg.querySelectorAll('.sc-cobweb')].filter((n) => n.getAttribute('visibility') === 'visible').map(box);
    const web = svg.querySelector('.sc-cobweb-g');
    const dot = svg.querySelector('.sc-price-dot--state');
    return {
      svg: { x0: sb.left, y0: sb.top, x1: sb.right, y1: sb.bottom },
      frame: box(svg.querySelector('.sc-ground')),          // ejes «M x0 y0 V y1 H x1»: el rectángulo del cuadro
      strip, labels, others, cobweb,
      web: web ? box(web) : null,                              // grupo entero de la telaraña (también los tramos ocultos)
      dot: dot && dot.getAttribute('visibility') !== 'hidden' ? box(dot) : null,
      seps: svg.querySelectorAll('.sc-strip-sep').length,
    };
  }, testid);
}

/** Lecturas fuera de su ranura, choques entre lecturas/etiquetas (y con cualquier otro texto) y trazos fuera del cuadro. */
function layoutProblems(L) {
  const out = [];
  const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
  const inside = (b, r) => b.x0 >= r.x0 - 0.5 && b.x1 <= r.x1 + 0.5 && b.y0 >= r.y0 - 0.5 && b.y1 <= r.y1 + 0.5;
  for (const s of L.strip) {
    if (s.x0 < s.s0 - 0.5 || s.x1 > s.s1 + 0.5) out.push(`lectura fuera de su ranura: «${s.t}» [${s.x0.toFixed(1)}, ${s.x1.toFixed(1)}] ⊄ [${s.s0.toFixed(1)}, ${s.s1.toFixed(1)}]`);
  }
  const ours = [...L.strip, ...L.labels];
  for (let i = 0; i < ours.length; i++) for (let j = i + 1; j < ours.length; j++) if (hit(ours[i], ours[j])) out.push(`choque: «${ours[i].t}» / «${ours[j].t}»`);
  for (const a of ours) for (const b of L.others) if (hit(a, b)) out.push(`choque: «${a.t}» / «${b.t}»`);
  for (const a of [...ours, ...L.others]) if (!inside(a, L.svg)) out.push(`fuera del lienzo: «${a.t}»`);
  for (const a of L.labels) if (!inside(a, L.frame)) out.push(`etiqueta fuera del cuadro: «${a.t}»`);
  for (const c of L.cobweb) if (!inside(c, L.frame)) out.push(`telaraña fuera del cuadro: [${c.x0.toFixed(1)}, ${c.y0.toFixed(1)}, ${c.x1.toFixed(1)}, ${c.y1.toFixed(1)}]`);
  if (L.web && !inside(L.web, L.frame)) out.push(`caja de la telaraña fuera del cuadro: [${L.web.x0.toFixed(1)}, ${L.web.y0.toFixed(1)}, ${L.web.x1.toFixed(1)}, ${L.web.y1.toFixed(1)}]`);
  if (L.dot) {
    const cx = (L.dot.x0 + L.dot.x1) / 2;
    const cy = (L.dot.y0 + L.dot.y1) / 2;
    if (!inside({ x0: cx, x1: cx, y0: cy, y1: cy }, L.frame)) out.push('punto del precio fuera del cuadro');
  }
  return out;
}

/**
 * Contraste muestreado en píxeles de los textos de una escena de tanques que caen sobre el líquido y de
 * todos sus rótulos de referencia (.sc-tag): la tinta son los píxeles que cambian al ocultar los textos,
 * el fondo es la captura sin textos en esa tinta dilatada 1 px y el color del texto es su fill calculado.
 * Devuelve, por texto, el peor cociente sobre su fondo.
 */
async function fluidLabelContrast(page, testid) {
  const svg = page.getByTestId(testid);
  await svg.scrollIntoViewIfNeeded();
  const items = await page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    const rb = root.getBoundingClientRect();
    const liquids = [...root.querySelectorAll('.sc-liquid')].map((n) => n.getBoundingClientRect()).filter((r) => r.height > 0.5);
    const meet = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    return [...root.querySelectorAll('text')]
      .filter((t) => getComputedStyle(t).visibility !== 'hidden' && t.textContent.trim() !== '')
      .map((t) => ({ t, r: t.getBoundingClientRect() }))
      .filter(({ t, r }) => t.closest('.sc-tag') || liquids.some((l) => meet(r, l)))
      .map(({ t, r }) => ({
        text: t.textContent, tag: !!t.closest('.sc-tag'), wet: liquids.some((l) => meet(r, l)),
        fill: getComputedStyle(t).fill, op: Number(getComputedStyle(t).opacity),
        x: r.left - rb.left, y: r.top - rb.top, w: r.width, h: r.height,
      }));
  }, testid);
  const shown = await svg.screenshot();
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__sc-hide-text';
    st.textContent = '.sc-root text, .sc-root tspan { fill: transparent !important; stroke: transparent !important; }';
    document.head.appendChild(st);
  });
  const hidden = await svg.screenshot();
  await page.evaluate(() => document.getElementById('__sc-hide-text').remove());
  return page.evaluate(async ({ a64, b64, list }) => {
    const load = async (b) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    };
    const A = await load(a64);
    const B = await load(b64);
    const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const W = A.width;
    const H = A.height;
    return list.map((it) => {
      const fg = it.fill.match(/[\d.]+/g).map(Number);
      const lf = lum(fg[0], fg[1], fg[2]);
      const x0 = Math.max(0, Math.floor(it.x) - 2);
      const y0 = Math.max(0, Math.floor(it.y) - 2);
      const x1 = Math.min(W - 1, Math.ceil(it.x + it.w) + 2);
      const y1 = Math.min(H - 1, Math.ceil(it.y + it.h) + 2);
      const ink = new Set();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = 4 * (y * W + x);
          if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) ink.add(y * W + x);
        }
      }
      let worst = Infinity;
      for (const p of ink) {
        const px = p % W;
        const py = (p - px) / W;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = px + dx;
            const y = py + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const i = 4 * (y * W + x);
            worst = Math.min(worst, ratio(lf, lum(B.data[i], B.data[i + 1], B.data[i + 2])));
          }
        }
      }
      return { text: it.text, tag: it.tag, wet: it.wet, op: it.op, inkPx: ink.size, ratio: Math.round(worst * 100) / 100 };
    });
  }, { a64: shown.toString('base64'), b64: hidden.toString('base64'), list: items });
}

test.describe('casos límite', () => {
  const STRESS_MARKET = ['market-divergente', 'market-origen', 'market-walras-enorme'];

  for (const [label, viewport, stage] of [['1440', { width: 1440, height: 900 }, null], ['1024', { width: 1024, height: 768 }, null], ['estrecho 320 px', { width: 1440, height: 900 }, 320]]) {
    test(`mercado (${label}): lecturas enormes y equilibrio junto al origen sin choques; la telaraña no sale del cuadro`, async ({ page, gotoTestPage }) => {
      await open(page, gotoTestPage, { viewport });
      if (stage) {
        await page.addStyleTag({ content: `.sc-stage { width: ${stage}px; }` });
        await frames(page, 3);
        await page.evaluate(() => window.__scenes.stress.render());
      }
      // valores del fotograma k = 15 de la telaraña divergente (a = 100, b = 2, c = 10, d = 4, P₀ = 40)
      await expect(page.getByTestId('sc-stress-market-divergente-summary')).toContainText('precio P = −819185');
      await expect(page.getByTestId('sc-stress-market-divergente-summary')).toContainText('demanda Qd = 1.638×10⁶, oferta Qs = −3.277×10⁶');
      const problems = [];
      for (const key of STRESS_MARKET) {
        const L = await marketLayout(page, `sc-stress-${key}`);
        for (const p of layoutProblems(L)) problems.push(`${key}: ${p}`);
        if (L.strip.length !== 4) problems.push(`${key}: ${L.strip.length} lecturas visibles`);
        if (L.seps < 1) problems.push(`${key}: sin divisores entre ranuras`);
        if (key !== 'market-walras-enorme' && L.cobweb.length === 0) problems.push(`${key}: ningún tramo de telaraña visible`);
        if (key !== 'market-walras-enorme' && L.labels.length !== 4) problems.push(`${key}: ${L.labels.length} etiquetas del cuadro (P*, Q*, Demanda, Oferta)`);
      }
      // las lecturas enormes usan la forma científica compacta, sin «.000» de relleno
      const strip = await page.evaluate(() => [...document.querySelectorAll('[data-testid="sc-stress-market-divergente"] .sc-readout')].map((n) => n.textContent));
      expect(strip).toEqual(['k = 15', 'P = −8.19×10⁵', 'Qd = 1.64×10⁶', 'Qs = −3.28×10⁶']);
      const walras = await page.evaluate(() => [...document.querySelectorAll('[data-testid="sc-stress-market-walras-enorme"] .sc-readout')].map((n) => n.textContent));
      expect(walras).toEqual(['P = −8.19×10⁵', 'Qd = 1.64×10⁶', 'Qs = −3.28×10⁶', 'Qd − Qs = +4.92×10⁶']);
      // las escenas de mercado normales tampoco chocan en ningún instante
      for (const f of FRACTIONS) {
        await page.evaluate((x) => window.__scenes.setFraction(x), f);
        await frames(page, 1);
        for (const id of ['sc-demo-market-telarana', 'sc-demo-market-walras', 'sc-real-market-telarana', 'sc-real-market-walras']) {
          for (const p of layoutProblems(await marketLayout(page, id))) problems.push(`${id} @${f}: ${p}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test('mercado: capturas de los casos límite (oscuro y claro, 1440 y 1024)', async ({ page, gotoTestPage }, testInfo) => {
    for (const [w, h] of [[1440, 900], [1024, 768]]) {
      await open(page, gotoTestPage, { viewport: { width: w, height: h } });
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
        await frames(page, 2);
        for (const key of [...STRESS_MARKET, 'tank-torricelli-lleno', 'tank-lineal-lleno', 'tank-cascada-lleno']) {
          await page.getByTestId(`stress-card-${key}`).screenshot({ path: testInfo.outputPath(`stress-${key}-${theme}-${w}.png`) });
        }
      }
    }
  });

  test('tanques: los rótulos sobre el agua mantienen 4.5:1 en ambos temas (nivel por defecto y tanque lleno)', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage, { viewport: { width: 1440, height: 900 } });
    await page.evaluate(() => document.fonts.ready);
    const TANKS = ['tank-lineal', 'tank-torricelli', 'tank-cascada'];
    const measured = [];
    const low = [];
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
      for (const f of [0.35, 1]) {
        await page.evaluate((x) => window.__scenes.setFraction(x), f);
        await frames(page, 2);
        const ids = [...TANKS.map((k) => `sc-demo-${k}`), ...TANKS.map((k) => `sc-real-${k}`), ...(f === 1 ? TANKS.map((k) => `sc-stress-${k}-lleno`) : [])];
        for (const id of ids) {
          for (const r of await fluidLabelContrast(page, id)) {
            const row = { theme, f, id, ...r };
            measured.push(row);
            if (!(r.ratio >= 4.5) || r.inkPx < 15) low.push(row);
          }
        }
      }
    }
    expect(low).toEqual([]);
    // la prueba mide de verdad rótulos sobre el agua: h₀ (catálogo y demo en f = 1) y todos los de los tanques llenos
    const wet = (id, text) => ['dark', 'light'].every((th) => measured.some((m) => m.theme === th && m.id === id && m.text === text && m.wet && m.tag));
    expect(wet('sc-demo-tank-torricelli', 'h0')).toBe(true);
    expect(wet('sc-real-tank-torricelli', 'h0')).toBe(true);
    expect(wet('sc-stress-tank-torricelli-lleno', 'h0')).toBe(true);
    expect(wet('sc-stress-tank-lineal-lleno', 'h∞')).toBe(true);
    expect(wet('sc-stress-tank-cascada-lleno', 'h1∞')).toBe(true);
    expect(wet('sc-stress-tank-cascada-lleno', 'h2∞')).toBe(true);
  });

  test('los rótulos de referencia con placa solo existen en los tanques', async ({ page, gotoTestPage }) => {
    await open(page, gotoTestPage);
    const where = await page.evaluate(() => [...document.querySelectorAll('.sc-tag')].map((n) => n.closest('svg.sc-root').getAttribute('data-testid')));
    expect(where.length).toBeGreaterThan(0);
    for (const id of where) expect(id).toMatch(/^sc-(demo|real|stress)-tank-/);
  });
});

test.describe('rendimiento', () => {
  test('coste de render() por fotograma < 2 ms (mediana y media)', TIMING, async ({ page, gotoTestPage }, testInfo) => {
    await open(page, gotoTestPage);
    // calentamiento (JIT) y medida
    await page.evaluate(() => window.__scenes.measure(60));
    const res = await page.evaluate(() => window.__scenes.measure(300));
    fs.writeFileSync(testInfo.outputPath('frame-cost.json'), JSON.stringify(res, null, 2));
    const rows = Object.entries(res).map(([k, v]) => `${k.padEnd(16)} js mediana ${v.js.median.toFixed(3)} ms · media ${v.js.mean.toFixed(3)} ms · p95 ${v.js.p95.toFixed(3)} ms · con estilo+layout mediana ${v.withLayout.median.toFixed(3)} ms`);
    testInfo.annotations.push({ type: 'coste por frame', description: rows.join('\n') });
    console.log(rows.join('\n'));
    for (const [k, v] of Object.entries(res)) {
      expect(v.js.median, k).toBeLessThan(2);
      expect(v.js.mean, k).toBeLessThan(2);
    }
  });
});

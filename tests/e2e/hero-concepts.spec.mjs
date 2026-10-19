// tests/e2e/hero-concepts.spec.mjs — Propietario: hero-concepts.
// #inicio (titular, llamadas a la acción, fondo animado que se pausa fuera de pantalla, con la pestaña
// oculta y con movimiento reducido) y #conceptos (cuatro tarjetas con figuras del motor, KaTeX,
// aparición escalonada, teclado, concepts:open). Capturas en 1440×900, 1024×768 y 820×1180 en los
// dos temas, comprobación a 390 px y variante de movimiento reducido.
// Ejecutar: npx playwright test tests/e2e/hero-concepts.spec.mjs --project=src --output "test-results/hero-concepts"
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';

const SHOTS = path.join(ROOT, 'test-results', 'hero-concepts', 'shots');
const CARDS = ['sistema', 'tiempo', 'ecuaciones', 'linealidad'];
const TITLES = {
  sistema: '¿Qué es un sistema dinámico?',
  tiempo: /^La variable independiente: el tiempo\s*t/,
  ecuaciones: 'Ecuaciones de representación',
  linealidad: 'Linealidad vs. no linealidad',
};

const heroStats = (page) => page.evaluate(() => window.DSL.app.handles.hero.stats());
const ccState = (page) => page.evaluate(() => window.DSL.app.handles.concepts.state());

/** Lleva la parte superior de un elemento justo debajo de la barra fija. */
async function scrollUnderHeader(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - header - 16);
  }, selector);
}

/** Abre la página, recorre #conceptos para que cada tarjeta se prepare y vuelve arriba. */
async function prepareCards(page) {
  for (const c of CARDS) {
    await scrollUnderHeader(page, `[data-card="${c}"]`);
    await expect.poll(async () => (await ccState(page))[c].ready).toBe(true);
  }
}

async function setNumber(page, testid, value) {
  const f = page.getByTestId(testid + '-number');
  await f.fill(String(value));
  await f.press('Enter');
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/* ====================================================================== #inicio */

test.describe('#inicio — portada', () => {
  test('estructura: un solo h1, entrada, dos llamadas a la acción y el fondo', async ({ page, gotoApp }) => {
    await gotoApp();
    const hero = page.locator('#inicio');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(hero.locator('h1#inicio-title')).toHaveText('Sistemas que cambian con el tiempo');
    await expect(page.getByTestId('hero-lead')).toContainText('Modele sistemas mecánicos, hidráulicos, eléctricos, biológicos y económicos');
    await expect(page.getByTestId('hero-lead').locator('.katex')).toHaveCount(1);
    await expect(page.getByTestId('hero-cta-galeria')).toHaveAttribute('href', '#galeria');
    await expect(page.getByTestId('hero-cta-galeria')).toHaveText('Simular un sistema');
    await expect(page.getByTestId('hero-cta-transferencia')).toHaveAttribute('href', '#transferencia');
    await expect(page.getByTestId('hero-cta-transferencia')).toHaveText(/Obtener\s+G\(s\)\s+paso a paso/);
    await expect(page.getByTestId('hero-canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('hero-caption')).toContainText('polos conjugados');
    // sin métricas inventadas: ni porcentajes ni recuentos en el texto de la portada
    const text = await hero.innerText();
    expect(text).not.toMatch(/\d+\s*%|\+\d|\d+\s*(usuarios|estudiantes|sistemas)/i);
    // la figura cabe en la primera pantalla
    const st = await heroStats(page);
    expect(st.layout.bottom).toBeLessThanOrEqual(900);
    expect(await overflow(page)).toBe(0);
  });

  test('las llamadas a la acción llevan a #galeria y a #transferencia', async ({ page, gotoApp }) => {
    // Con movimiento reducido el desplazamiento del shell es instantáneo: se mide en el mismo instante
    // del clic, antes de que las secciones intermedias (de otros módulos) cambien de altura al prepararse.
    await gotoApp('', { reducedMotion: true });
    for (const [cta, id] of [['hero-cta-galeria', 'galeria'], ['hero-cta-transferencia', 'transferencia']]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const top = await page.evaluate(([c, s]) => {
        document.querySelector(`[data-testid="${c}"]`).click();
        return Math.round(document.getElementById(s).getBoundingClientRect().top);
      }, [cta, id]);
      expect(top).toBeGreaterThanOrEqual(-1);
      expect(top).toBeLessThanOrEqual(80);
      await expect(page.locator('#' + id)).toBeFocused();
      expect(await page.evaluate(() => location.hash)).toBe('#' + id);
    }
    // con el teclado: Intro sobre el enlace
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('hero-cta-galeria').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#galeria')).toBeFocused();
  });

  test('el fondo se anima, se pausa con el teclado y se reanuda', async ({ page, gotoApp }) => {
    await gotoApp();
    await expect.poll(async () => (await heroStats(page)).draws, { timeout: 4000 }).toBeGreaterThan(5);
    const a = await heroStats(page);
    expect(a.running).toBe(true);
    const btn = page.getByTestId('hero-pause');
    await expect(btn).toHaveAttribute('aria-label', 'Pausar la animación del fondo');
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-label', 'Reproducir la animación del fondo');
    await expect(btn).toHaveAttribute('data-state', 'paused');
    const p1 = await heroStats(page);
    await page.waitForTimeout(400);
    const p2 = await heroStats(page);
    expect(p2.running).toBe(false);
    expect(p2.time).toBe(p1.time);
    await page.keyboard.press('Space');
    await expect(btn).toHaveAttribute('data-state', 'playing');
    await expect.poll(async () => (await heroStats(page)).time).toBeGreaterThan(p2.time);
    // coste de dibujo bajo
    expect((await heroStats(page)).avgDrawMs).toBeLessThan(8);
  });

  test('fuera de pantalla y con la pestaña oculta, el bucle se detiene', async ({ page, gotoApp }) => {
    await gotoApp();
    await expect.poll(async () => (await heroStats(page)).active).toBe(true);
    await page.evaluate(() => document.getElementById('transferencia').scrollIntoView());
    await expect.poll(async () => (await heroStats(page)).active).toBe(false);
    const f1 = (await heroStats(page)).frames;
    await page.waitForTimeout(400);
    expect((await heroStats(page)).frames).toBe(f1);
    // pestaña oculta
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await heroStats(page)).active).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
    const h1 = (await heroStats(page)).frames;
    await page.waitForTimeout(400);
    expect((await heroStats(page)).frames).toBe(h1);
  });

  test('movimiento reducido: fotograma fijo, sin botón de pausa', async ({ page, gotoApp }) => {
    await gotoApp('', { reducedMotion: true });
    const s1 = await heroStats(page);
    expect(s1.running).toBe(false);
    expect(s1.draws).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    const s2 = await heroStats(page);
    expect(s2.time).toBe(s1.time);
    await expect(page.getByTestId('hero-pause')).toBeHidden();
  });

  test('al cambiar de tema el fondo se vuelve a dibujar', async ({ page, gotoApp }) => {
    await gotoApp();
    await page.evaluate(() => window.DSL.app.handles.hero.pause());
    const d1 = (await heroStats(page)).draws;
    await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(async () => (await heroStats(page)).draws).toBeGreaterThan(d1);
  });
});

/* ====================================================================== #conceptos */

test.describe('#conceptos — conceptos fundamentales', () => {
  test('estructura, títulos exactos, KaTeX sin respaldo y preparación perezosa', async ({ page, gotoApp }) => {
    await gotoApp();
    await expect(page.locator('h2#conceptos-title')).toHaveText('Conceptos fundamentales');
    const st0 = await ccState(page);
    expect(st0.ecuaciones.ready).toBe(false);
    expect(st0.linealidad.ready).toBe(false);
    await expect(page.locator('#conceptos .cc-card')).toHaveCount(4);
    for (const c of CARDS) {
      await expect(page.locator(`[data-card="${c}"] h3`)).toHaveText(TITLES[c]);
    }
    await prepareCards(page);
    await page.getByTestId('cc-lin-tabs-metodos').click();
    await expect.poll(async () => (await ccState(page)).linealidad.methods !== null).toBe(true);
    expect(await page.locator('#conceptos .katex').count()).toBeGreaterThan(30);
    await expect(page.locator('#conceptos .tex-fallback, #inicio .tex-fallback')).toHaveCount(0);
    // cada ecuación en bloque está renderizada
    for (const id of ['cc-sys-eq', 'cc-time-eq', 'cc-eq-cont', 'cc-eq-disc', 'cc-eq-num', 'cc-sup-eq', 'cc-num-eq']) {
      await expect(page.getByTestId(id).locator('.katex').first(), id).toBeVisible({ visible: id !== 'cc-sup-eq' });
    }
  });

  test('aparición escalonada al entrar en pantalla', async ({ page, gotoApp }) => {
    await gotoApp();
    const cards = page.locator('#conceptos .cc-card');
    await expect(cards.first()).toHaveClass(/ds-reveal/);
    await expect(cards.first()).not.toHaveClass(/is-revealed/);
    const delays = await cards.evaluateAll((els) => els.map((e) => e.style.getPropertyValue('--reveal-delay')));
    expect(delays).toEqual(['0ms', '90ms', '180ms', '270ms']);
    await scrollUnderHeader(page, '#conceptos');
    for (let i = 0; i < 4; i++) await expect(cards.nth(i)).toHaveClass(/is-revealed/);
  });

  test('a: el conmutador de realimentación cierra el lazo (teclado) y recalcula con DSL.core.tf', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="sistema"]');
    await expect.poll(async () => (await ccState(page)).sistema.ready).toBe(true);
    await expect(page.getByTestId('cc-sys-final-value')).toHaveText('1');
    await expect(page.getByTestId('cc-bd')).toHaveAttribute('data-loop', 'open');
    const sw = page.getByTestId('cc-sys-feedback');
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('cc-bd')).toHaveAttribute('data-loop', 'closed');
    await expect(page.getByTestId('cc-sys-final-value')).toHaveText('0.75');
    const st = (await ccState(page)).sistema;
    const ref = await page.evaluate(() => new window.DSL.core.tf.TransferFunction([6], [1, 1.2, 8]).stepInfo());
    expect(st.final).toBeCloseTo(ref.finalValue, 12);
    expect(st.overshoot).toBeCloseTo(ref.overshootPct, 9);
    expect(st.settling).toBeCloseTo(ref.settlingTime, 9);
    await expect(page.getByTestId('cc-sys-eq')).toHaveAttribute('data-tex', /K\\,\\bigl\(r - y\(t\)\\bigr\)/);
    await expect(page.getByTestId('ds-live')).toContainText('Lazo cerrado', { timeout: 3000 });
    // reproducir/pausar
    const play = page.getByTestId('cc-sys-play');
    await expect(play).toHaveAttribute('data-state', 'playing');
    await play.focus();
    await page.keyboard.press('Enter');
    await expect(play).toHaveAttribute('data-state', 'paused');
  });

  test('b: el tiempo t se recorre con el teclado y el estado coincide con RK45', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="tiempo"]');
    await expect.poll(async () => (await ccState(page)).tiempo.ready).toBe(true);
    const play = page.getByTestId('cc-time-play');
    await play.focus();
    if ((await play.getAttribute('data-state')) === 'playing') await page.keyboard.press('Enter');
    await expect(play).toHaveAttribute('data-state', 'paused');
    const range = page.getByTestId('cc-time-t').locator('input[type="range"]');
    await range.focus();
    await page.keyboard.press('End');
    await expect.poll(async () => (await ccState(page)).tiempo.t).toBeCloseTo(10, 9);
    await page.keyboard.press('Home');
    await expect.poll(async () => (await ccState(page)).tiempo.t).toBe(0);
    await setNumber(page, 'cc-time-t', '2,5');
    await expect.poll(async () => (await ccState(page)).tiempo.t).toBeCloseTo(2.5, 9);
    const st = (await ccState(page)).tiempo;
    const ref = await page.evaluate(() => {
      const H = window.DSL.sections.concepts.helpers;
      const o = H.oscillator();
      return { x: H.sampleUniform(o.x, 10, 2.5), v: H.sampleUniform(o.v, 10, 2.5) };
    });
    expect(st.x).toBe(ref.x);
    expect(st.v).toBe(ref.v);
    await expect(page.getByTestId('cc-time-canvas')).toHaveAttribute('aria-label', /t = 2\.5\s*s/);
  });

  test('c: aT decide el veredicto; la secuencia admite tallos y escalera', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="ecuaciones"]');
    await expect.poll(async () => (await ccState(page)).ecuaciones.ready).toBe(true);
    await expect(page.getByTestId('cc-eq-verdict')).toHaveAttribute('data-tone', 'success');
    await setNumber(page, 'cc-eq-T', '2,4');
    await expect(page.getByTestId('cc-eq-verdict')).toHaveAttribute('data-tone', 'danger');
    await expect(page.getByTestId('cc-eq-verdict')).toContainText('Diverge');
    let st = (await ccState(page)).ecuaciones;
    expect(st.verdict).toBe('diverge');
    expect(st.truncated).toBe(true);
    await setNumber(page, 'cc-eq-T', '1');
    await expect.poll(async () => (await ccState(page)).ecuaciones.verdict).toBe('unpaso');
    await setNumber(page, 'cc-eq-T', '1.5');
    await expect.poll(async () => (await ccState(page)).ecuaciones.verdict).toBe('oscilante');
    await expect(page.getByTestId('cc-eq-z-value')).toHaveText('−0.5');
    await page.getByTestId('cc-eq-view-tallos').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('cc-eq-view-escalera')).toHaveAttribute('aria-checked', 'true');
    st = (await ccState(page)).ecuaciones;
    expect(st.view).toBe('escalera');
    await expect(page.getByTestId('cc-eq-chart')).toBeVisible();
  });

  test('d (i): superposición exacta en el depósito lineal y rota en el de Torricelli', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="linealidad"]');
    await expect.poll(async () => (await ccState(page)).linealidad.superposition !== null).toBe(true);
    let sup = (await ccState(page)).linealidad.superposition;
    expect(sup.variant).toBe('torricelli');
    expect(sup.relMismatch).toBeGreaterThan(0.01);
    await expect(page.getByTestId('cc-sup-verdict')).toHaveAttribute('data-tone', 'warning');
    await page.getByTestId('cc-sup-system-lineal').click();
    await expect.poll(async () => (await ccState(page)).linealidad.superposition.variant).toBe('lineal');
    sup = (await ccState(page)).linealidad.superposition;
    expect(sup.maxMismatch).toBeLessThan(1e-12);
    expect(sup.maxProp).toBeLessThan(1e-12);
    await expect(page.getByTestId('cc-sup-verdict')).toHaveAttribute('data-tone', 'success');
    await expect(page.getByTestId('cc-sup-eq')).toHaveAttribute('data-tex', /\\frac\{h\}\{R\}/);
  });

  test('d (ii): pestañas con el teclado; errores reales de Euler, Heun y RK4 frente a RK45', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="linealidad"]');
    await expect.poll(async () => (await ccState(page)).linealidad.ready).toBe(true);
    const tab1 = page.getByTestId('cc-lin-tabs-superposicion');
    await tab1.focus();
    await page.keyboard.press('ArrowRight');
    const tab2 = page.getByTestId('cc-lin-tabs-metodos');
    await expect(tab2).toBeFocused();
    await expect(tab2).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cc-panel-metodos')).toBeVisible();
    await expect.poll(async () => (await ccState(page)).linealidad.methods !== null).toBe(true);

    async function check(h, deg) {
      const got = (await ccState(page)).linealidad.methods;
      expect(got.h).toBeCloseTo(h, 12);
      const ref = await page.evaluate(([hh, d]) => window.DSL.sections.concepts.helpers.methodsComparison(hh, d * Math.PI / 180)
        .methods.map((m) => ({ id: m.id, maxErr: m.maxErr, fevals: m.fevals, order: m.order })), [h, deg]);
      expect(got.rows.map((r) => ({ id: r.id, maxErr: r.maxErr, fevals: r.fevals, order: r.order }))).toEqual(ref);
      return got.rows;
    }
    let rows = await check(0.1, 80);
    expect(rows[0].maxErr).toBeGreaterThan(rows[1].maxErr);
    expect(rows[1].maxErr).toBeGreaterThan(rows[2].maxErr);
    await expect(page.getByTestId('cc-num-fevals-rk4')).toHaveText('400');

    await setNumber(page, 'cc-num-h', '0,02');
    await setNumber(page, 'cc-num-theta0', '30');
    await expect.poll(async () => (await ccState(page)).linealidad.methods.theta0).toBeCloseTo(30 * Math.PI / 180, 12);
    rows = await check(0.02, 30);
    expect(rows[0].maxErr).toBeGreaterThan(rows[1].maxErr);
    expect(rows[1].maxErr).toBeGreaterThan(rows[2].maxErr);
    expect(rows[1].order).toBeGreaterThan(1.8);
    expect(rows[1].order).toBeLessThan(2.2);
    expect(rows[2].order).toBeGreaterThan(3.6);
    await expect(page.getByTestId('cc-num-fevals-euler')).toHaveText('500');
    await expect(page.getByTestId('cc-num-table').locator('.katex')).toHaveCount(3);
  });

  test('concepts:open abre la tarjeta y la pestaña, la resalta y le da el foco', async ({ page, gotoApp }) => {
    await gotoApp();
    await page.evaluate(() => window.DSL.bus.emit('concepts:open', { card: 'linealidad', tab: 'metodos' }));
    await expect(page.getByTestId('cc-lin-tabs-metodos')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cc-lin-tabs-metodos')).toBeFocused();
    await expect(page.getByTestId('cc-card-linealidad')).toHaveClass(/is-highlight/);
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('[data-card="linealidad"]').getBoundingClientRect().top)), { timeout: 4000 })
      .toBeLessThan(140);
    await expect(page.getByTestId('cc-card-linealidad')).not.toHaveClass(/is-highlight/, { timeout: 4000 });
    await page.evaluate(() => window.DSL.bus.emit('concepts:open', { card: 'ecuaciones' }));
    await expect(page.getByTestId('cc-card-ecuaciones')).toBeFocused();
    await expect(page.getByTestId('cc-card-ecuaciones')).toHaveClass(/is-highlight/);
  });

  test('movimiento reducido: estados finales, sin animación de entrada', async ({ page, gotoApp }) => {
    await gotoApp('', { reducedMotion: true });
    await prepareCards(page);
    const st = await ccState(page);
    expect(st.sistema.playing).toBe(false);
    expect(st.sistema.tau).toBe(10);
    expect(st.tiempo.playing).toBe(false);
    expect(st.tiempo.t).toBe(10);
    const op = await page.locator('#conceptos .cc-card').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    expect(op).toEqual(['1', '1', '1', '1']);
    await page.getByTestId('cc-sys-feedback').click();
    await expect.poll(async () => (await ccState(page)).sistema.closed).toBe(true);
    expect((await ccState(page)).sistema.playing).toBe(false);
    await scrollUnderHeader(page, '[data-card="sistema"]');
    await page.screenshot({ path: path.join(SHOTS, 'reduced-sistema-1440-dark.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, 'reduced-hero-1440-dark.png') });
  });
});

/* ====================================================================== capturas */

const VIEWPORTS = [[1440, 900], [1024, 768], [820, 1180]];

for (const [w, h] of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    test(`capturas ${w}×${h} ${theme}`, async ({ page, gotoApp }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: theme });
      await gotoApp();
      await page.evaluate((t) => window.DSL.prefs.setTheme(t, { persist: false }), theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      expect(await overflow(page)).toBe(0);
      await page.screenshot({ path: path.join(SHOTS, `hero-${w}-${theme}.png`) });
      for (const c of CARDS) {
        await scrollUnderHeader(page, `[data-card="${c}"]`);
        await expect.poll(async () => (await ccState(page))[c].ready).toBe(true);
        await page.waitForTimeout(c === 'sistema' ? 1400 : 700);
        expect(await overflow(page)).toBe(0);
        await page.screenshot({ path: path.join(SHOTS, `concepts-${c}-${w}-${theme}.png`) });
      }
      await page.getByTestId('cc-lin-tabs-metodos').click();
      await scrollUnderHeader(page, '[data-testid="cc-lin-tabs"]');
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, `concepts-metodos-${w}-${theme}.png`) });
      expect(await overflow(page)).toBe(0);
    });
  }
}

test('teléfono 390: sin desbordamiento horizontal y titular en dos líneas', async ({ page, gotoApp }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  const lines = await page.locator('h1#inicio-title').evaluate((el) => {
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return Math.round(el.getBoundingClientRect().height / lh);
  });
  expect(lines).toBe(2);
  expect(await overflow(page)).toBe(0);
  await page.screenshot({ path: path.join(SHOTS, 'hero-390-dark.png') });
  // ninguna ecuación en bloque necesita desplazamiento horizontal a 390 px
  const mathOverflow = () => page.evaluate(() => Array.from(document.querySelectorAll('#conceptos .cc-eq'))
    .filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map((e) => e.getAttribute('data-testid')));
  await prepareCards(page);
  expect(await mathOverflow()).toEqual([]);
  await page.getByTestId('cc-sys-feedback').click();
  await page.getByTestId('cc-sup-system-lineal').click();
  await page.waitForTimeout(200);
  expect(await mathOverflow()).toEqual([]);
  await page.getByTestId('cc-lin-tabs-metodos').click();
  await page.waitForTimeout(300);
  expect(await mathOverflow()).toEqual([]);
  expect(await overflow(page)).toBe(0);
  for (const c of CARDS) {
    await scrollUnderHeader(page, `[data-card="${c}"]`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `concepts-${c}-390-dark.png`) });
  }
  // ningún bloque de la sección es más ancho que su tarjeta
  const wide = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#conceptos .cc-card').forEach((card) => {
      const r = card.getBoundingClientRect();
      card.querySelectorAll('canvas, .cc-bd, .ds-slider, .ds-readout, .ds-callout').forEach((n) => {
        const b = n.getBoundingClientRect();
        if (b.width > 0 && (b.left < r.left - 1 || b.right > r.right + 1)) out.push(n.className || n.tagName);
      });
    });
    return out;
  });
  expect(wide).toEqual([]);
});

/* ====================================================================== regresiones de la auditoría (HC-01…HC-12) */

const NEUTRAL_SUP = 'Con una entrada nula la prueba es trivial: elija dos entradas distintas de cero.';
const ccStats = (page) => page.evaluate(() => window.DSL.app.handles.concepts.stats());
const RAW_TEX = /\\[a-zA-Z]+|[_^]\{/;

/** Datos de una gráfica de Chart.js por el data-testid de su lienzo. */
function chartData(page, testid) {
  return page.evaluate((tid) => {
    const ch = window.Chart.getChart(document.querySelector(`canvas[data-testid="${tid}"]`));
    const x = ch.scales.x;
    const a = ch.chartArea;
    const lastX = Math.max(...ch.data.datasets.flatMap((d) => d.data.map((p) => p.x)));
    return {
      min: x.min, max: x.max,
      lastRel: (a.right - x.getPixelForValue(lastX)) / (a.right - a.left),
      sets: ch.data.datasets.map((d) => ({ label: d.label, dash: d.borderDash, fill: d.fill })),
    };
  }, testid);
}

/** Altura de cada tarjeta y hueco vacío bajo su último hijo visible (px). */
function cardBoxes(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#conceptos .cc-card')).map((c) => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const inner = r.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
    let maxB = -Infinity;
    c.querySelectorAll('*').forEach((e) => {
      if (e.children.length && !['CANVAS', 'svg', 'BUTTON'].includes(e.tagName) && !e.classList.contains('katex')) return;
      const b = e.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) maxB = Math.max(maxB, b.bottom);
    });
    return { card: c.dataset.card, h: r.height, w: r.width, left: r.left, top: r.top, gap: inner - maxB, lazy: c.dataset.lazy };
  }));
}

/** Contraste (WCAG) del texto de un elemento sobre su fondo real: el texto se oculta y se muestrea la captura. */
async function pixelContrast(page, selector) {
  const el = page.locator(selector).first();
  const box = await el.boundingBox();
  const fg = await el.evaluate((n) => getComputedStyle(n).color);
  const style = await page.addStyleTag({ content: `${selector}, ${selector} * { color: transparent !important; -webkit-text-fill-color: transparent !important; }` });
  const png = await page.screenshot({ clip: box });
  await style.evaluate((n) => n.remove());
  return page.evaluate(async ({ b64, fg }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ls = [];
    for (let i = 0; i < d.length; i += 4) ls.push(L(d[i], d[i + 1], d[i + 2]));
    ls.sort((a, b) => a - b);
    const m = fg.match(/rgba?\(([^)]+)\)/)[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const lf = L(m[0], m[1], m[2]);
    const cr = (bg) => (Math.max(lf, bg) + 0.05) / (Math.min(lf, bg) + 0.05);
    return Math.min(cr(ls[Math.floor(ls.length * 0.1)]), cr(ls[Math.floor(ls.length * 0.9)]));
  }, { b64: png.toString('base64'), fg });
}

test.describe('#conceptos — regresiones de la auditoría', () => {
  test('HC-01: orden observado contra una referencia rk45 1e-13; «—» cuando el error está en el nivel de la referencia', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await gotoApp();
    // Reglas puras: referencia rk45 (1e-13 / 1e-15) y su error estimado |ref(1e-13) − ref(1e-12)|.
    const pure = await page.evaluate(() => {
      const H = window.DSL.sections.concepts.helpers;
      const P = H.constants.PEND;
      const out = { pend: [P.refRtol, P.refAtol, P.estRtol, P.refFactor], cases: [] };
      for (const deg of [10, 30, 80, 150, 170]) {
        for (const h of [0.005, 0.01, 0.02, 0.1, 0.3]) {
          const th = deg * Math.PI / 180;
          const r = H.methodsComparison(h, th);
          out.cases.push({ deg, h, floor: r.orderFloor, refErr: H.pendulumReference(th).error, refError: r.refError,
            rows: r.methods.map((m) => ({ id: m.id, order: m.order, note: m.orderNote, e1: m.maxErr, e2: m.halfErr })) });
        }
      }
      out.rule = [H.observedOrder(1e-3, 1e-4, 1e-9), H.observedOrder(1e-3, 1e-4, 1e-3), H.observedOrder(1e-6, 1e-5, 1e-9), H.observedOrder(NaN, 1e-5, 1e-9)];
      return out;
    });
    expect(pure.pend).toEqual([1e-13, 1e-15, 1e-12, 100]);
    expect(pure.rule[0].order).toBeCloseTo(Math.log2(10), 12);
    expect(pure.rule.slice(1).map((r) => [r.order, r.note])).toEqual([[null, 'ref'], [null, 'growth'], [null, 'nofinite']]);
    for (const c of pure.cases) {
      expect(c.refErr).toBeGreaterThan(0);
      expect(c.refError).toBe(c.refErr);
      expect(c.floor / c.refErr).toBeCloseTo(100, 9);
      for (const r of c.rows) {
        const tag = `${r.id} θ0=${c.deg}° h=${c.h}`;
        if (r.order === null) {
          expect(['ref', 'growth', 'nofinite'], tag).toContain(r.note);
          if (r.note === 'ref') expect(Math.min(r.e1, r.e2), tag).toBeLessThanOrEqual(c.floor);
          if (r.note === 'growth') expect(r.e2, tag).toBeGreaterThan(r.e1);
        } else {
          // se muestra solo si los dos errores superan 100× el error de la referencia y el error no crece con h/2
          expect(r.e1, tag).toBeGreaterThan(c.floor);
          expect(r.e2, tag).toBeGreaterThan(c.floor);
          expect(r.order, tag).toBeGreaterThanOrEqual(0);
          expect(r.order, tag).toBeCloseTo(Math.log2(r.e1 / r.e2), 12);
        }
      }
    }
    // Con h pequeño y un ángulo moderado los órdenes son los teóricos.
    const small = pure.cases.find((c) => c.deg === 30 && c.h === 0.005).rows;
    small.forEach((r, i) => expect(Math.abs(r.order - [1, 2, 4][i]), r.id).toBeLessThanOrEqual(0.35));

    // En la tabla: θ0 = 80°, h = 0.005 → RK4 «—» con su motivo; Euler y Heun cerca de 1 y 2.
    await scrollUnderHeader(page, '[data-card="linealidad"]');
    await expect.poll(async () => (await ccState(page)).linealidad.ready).toBe(true);
    await page.getByTestId('cc-lin-tabs-metodos').click();
    await expect(page.getByTestId('cc-panel-metodos')).toContainText('Se acerca al orden teórico solo cuando h es pequeño');
    await setNumber(page, 'cc-num-h', '0,005');
    await expect.poll(async () => (await ccState(page)).linealidad.methods.h, { timeout: 10_000 }).toBeCloseTo(0.005, 12);
    const met = (await ccState(page)).linealidad.methods;
    expect(met.refError).toBeGreaterThan(0);
    const [eu, he, rk] = met.rows;
    expect(Math.abs(eu.order - 1)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(he.order - 2)).toBeLessThanOrEqual(0.35);
    expect(rk.order).toBeNull();
    expect(rk.orderNote).toBe('ref');
    await expect(page.getByTestId('cc-num-order-rk4')).toContainText('—');
    await expect(page.getByTestId('cc-num-order-rk4').locator('.cc-num-why')).toHaveText('error en el nivel de la referencia');
    await expect(page.getByTestId('cc-num-order-euler').locator('.cc-num-why')).toHaveCount(0);
    await expect(page.getByTestId('cc-num-referr')).not.toHaveText('');
    // Ningún orden mostrado es negativo.
    for (const s of await page.locator('[data-testid^="cc-num-order-"]').allInnerTexts()) expect(s).not.toMatch(/^[−-]/);
  });

  test('HC-02: con una entrada nula la superposición da un aviso neutro', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="linealidad"]');
    await expect.poll(async () => (await ccState(page)).linealidad.superposition !== null).toBe(true);
    const verdict = page.getByTestId('cc-sup-verdict');
    await expect(verdict).toHaveAttribute('data-tone', 'warning');
    await expect(verdict).toContainText('No se cumplen');
    const u1 = page.getByTestId('cc-sup-u1').locator('input[type="range"]');
    const u2 = page.getByTestId('cc-sup-u2').locator('input[type="range"]');
    await u1.focus();
    await page.keyboard.press('Home');
    await expect(verdict).toHaveAttribute('data-tone', 'neutral');
    await expect(verdict).toHaveText(NEUTRAL_SUP);
    await expect(verdict).not.toHaveClass(/ds-callout--(success|warning|danger)/);
    await page.keyboard.press('End');
    await expect(verdict).toHaveAttribute('data-tone', 'warning');
    await expect(verdict).toContainText('No se cumplen');
    await u2.focus();
    await page.keyboard.press('Home');
    await expect(verdict).toHaveText(NEUTRAL_SUP);
    // también en el depósito lineal: con una entrada nula no se declara «Se cumplen»
    await page.getByTestId('cc-sup-system-lineal').click();
    await expect.poll(async () => (await ccState(page)).linealidad.superposition.variant).toBe('lineal');
    await expect(verdict).toHaveAttribute('data-tone', 'neutral');
    await expect(verdict).toHaveText(NEUTRAL_SUP);
    await u2.focus();
    await page.keyboard.press('End');
    await expect(verdict).toHaveAttribute('data-tone', 'success');
  });

  test('HC-03: escribir en el campo de t detiene la reproducción', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="tiempo"]');
    await expect.poll(async () => (await ccState(page)).tiempo.ready).toBe(true);
    const play = page.getByTestId('cc-time-play');
    if ((await play.getAttribute('data-state')) !== 'playing') await play.click();
    await expect(play).toHaveAttribute('data-state', 'playing');
    const f = page.getByTestId('cc-time-t-number');
    await f.click();
    await expect.poll(async () => (await ccState(page)).tiempo.playing).toBe(false);
    await f.press('Control+a');
    await f.pressSequentially('3');
    await page.waitForTimeout(150);
    await expect(f).toHaveValue('3');           // el bucle no sobrescribe lo que se escribe
    await f.press('Enter');
    await expect.poll(async () => (await ccState(page)).tiempo.t).toBeCloseTo(3, 9);
    expect((await ccState(page)).tiempo.playing).toBe(false);
    await expect(play).toHaveAttribute('data-state', 'paused');
    await page.waitForTimeout(300);
    expect((await ccState(page)).tiempo.t).toBeCloseTo(3, 9);
    await expect(f).toHaveValue(/^3([.,]0+)?$/);
    // al llegar al campo con el teclado también se detiene
    await play.click();
    await expect(play).toHaveAttribute('data-state', 'playing');
    await f.focus();
    await expect.poll(async () => (await ccState(page)).tiempo.playing).toBe(false);
  });

  test('HC-04: trazos distintos en superposición y en métodos', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="linealidad"]');
    await expect.poll(async () => (await ccState(page)).linealidad.superposition !== null).toBe(true);
    await page.locator('canvas[data-testid="cc-sup-chart"]').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartData(page, 'cc-sup-chart')).sets.length).toBe(5);
    const sup = (await chartData(page, 'cc-sup-chart')).sets;
    expect(sup.map((s) => s.dash)).toEqual([[], [], [2, 3], [8, 3], [6, 4]]);
    expect(sup[0].label).toMatch(/^Desajuste/);
    expect(sup[0].fill).toBeTruthy();
    expect(sup.slice(1).map((s) => s.label)).toEqual(['Respuesta a u₁', 'Respuesta a u₂', 'Respuesta a u₁ + u₂', 'Suma y₁ + y₂']);
    await page.getByTestId('cc-lin-tabs-metodos').click();
    await page.locator('canvas[data-testid="cc-num-chart"]').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await chartData(page, 'cc-num-chart')).sets.length).toBe(4);
    const met = (await chartData(page, 'cc-num-chart')).sets;
    expect(met.map((s) => [s.label, s.dash])).toEqual([['Referencia RK45', [6, 4]], ['Euler', [8, 3]], ['Heun', [2, 3]], ['RK4', []]]);
    // la tabla repite el trazo de cada método
    const keys = await page.locator('[data-testid="cc-num-table"] svg.cc-key line')
      .evaluateAll((ls) => ls.map((l) => l.getAttribute('stroke-dasharray') || ''));
    expect(keys).toEqual(['8 3', '2 3', '']);
  });

  for (const theme of ['dark', 'light']) {
    test(`HC-05: el bloque del controlador no usa opacidad y su texto contrasta ≥ 4.5:1 (${theme})`, async ({ page, gotoApp }) => {
      await page.emulateMedia({ colorScheme: theme });
      await gotoApp();
      await page.evaluate((t) => window.DSL.prefs.setTheme(t, { persist: false }), theme);
      await scrollUnderHeader(page, '[data-card="sistema"]');
      await expect(page.getByTestId('cc-card-sistema')).toHaveClass(/is-revealed/);
      await expect.poll(async () => (await ccState(page)).sistema.ready).toBe(true);
      await page.waitForTimeout(900);
      await expect(page.getByTestId('cc-bd')).toHaveAttribute('data-loop', 'open');
      const op = await page.locator('.cc-bd__node--ctl').evaluate((n) => {
        let o = 1;
        for (let e = n; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
        n.querySelectorAll('*').forEach((c) => { o = Math.min(o, parseFloat(getComputedStyle(c).opacity)); });
        return o;
      });
      expect(op).toBe(1);
      for (const sel of ['.cc-bd__node--ctl .cc-bd__label', '.cc-bd__node--ctl .cc-bd__note']) {
        expect(await pixelContrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      }
      const axe = await new AxeBuilder({ page }).include('[data-card="sistema"]').withRules(['color-contrast']).analyze();
      expect(axe.violations).toEqual([]);
      await page.getByTestId('cc-sys-feedback').click();
      await expect(page.getByTestId('cc-bd')).toHaveAttribute('data-loop', 'closed');
      await page.waitForTimeout(500);
      const axe2 = await new AxeBuilder({ page }).include('[data-card="sistema"]').withRules(['color-contrast']).analyze();
      expect(axe2.violations).toEqual([]);
    });
  }

  test('HC-06: sin TeX crudo en el árbol accesible al quedar lista la página; cada lienzo es una imagen con nombre', async ({ page, gotoApp }) => {
    await gotoApp();
    expect(await page.locator('#conceptos').ariaSnapshot()).not.toMatch(RAW_TEX);
    expect(await page.locator('#inicio').ariaSnapshot()).not.toMatch(RAW_TEX);
    const check = () => page.locator('#conceptos canvas').evaluateAll((cs) => cs.map((c) => ({
      id: c.getAttribute('data-testid') || c.className, role: c.getAttribute('role'), name: (c.getAttribute('aria-label') || '').trim(),
    })));
    for (const c of await check()) {
      expect(c.role, c.id).toBe('img');
      expect(c.name.length, c.id).toBeGreaterThan(3);
    }
    await page.evaluate(() => window.DSL.app.handles.concepts.initAll());
    await page.getByTestId('cc-lin-tabs-metodos').click();
    await page.waitForTimeout(300);
    const after = await check();
    expect(after.length).toBeGreaterThanOrEqual(7);
    for (const c of after) {
      expect(c.role, c.id).toBe('img');
      expect(c.name.length, c.id).toBeGreaterThan(3);
    }
  });

  test('HC-07: el bucle de «tiempo» no fuerza el layout y dibuja a 60 fps', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="tiempo"]');
    await expect.poll(async () => (await ccState(page)).tiempo.ready).toBe(true);
    // todas las tarjetas preparadas: en la ventana solo corren los bucles de «sistema» y «tiempo»
    await expect.poll(() => page.locator('#conceptos .cc-card').evaluateAll((cs) => cs.every((c) => c.dataset.lazy === 'done')), { timeout: 8000 }).toBe(true);
    const browser = page.context().browser();
    await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack'] });
    // Ya con la traza en marcha: reproducir desde t = 0 y contar frames durante 3 s de reproducción.
    const run = await page.evaluate(() => new Promise((res) => {
      const st = () => window.DSL.app.handles.concepts.state().tiempo;
      const play = document.querySelector('[data-testid="cc-time-play"]');
      if (st().playing) play.click();
      const range = document.querySelector('[data-testid="cc-time-t"] input[type="range"]');
      range.value = range.min;
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
      play.click();
      const d = [];
      const t0 = performance.now();
      let last = t0;
      const tick = (now) => {
        d.push(now - last);
        last = now;
        if (now - t0 < 3000) requestAnimationFrame(tick);
        else res({ frames: d.slice(1), playing: st().playing, t: st().t });
      };
      requestAnimationFrame(tick);
    }));
    const buf = await browser.stopTracing();
    expect(run.playing).toBe(true);
    expect(run.t).toBeGreaterThan(2.5);
    expect(run.t).toBeLessThan(10);
    // Layout / estilo forzados con concepts.js en la pila: los del bucle de «tiempo» (timeFrame) y todos.
    let inLoop = 0;
    let forced = 0;
    for (const e of JSON.parse(buf.toString()).traceEvents) {
      if (e.name !== 'Layout' && e.name !== 'UpdateLayoutTree') continue;
      const a = e.args || {};
      const stack = (a.beginData && a.beginData.stackTrace) || a.stackTrace || (a.data && a.data.stackTrace) || [];
      if (!stack.some((f) => /concepts\.js/.test(f.url))) continue;
      forced++;
      if (stack.some((f) => f.functionName === 'timeFrame')) inLoop++;
    }
    expect(inLoop).toBe(0);
    expect(forced).toBeLessThanOrEqual(10);
    const sorted = run.frames.slice().sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(20);   // mediana ≈ 16.7 ms
  });

  test('HC-08 / HC-09: rejilla por anchura, alturas reservadas y tipografía de las tarjetas', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoApp();
    await page.evaluate(() => document.fonts.ready);
    const before = await cardBoxes(page);
    expect(before.some((c) => c.lazy !== 'done')).toBe(true);
    await page.evaluate(() => window.DSL.app.handles.concepts.initAll());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(300);
    const after = await cardBoxes(page);
    after.forEach((c, i) => {
      expect(c.lazy, c.card).toBe('done');
      expect(Math.abs(c.h - before[i].h), c.card).toBeLessThanOrEqual(8);
      expect(c.gap, c.card).toBeLessThanOrEqual(48);
    });
    // sección de 900–1199 px: «tiempo» y «ecuaciones» ocupan la fila entera
    const gridW = await page.getByTestId('cc-grid').evaluate((g) => g.getBoundingClientRect().width);
    expect(gridW).toBeGreaterThanOrEqual(900);
    expect(gridW).toBeLessThan(1200);
    for (const c of after) expect(Math.abs(c.w - gridW), c.card).toBeLessThanOrEqual(1);
    // «tiempo» con ≥ 700 px: ecuación a la izquierda y oscilador a la derecha, de ≥ 480 px
    const t = await page.evaluate(() => {
      const eq = document.querySelector('[data-testid="cc-time-eq"]').getBoundingClientRect();
      const fig = document.querySelector('[data-card="tiempo"] .cc-osc').getBoundingClientRect();
      const eqc = document.querySelector('canvas[data-testid="cc-eq-chart"]').getBoundingClientRect();
      return { eqRight: eq.right, figLeft: fig.left, figW: fig.width, eqChartW: eqc.width };
    });
    expect(t.figLeft).toBeGreaterThan(t.eqRight);
    expect(t.figW).toBeGreaterThanOrEqual(480);
    expect(t.eqChartW).toBeGreaterThanOrEqual(480);
    // HC-09: títulos de tarjeta 24 px y entradilla igual que la de la galería
    const type = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        titles: Array.from(document.querySelectorAll('#conceptos .cc-card__title')).map((e) => getComputedStyle(e).fontSize),
        h2: cs('#conceptos-title').fontSize,
        lead: [cs('.cc-lead').fontSize, cs('.cc-lead').lineHeight, cs('.cc-lead').color],
        gl: [cs('.gl-lead').fontSize, cs('.gl-lead').lineHeight, cs('.gl-lead').color],
      };
    });
    expect(type.titles).toEqual(['24px', '24px', '24px', '24px']);
    expect(type.h2).toBe('36px');
    expect(type.lead).toEqual(type.gl);

    // 1440: «sistema» (7) y «tiempo» (5) comparten fila; 390: todas a lo ancho
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    let boxes = await cardBoxes(page);
    expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(1);
    expect(boxes[0].w / boxes[1].w).toBeCloseTo(7 / 5, 1);
    expect(boxes[2].w).toBeGreaterThan(boxes[0].w + boxes[1].w);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    boxes = await cardBoxes(page);
    const w390 = await page.getByTestId('cc-grid').evaluate((g) => g.getBoundingClientRect().width);
    for (const c of boxes) expect(Math.abs(c.w - w390), c.card).toBeLessThanOrEqual(1);
    expect(await overflow(page)).toBe(0);
  });

  test('HC-10: el marco x de la gráfica c es el mismo con tallos y con escalera y el último punto queda a < 4 % del borde', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="ecuaciones"]');
    await expect.poll(async () => (await ccState(page)).ecuaciones.ready).toBe(true);
    await page.locator('canvas[data-testid="cc-eq-chart"]').scrollIntoViewIfNeeded();
    const frameOf = async () => (await ccState(page)).ecuaciones.frame;
    for (const T of ['0,4', '1,5', '2,4']) {
      await setNumber(page, 'cc-eq-T', T);
      await page.getByTestId('cc-eq-view-tallos').click();
      await page.waitForTimeout(250);
      const a = await chartData(page, 'cc-eq-chart');
      const fa = await frameOf();
      await page.getByTestId('cc-eq-view-escalera').click();
      await page.waitForTimeout(250);
      const b = await chartData(page, 'cc-eq-chart');
      expect(await frameOf()).toEqual(fa);
      expect([b.min, b.max]).toEqual([a.min, a.max]);
      expect([a.min, a.max]).toEqual(fa);
      const expected = await page.evaluate(() => {
        const H = window.DSL.sections.concepts.helpers;
        const s = window.DSL.app.handles.concepts.state().ecuaciones;
        return H.eqFrame(H.firstOrder(s.a, s.T).tEnd);
      });
      expect(fa).toEqual(expected);
      expect(a.lastRel, `T=${T}`).toBeGreaterThanOrEqual(0);
      expect(a.lastRel, `T=${T}`).toBeLessThanOrEqual(0.04);
      expect(b.lastRel, `T=${T}`).toBeLessThanOrEqual(0.04);
    }
  });

  test('HC-11: el paso a «Linealidad» desde el asistente deja la tarjeta bajo la barra y el foco en su pestaña', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await gotoApp('#modelado');
    await page.locator('#modelado').scrollIntoViewIfNeeded();
    await page.getByTestId('wz-example-sir').click();
    await expect(page.getByTestId('wz-root')).toHaveAttribute('data-example', 'sir');
    await page.getByTestId('wz-step-3').click();
    const btn = page.getByTestId('wz-open-concepts');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const tab = page.getByTestId('cc-lin-tabs-superposicion');
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const top = () => page.evaluate(() => {
      const hh = document.querySelector('.app-header').getBoundingClientRect().bottom;
      return document.querySelector('[data-card="linealidad"]').getBoundingClientRect().top - hh;
    });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 4; i++) {
      const s = await top();
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(40);
      await page.waitForTimeout(250);
    }
    await expect(tab).toBeFocused();
  });

  test('HC-11: una rueda del usuario cancela la corrección del paso', async ({ page, gotoApp }) => {
    await gotoApp('#transferencia');
    await page.evaluate(() => window.DSL.bus.emit('concepts:open', { card: 'linealidad', tab: 'superposicion' }));
    await page.waitForTimeout(1800);
    await page.mouse.move(600, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
    const y1 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.scrollY)).toBe(y1);
  });

  test('HC-12: preparación en reposo sin tareas largas; open() sigue siendo síncrono', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(30_000);
    await page.addInitScript(() => {
      window.__ccLong = [];
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ccLong.push({ start: e.startTime, ms: e.duration })))
          .observe({ type: 'longtask', buffered: true });
      } catch (e) { /* sin longtask */ }
    });
    await gotoApp();
    const t0 = await page.evaluate(() => performance.now());
    await expect.poll(() => page.locator('#conceptos .cc-card').evaluateAll((cs) => cs.map((c) => c.dataset.lazy)), { timeout: 5000 })
      .toEqual(['done', 'done', 'done', 'done']);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);   // sin desplazarse: en reposo
    const { phases } = await ccStats(page);
    expect(phases.length).toBeGreaterThanOrEqual(7);
    for (const p of phases) expect(p.ms, `${p.card}#${p.phase}`).toBeLessThanOrEqual(120);
    const long = await page.evaluate(() => window.__ccLong);
    // ninguna tarea larga de más de 120 ms tras data-ready contiene una fase de #conceptos
    const hits = long.filter((l) => l.start >= t0 - 1 && l.ms > 120
      && phases.some((p) => p.start < l.start + l.ms && p.start + p.ms > l.start));
    expect(hits).toEqual([]);

    // open() prepara la tarjeta en el acto, aunque aún no se haya preparado
    await gotoApp();
    const sync = await page.evaluate(() => {
      const H = window.DSL.app.handles.concepts;
      const before = H.state().linealidad.methods;
      const ok = H.open({ card: 'linealidad', tab: 'metodos' });
      const st = H.state().linealidad;
      return { before, ok, ready: st.ready, methods: st.methods !== null, lazy: document.querySelector('[data-card="linealidad"]').dataset.lazy };
    });
    expect(sync).toEqual({ before: null, ok: true, ready: true, methods: true, lazy: 'done' });
  });
});

/* ====================================================================== HC-07: lienzos a dpr 2 */

test.describe('#conceptos — lienzos a devicePixelRatio 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test('HC-07: los lienzos de «tiempo» y «sistema» = tamaño CSS × dpr, también tras redimensionar', async ({ page, gotoApp }) => {
    await gotoApp();
    await scrollUnderHeader(page, '[data-card="tiempo"]');
    await expect.poll(async () => (await ccState(page)).tiempo.ready).toBe(true);
    await expect.poll(async () => (await ccState(page)).sistema.ready).toBe(true);
    const backing = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-card="tiempo"] canvas, [data-card="sistema"] canvas'))
      .filter((c) => c.clientWidth > 0)
      .map((c) => ({ id: c.getAttribute('data-testid') || c.className, bw: c.width, bh: c.height, cw: c.getBoundingClientRect().width, ch: c.getBoundingClientRect().height, dpr: devicePixelRatio })));
    const check = (list) => {
      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const c of list) {
        expect(c.dpr).toBe(2);
        expect(Math.abs(c.bw - c.cw * 2), c.id).toBeLessThanOrEqual(1);
        expect(Math.abs(c.bh - c.ch * 2), c.id).toBeLessThanOrEqual(1);
      }
    };
    check(await backing());
    await page.setViewportSize({ width: 1024, height: 768 });
    await scrollUnderHeader(page, '[data-card="tiempo"]');
    await page.waitForTimeout(400);
    check(await backing());
  });
});

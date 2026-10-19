// tests/e2e/gallery.spec.mjs — Propietario: gallery.
// #galeria: riel de sistemas (teclado, placa), cada sistema y variante (reproducir, pausar, reiniciar,
// velocidad, parámetros en vivo, cada tipo de entrada), «Ver G(s) paso a paso» → tf:open, explicación
// sin G(s) (SIR, telaraña), gallery:open, divergencia de la telaraña, restablecer + deshacer, pausa fuera
// de pantalla y con la pestaña oculta, movimiento reducido, 390 px sin desbordes. Capturas en
// 1440×900 y 1024×768 en los dos temas (más 390×844) en test-results/gallery/shots.
// Regresiones de la auditoría GAL-01…GAL-13 al final (h_lin discontinua, dominio de la telaraña, alto de
// las gráficas, cambio de sistema sin tareas largas, chips, colores forzados y 320 px, foco de
// «Restablecer», anuncios, nombres accesibles, «..», ayudas de las lecturas, arranque por fases, visor).
// Ejecutar: npx playwright test tests/e2e/gallery.spec.mjs --project=src --output "test-results/gallery"
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';

const SHOTS = path.join(ROOT, 'test-results', 'gallery', 'shots');
const SYSTEMS = ['massSpring', 'tanks', 'rlc', 'sir', 'market'];
const COMBOS = [
  ['massSpring', 'base'],
  ['tanks', 'lineal'], ['tanks', 'torricelli'], ['tanks', 'cascada'],
  ['rlc', 'serie'],
  ['sir', 'base'],
  ['market', 'telarana'], ['market', 'walras'],
];

const glState = (page) => page.evaluate(() => window.DSL.app.handles.gallery.state());

/** Lleva la parte superior de un elemento justo debajo de la barra fija. */
async function scrollUnderHeader(page, selector, extra = 16) {
  await page.evaluate(([sel, gap]) => {
    const el = document.querySelector(sel);
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - header - gap));
  }, [selector, extra]);
}

/** Espera a que la galería esté construida y sin transición en curso. */
async function settled(page, extra = {}) {
  await expect.poll(async () => {
    const s = await glState(page);
    if (!s.ready || s.switching) return false;
    for (const k of Object.keys(extra)) if (s[k] !== extra[k]) return false;
    return true;
  }, { timeout: 10_000 }).toBe(true);
  // el fundido de entrada (≤ 200 ms) y la placa del riel
  await page.waitForTimeout(260);
}

async function openGallery(page, gotoApp, opts = {}) {
  await gotoApp('#galeria', opts);
  await scrollUnderHeader(page, '[data-testid="gl-stage"]');
  await settled(page);
}

async function pick(page, systemId, variant) {
  await page.getByTestId(`gl-system-${systemId}`).click();
  await settled(page, { systemId });
  if (variant) {
    const s = await glState(page);
    if (s.variant !== variant) {
      await page.getByTestId(`gl-variant-${variant}`).click();
      await settled(page, { variant });
    }
  }
  await scrollUnderHeader(page, '[data-testid="gl-stage"]');
}

async function setNumber(page, testid, value) {
  const f = page.getByTestId(testid + '-number');
  await f.fill(String(value));
  await f.press('Enter');
}

async function tAfter(page, ms) {
  const a = (await glState(page)).t;
  await page.waitForTimeout(ms);
  const b = (await glState(page)).t;
  return { a, b, d: b - a };
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => window.DSL.prefs.setTheme(t, { persist: false }), theme);
  await page.waitForTimeout(80);
}

/** Registra en window.__glBus las cargas de los eventos indicados. */
async function spyBus(page, events) {
  await page.evaluate((names) => {
    window.__glBus = [];
    names.forEach((n) => window.DSL.bus.on(n, (p) => window.__glBus.push({ event: n, payload: JSON.parse(JSON.stringify(p)) })));
  }, events);
}

/* ====================================================================== estructura */

test.describe('#galeria — estructura y riel', () => {
  test('título, entrada, cinco tarjetas con icono, nombre, categoría y resumen', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await expect(page.locator('#galeria h2#galeria-title')).toHaveText('Galería de ejemplos interactivos');
    const rail = page.getByTestId('gl-rail');
    await expect(rail).toHaveAttribute('role', 'tablist');
    const tabs = rail.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    for (const id of SYSTEMS) {
      const tab = page.getByTestId(`gl-system-${id}`);
      await expect(tab.locator('.gl-sys__icon svg')).toHaveCount(1);
      await expect(tab.locator('.gl-sys__name')).not.toBeEmpty();
      await expect(tab.locator('.gl-sys__cat')).not.toBeEmpty();
      await expect(tab.locator('.gl-sys__sum')).not.toBeEmpty();
    }
    await expect(page.getByTestId('gl-system-massSpring')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('gl-system-massSpring')).toHaveAttribute('tabindex', '0');
    await expect(page.getByTestId('gl-system-rlc')).toHaveAttribute('tabindex', '-1');
    await expect(page.getByTestId('gl-stage')).toHaveAttribute('role', 'tabpanel');
    await expect(page.getByTestId('gl-title')).toHaveText('Masa-resorte-amortiguador');
    for (const c of ['gl-chip-category', 'gl-chip-linear', 'gl-chip-time']) await expect(page.getByTestId(c)).toBeVisible();
    await expect(page.getByTestId('gl-chip-linear')).toHaveText('Lineal');
    await expect(page.getByTestId('gl-scene')).toBeVisible();
    await expect(page.getByTestId('gl-chart-1')).toBeVisible();
    await expect(page.locator('[data-testid="gl-readouts"] .katex').first()).toBeVisible();
  });

  test('la placa sigue al sistema elegido; teclado ← → Inicio Fin con foco itinerante', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    const plateOn = async (id) => {
      await expect.poll(async () => {
        const p = await page.getByTestId('gl-rail-plate').boundingBox();
        const t = await page.getByTestId(`gl-system-${id}`).boundingBox();
        return Math.abs(p.x - t.x) < 2 && Math.abs(p.width - t.width) < 2 && Math.abs(p.y - t.y) < 2;
      }, { timeout: 3000 }).toBe(true);
    };
    await plateOn('massSpring');
    await page.getByTestId('gl-system-massSpring').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('gl-system-tanks')).toBeFocused();
    await settled(page, { systemId: 'tanks' });
    await expect(page.getByTestId('gl-system-tanks')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('gl-system-tanks')).toHaveAttribute('tabindex', '0');
    await plateOn('tanks');
    await page.keyboard.press('End');
    await expect(page.getByTestId('gl-system-market')).toBeFocused();
    await settled(page, { systemId: 'market' });
    await plateOn('market');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('gl-system-massSpring')).toBeFocused();
    await page.keyboard.press('Home');
    await settled(page, { systemId: 'massSpring' });
    // varias flechas seguidas: solo se construye el sistema donde se detiene el foco
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('gl-system-sir')).toBeFocused();
    await settled(page, { systemId: 'sir' });
    await plateOn('sir');
  });
});

/* ====================================================================== cada sistema y variante */

test.describe('#galeria — cada sistema y variante', () => {
  for (const [systemId, variant] of COMBOS) {
    test(`${systemId}/${variant}: reproduce, pausa, reinicia, velocidad, parámetros y entradas`, TIMING, async ({ page, gotoApp }) => {
      test.setTimeout(60_000);
      await openGallery(page, gotoApp);
      await pick(page, systemId, variant);
      let s = await glState(page);
      expect(s.systemId).toBe(systemId);
      expect(s.variant).toBe(variant);
      expect(s.playing).toBe(true);
      expect(s.charts.length).toBeGreaterThanOrEqual(1);
      await expect(page.getByTestId('gl-play')).toHaveAttribute('aria-label', /Pausar/);

      // reproduce: el tiempo avanza y las gráficas reciben puntos
      const run = await tAfter(page, 500);
      expect(run.d).toBeGreaterThan(0);
      s = await glState(page);
      expect(s.running).toBe(true);
      expect(s.charts[0].pushes).toBeGreaterThan(1);

      // pausa: el tiempo se queda quieto
      await page.getByTestId('gl-play').click();
      await expect.poll(async () => (await glState(page)).playing).toBe(false);
      await expect(page.getByTestId('gl-play')).toHaveAttribute('aria-label', /Reproducir/);
      const still = await tAfter(page, 300);
      expect(still.d).toBe(0);

      // reinicia: t = 0 y la lectura del tiempo vuelve a cero
      await page.getByTestId('gl-reset').click();
      await expect.poll(async () => (await glState(page)).t).toBe(0);
      await expect(page.getByTestId('gl-time')).toContainText(/=\s*0(\.0+)?/);

      // velocidad: 1× frente a 4×
      await page.getByTestId('gl-play').click();
      await expect.poll(async () => (await glState(page)).playing).toBe(true);
      const slow = await tAfter(page, 600);
      await page.getByTestId('gl-speed-4').click();
      await expect.poll(async () => (await glState(page)).speed).toBe(4);
      const fast = await tAfter(page, 600);
      expect(fast.d).toBeGreaterThan(slow.d * 2);
      await page.getByTestId('gl-speed-0-25').click();
      await expect.poll(async () => (await glState(page)).speed).toBe(0.25);
      await page.getByTestId('gl-speed-1').click();

      // parámetro «en vivo» durante la reproducción: cambia sin reiniciar
      const desc = await page.evaluate(([id, v]) => {
        const S = window.DSL.systems;
        return JSON.parse(JSON.stringify(S.describe(S.get(id), v)));
      }, [systemId, variant]);
      const spec = desc.params.find((p) => p.live !== false);
      const f = spec.display && spec.display.factor > 0 ? spec.display.factor : 1;
      const step = spec.step * f;
      let target = spec.default * f + 2 * step;
      if (target > spec.max * f + 1e-9) target = spec.default * f - 2 * step;
      target = Number(target.toPrecision(10));
      const before = (await glState(page)).t;
      await setNumber(page, `gl-param-${spec.key}`, target);
      await expect.poll(async () => Math.abs((await glState(page)).params[spec.key] * f - target)).toBeLessThan(step * 1e-6);
      s = await glState(page);
      expect(s.playing).toBe(true);
      expect(s.t).toBeGreaterThanOrEqual(before);   // no se reinició (en tiempo discreto t avanza a saltos)
      await expect.poll(async () => (await glState(page)).t).toBeGreaterThan(before);
      await expect(page.getByTestId('gl-params-restore')).toBeEnabled();

      // cada tipo de entrada: las gráficas siguen recibiendo datos
      for (const inp of desc.inputs) {
        await page.getByTestId(`gl-input-${inp.id}`).click();
        await expect.poll(async () => (await glState(page)).input.type).toBe(inp.id);
        await page.waitForTimeout(250);
        s = await glState(page);
        const keys = s.charts.flatMap((c) => c.series);
        if (inp.id === 'ninguna') expect(keys).not.toContain('entrada');
        expect(s.charts.every((c) => c.points > 0)).toBe(true);
        expect(s.halted).toBeNull();
      }

      // la escena y las lecturas existen y no quedan vacías
      await expect(page.getByTestId('gl-scene')).toBeVisible();
      const readouts = await page.locator('[data-testid="gl-readouts"] [data-testid^="gl-readout-"][data-testid$="-value"]').allTextContents();
      expect(readouts.length).toBeGreaterThan(0);
      expect(readouts.some((r) => r.trim().length > 0)).toBe(true);
    });
  }

  test('cambiar de sistema o variante arranca la nueva simulación desde t = 0', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await page.getByTestId('gl-play').click();
    await expect.poll(async () => (await glState(page)).playing).toBe(false);
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    await page.getByTestId('gl-system-tanks').click();
    await settled(page, { systemId: 'tanks' });
    let s = await glState(page);
    expect(s.playing).toBe(true);
    expect(s.t).toBeLessThan(s.horizon / 4);
    await page.getByTestId('gl-play').click();
    await page.getByTestId('gl-variant-torricelli').click();
    await settled(page, { variant: 'torricelli' });
    s = await glState(page);
    expect(s.playing).toBe(true);
    await expect(page.getByTestId('gl-chip-linear')).toHaveText('No lineal');
  });

  test('parámetro que reinicia (live: false): aviso en el tooltip y t vuelve a 0', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await pick(page, 'market', 'walras');
    await expect(page.getByTestId('gl-param-P0')).toHaveClass(/gl-slider--restart/);
    await page.waitForTimeout(500);
    const before = (await glState(page)).t;
    expect(before).toBeGreaterThan(0.2);
    await setNumber(page, 'gl-param-P0', 20);
    await expect.poll(async () => (await glState(page)).params.P0).toBe(20);
    expect((await glState(page)).t).toBeLessThan(before);
  });
});

/* ====================================================================== G(s) */

test.describe('#galeria — función de transferencia', () => {
  test('«Ver G(s) paso a paso» emite tf:open con sistema, variante, parámetros y salida', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await spyBus(page, ['tf:open']);
    await setNumber(page, 'gl-param-k', 9);
    await expect.poll(async () => (await glState(page)).params.k).toBe(9);
    await page.getByTestId('gl-tf-open').click();
    let bus = await page.evaluate(() => window.__glBus);
    expect(bus).toHaveLength(1);
    expect(bus[0].payload).toEqual({ systemId: 'massSpring', variant: 'base', params: { m: 1, b: 0.8, k: 9 }, outputKey: 'x' });

    // RLC: dos salidas con G(s); el selector elige outputKey
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    await pick(page, 'rlc', 'serie');
    await page.evaluate(() => { window.__glBus.length = 0; });
    await page.getByTestId('gl-tf-output-i').click();
    await expect(page.getByTestId('gl-tf-note').locator('.katex').first()).toBeVisible();
    await page.getByTestId('gl-tf-open').click();
    bus = await page.evaluate(() => window.__glBus);
    expect(bus).toHaveLength(1);
    expect(bus[0].payload.systemId).toBe('rlc');
    expect(bus[0].payload.variant).toBe('serie');
    expect(bus[0].payload.outputKey).toBe('i');
    expect(Object.keys(bus[0].payload.params).sort()).toEqual(['C', 'L', 'R']);

    // mercado con ajuste continuo sí tiene G(s)
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    await pick(page, 'market', 'walras');
    await expect(page.getByTestId('gl-tf-open')).toBeVisible();
    await expect(page.getByTestId('gl-notf')).toHaveCount(0);
  });

  test('SIR y telaraña: sin botón; explicación, vista linealizada (SIR) y enlace a conceptos', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await spyBus(page, ['tf:open', 'concepts:open']);
    await pick(page, 'sir');
    await expect(page.getByTestId('gl-tf-open')).toHaveCount(0);
    const notf = page.getByTestId('gl-notf');
    await expect(notf).toBeVisible();
    await expect(notf).toContainText(/no lineal/i);
    await expect(notf.locator('.katex').first()).toBeVisible();
    const lin = page.getByTestId('gl-notf-linear-toggle');
    await expect(lin).toBeVisible();
    await lin.click();
    await expect(page.getByTestId('gl-notf-linear-region').locator('.katex').first()).toBeVisible();
    await page.getByTestId('gl-notf-concepts').click();
    let bus = await page.evaluate(() => window.__glBus);
    expect(bus.map((e) => e.event)).toEqual(['concepts:open']);
    expect(bus[0].payload).toEqual({ card: 'linealidad', tab: 'superposicion' });

    await page.evaluate(() => { window.__glBus.length = 0; });
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    await pick(page, 'market', 'telarana');
    await expect(page.getByTestId('gl-tf-open')).toHaveCount(0);
    await expect(page.getByTestId('gl-notf')).toBeVisible();
    await expect(page.getByTestId('gl-notf')).toContainText(/discreto|periodo/i);
    await expect(page.getByTestId('gl-notf-linear-toggle')).toHaveCount(0);
    await page.getByTestId('gl-notf-concepts').click();
    bus = await page.evaluate(() => window.__glBus);
    expect(bus.map((e) => e.event)).toEqual(['concepts:open']);
    expect(bus[0].payload).toEqual({ card: 'ecuaciones' });
  });
});

/* ====================================================================== integración y estados */

test.describe('#galeria — integración y estados', () => {
  test('gallery:open selecciona sistema y variante (también antes del arranque perezoso)', async ({ page, gotoApp }) => {
    await gotoApp();
    expect((await glState(page)).ready).toBe(false);
    await page.evaluate(() => window.DSL.bus.emit('gallery:open', { systemId: 'tanks', variant: 'cascada' }));
    await settled(page, { systemId: 'tanks', variant: 'cascada' });
    await expect(page.getByTestId('gl-system-tanks')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('gl-variant-cascada')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => window.DSL.bus.emit('gallery:open', { systemId: 'rlc' }));
    await settled(page, { systemId: 'rlc', variant: 'serie' });
    await page.evaluate(() => window.DSL.bus.emit('gallery:open', { systemId: 'pendulum' }));
    await page.evaluate(() => window.DSL.bus.emit('gallery:open', { systemId: 'nada' }));
    await page.waitForTimeout(300);
    expect((await glState(page)).systemId).toBe('rlc');
  });

  test('telaraña divergente: aviso, pausa y vuelta con «Reiniciar»', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await pick(page, 'market', 'telarana');
    await expect(page.getByTestId('gl-halt')).toBeHidden();
    await setNumber(page, 'gl-param-d', 4);
    await setNumber(page, 'gl-param-b', 0.5);
    await page.getByTestId('gl-speed-4').click();
    await expect(page.getByTestId('gl-halt')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('gl-halt')).toContainText('d/b');
    let s = await glState(page);
    expect(s.halted).not.toBeNull();
    expect(s.playing).toBe(false);
    await setNumber(page, 'gl-param-d', 1);
    await page.getByTestId('gl-reset').click();
    await expect(page.getByTestId('gl-halt')).toBeHidden();
    s = await glState(page);
    expect(s.halted).toBeNull();
    expect(s.t).toBe(0);
  });

  test('restablecer parámetros y deshacer desde el aviso', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await expect(page.getByTestId('gl-params-restore')).toBeDisabled();
    await setNumber(page, 'gl-param-k', 12);
    await setNumber(page, 'gl-param-b', 2);
    await expect.poll(async () => (await glState(page)).params).toEqual({ m: 1, b: 2, k: 12 });
    await page.getByTestId('gl-params-restore').click();
    await expect.poll(async () => (await glState(page)).params).toEqual({ m: 1, b: 0.8, k: 4 });
    await expect(page.getByTestId('gl-param-k-number')).toHaveValue(/^4(\.0+)?$/);
    const toast = page.getByTestId('gl-toast');
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Deshacer' }).click();
    await expect.poll(async () => (await glState(page)).params).toEqual({ m: 1, b: 2, k: 12 });
  });

  test('se detiene fuera de pantalla y con la pestaña oculta; vuelve al regresar', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    expect((await glState(page)).running).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await glState(page)).running).toBe(false);
    expect((await glState(page)).playing).toBe(true);
    expect((await tAfter(page, 300)).d).toBe(0);
    await scrollUnderHeader(page, '[data-testid="gl-stage"]');
    await expect.poll(async () => (await glState(page)).running).toBe(true);
    expect((await tAfter(page, 300)).d).toBeGreaterThan(0);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await glState(page)).running).toBe(false);
    expect((await tAfter(page, 300)).d).toBe(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await glState(page)).running).toBe(true);
    expect((await tAfter(page, 300)).d).toBeGreaterThan(0);
  });

  test('movimiento reducido: no arranca solo y muestra la trayectoria completa', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp, { reducedMotion: true });
    let s = await glState(page);
    expect(s.playing).toBe(false);
    expect(s.atEnd).toBe(true);
    expect(s.t).toBeCloseTo(s.horizon, 6);
    expect(s.charts.every((c) => c.points > 50)).toBe(true);
    await setNumber(page, 'gl-param-k', 16);
    await expect.poll(async () => (await glState(page)).params.k).toBe(16);
    s = await glState(page);
    expect(s.atEnd).toBe(true);
    expect(s.playing).toBe(false);
    await pick(page, 'sir');
    s = await glState(page);
    expect(s.playing).toBe(false);
    expect(s.atEnd).toBe(true);
    await page.getByTestId('gl-play').click();
    await expect.poll(async () => (await glState(page)).playing).toBe(true);
    expect((await glState(page)).t).toBeLessThan(s.horizon);
  });
});

/* ====================================================================== capturas */

async function shootAll(page, tag) {
  await page.getByTestId('gl-play').click();
  await expect.poll(async () => (await glState(page)).playing).toBe(false);
  await scrollUnderHeader(page, '#galeria', 0);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-top.png`) });
  await scrollUnderHeader(page, '[data-testid="gl-stage"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-stage.png`) });
  await page.locator('#galeria').screenshot({ path: path.join(SHOTS, `${tag}-full.png`) });
}

test.describe('#galeria — capturas', () => {
  for (const [w, hgt] of [[1440, 900], [1024, 768]]) {
    for (const theme of ['dark', 'light']) {
      test(`capturas ${w}×${hgt} ${theme}`, async ({ page, gotoApp }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width: w, height: hgt });
        await openGallery(page, gotoApp);
        await setTheme(page, theme);
        await page.waitForTimeout(1600);
        await shootAll(page, `${w}-${theme}-massSpring`);
        expect(await overflow(page)).toBe(0);
        for (const [id, v, ms] of [['rlc', 'serie', 1600], ['sir', null, 2500], ['market', 'telarana', 3000], ['tanks', 'cascada', 2500]]) {
          await scrollUnderHeader(page, '[data-testid="gl-rail"]');
          await pick(page, id, v);
          await page.waitForTimeout(ms);
          await page.getByTestId('gl-play').click();
          await expect.poll(async () => (await glState(page)).playing).toBe(false);
          await page.waitForTimeout(150);
          await page.locator('#galeria').screenshot({ path: path.join(SHOTS, `${w}-${theme}-${id}${v ? '-' + v : ''}.png`) });
          expect(await overflow(page)).toBe(0);
        }
      });
    }
  }

  test('390 px: sin desbordes; el riel se desplaza en horizontal', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openGallery(page, gotoApp);
    expect(await overflow(page)).toBe(0);
    const rail = await page.getByTestId('gl-rail').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(rail.sw).toBeGreaterThan(rail.cw);
    await page.waitForTimeout(1200);
    await shootAll(page, '390-dark-massSpring');
    for (const id of ['rlc', 'sir', 'market']) {
      await scrollUnderHeader(page, '[data-testid="gl-rail"]');
      await pick(page, id);
      expect(await overflow(page)).toBe(0);
    }
    await setTheme(page, 'light');
    await page.locator('#galeria').screenshot({ path: path.join(SHOTS, '390-light-market.png') });
  });
});

/* ====================================================================== auditoría GAL-01…GAL-13 */

/** Registra en window.__glLive cada texto no vacío que recibe la región viva compartida (ds-live). */
async function spyLive(page) {
  await page.evaluate(() => {
    window.__glLive = [];
    if (window.__glLiveObs) window.__glLiveObs.disconnect();
    window.__glLiveObs = new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target;
        if (t.nodeType === 1 && t.getAttribute('data-testid') === 'ds-live' && m.addedNodes.length && t.textContent) window.__glLive.push(t.textContent);
      }
    });
    window.__glLiveObs.observe(document.body, { childList: true, subtree: true });
  });
}
const liveTexts = (page) => page.evaluate(() => window.__glLive.slice());

/** Selecciona sistema y variante con el handle (sin clic) y espera a que se asienten. */
async function selectVia(page, systemId, variant) {
  await page.evaluate(([id, v]) => window.DSL.app.handles.gallery.select(id, v), [systemId, variant]);
  await settled(page, { systemId, variant });
}

/** Elementos de #galeria que se salen del viewport en horizontal (sin contar los de cajas con desplazamiento). */
async function escapees(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector('#galeria');
    const scrolls = (e) => /(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowX);
    const out = [];
    root.querySelectorAll('*').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || (r.left >= -0.5 && r.right <= vw + 0.5)) return;
      for (let p = e.parentElement; p && p !== root; p = p.parentElement) if (scrolls(p)) return;
      out.push(`${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').trim().replace(/\s+/g, '.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
    });
    return out;
  });
}

test.describe('#galeria — auditoría GAL-01…GAL-13', () => {
  test('GAL-01: Torricelli dibuja h_lin discontinua; con 20 L/s la tabla acaba en h ≈ 1,274 m y h_lin ≈ 1,070 m', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await openGallery(page, gotoApp, { reducedMotion: true });
    // chartPlan conserva `dash` de cada salida: solo h_lin (Torricelli) va discontinua, además de la entrada
    const dashed = await page.evaluate((combos) => {
      const S = window.DSL.systems;
      const G = window.DSL.sections.gallery.helpers;
      return combos.map(([id, v]) => {
        const desc = S.describe(S.get(id), v);
        const plan = G.chartPlan(desc, desc.inputs[0].id, id);
        return [id + '/' + v, plan.flatMap((g) => g.series.filter((s) => s.dash && s.key !== G.INPUT_KEY).map((s) => s.key))];
      });
    }, COMBOS);
    const byCombo = Object.fromEntries(dashed);
    test.skip(!byCombo['tanks/torricelli'].includes('hLin'), 'Requiere CORE-05 (salida hLin de los depósitos).');
    for (const [k, keys] of dashed) expect(keys, k).toEqual(k === 'tanks/torricelli' ? ['hLin'] : []);

    await pick(page, 'tanks', 'torricelli');
    await setNumber(page, 'gl-inparam-amplitude', 20);
    await expect.poll(async () => (await glState(page)).input.amplitude).toBeCloseTo(0.02, 9);
    await expect.poll(async () => (await glState(page)).atEnd).toBe(true);
    const s = await glState(page);
    expect(s.charts[0].series).toEqual(['h', 'hLin']);
    expect(s.charts[0].dashed).toEqual(['hLin']);
    const dash = await page.evaluate(() => {
      const ch = window.Chart.getChart(document.querySelector('#galeria canvas[data-testid="gl-chart-1"]'));
      return ch.data.datasets.map((d) => (d.borderDash || []).length);
    });
    expect(dash[0]).toBe(0);
    expect(dash[1]).toBeGreaterThan(0);
    // la tabla «Ver datos» acaba en el estado final de las dos curvas
    await page.getByTestId('gl-chart-1-data-toggle').click();
    const last = page.getByTestId('gl-chart-1-data').locator('tbody tr').last();
    await expect(last).toBeAttached();
    const cells = (await last.locator('th, td').allTextContents()).map((t) => Number(t.trim().replace('−', '-').replace(',', '.')));
    expect(cells[0]).toBeCloseTo(s.horizon, 3);
    expect(Math.abs(cells[1] - 1.274)).toBeLessThan(0.005);
    expect(Math.abs(cells[2] - 1.070)).toBeLessThan(0.002);
  });

  test('GAL-02: telaraña fuera del dominio: aviso con el motivo y qué cambiar; tras «Reiniciar», nota de pausa en k = 0', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await openGallery(page, gotoApp);
    const hasDomain = await page.evaluate(() => typeof window.DSL.systems.get('market').domain === 'function');
    test.skip(!hasDomain, 'Requiere CORE-12 (market.domain).');
    await pick(page, 'market', 'telarana');
    // con los valores por omisión (d/b = 0,75) converge: ni aviso ni nota
    await page.getByTestId('gl-speed-4').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('gl-halt')).toBeHidden();
    await expect(page.getByTestId('gl-note')).toBeHidden();
    expect((await glState(page)).halted).toBeNull();

    // d = 2,4 (d/b = 1,2) desde P₀ = 40: el primer periodo ya da un precio negativo
    await page.getByTestId('gl-play').click();
    await expect.poll(async () => (await glState(page)).playing).toBe(false);
    await setNumber(page, 'gl-param-d', 2.4);
    await expect.poll(async () => (await glState(page)).params.d).toBe(2.4);
    await page.getByTestId('gl-reset').click();
    await expect.poll(async () => (await glState(page)).t).toBe(0);
    await spyLive(page);
    await page.getByTestId('gl-play').click();
    const halt = page.getByTestId('gl-halt');
    await expect(halt).toBeVisible({ timeout: 5_000 });
    const s = await glState(page);
    expect(s.playing).toBe(false);
    expect(s.halted.reason).toMatch(/k = 1\b/);
    await expect(halt).toContainText('dominio');
    await expect(halt).toContainText('Baje d por debajo de b');
    await expect(halt).toContainText('«Reiniciar»');
    expect(await halt.textContent()).not.toMatch(/\.\./);
    // ningún punto del recorrido sale del dominio salvo el último (el que detuvo la simulación)
    const neg = await page.evaluate(() => [...document.querySelectorAll('#galeria canvas[data-testid^="gl-chart-"]')].flatMap((c) =>
      window.Chart.getChart(c).data.datasets.map((d) => ({ label: d.label, bad: d.data.slice(0, -1).filter((p) => p.y < -1e-9).length }))));
    for (const d of neg) expect(d.bad, d.label).toBe(0);
    await page.waitForTimeout(300);
    const live = await liveTexts(page);
    expect(live.some((t) => /dominio/.test(t))).toBe(true);
    for (const t of live) expect(t).not.toMatch(/\.\./);

    // «Reiniciar» quita el aviso y explica que la simulación está en pausa en k = 0
    await page.getByTestId('gl-reset').click();
    await expect(halt).toBeHidden();
    const note = page.getByTestId('gl-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('k = 0');
    await expect(note).toContainText('«Reproducir»');
    expect((await glState(page)).halted).toBeNull();
    await page.getByTestId('gl-play').click();
    await expect(note).toBeHidden();
  });

  test('GAL-03: a 1024 y 1280 px cada gráfica tiene ≥ 160 px de trazado y su título del eje y cabe', async ({ page, gotoApp }) => {
    test.setTimeout(90_000);
    for (const [w, hgt] of [[1024, 900], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await openGallery(page, gotoApp);
      for (const [id, v] of COMBOS) {
        await selectVia(page, id, v);
        const charts = await page.evaluate(() => [...document.querySelectorAll('#galeria canvas[data-testid^="gl-chart-"]')].map((c) => {
          const ch = window.Chart.getChart(c);
          const y = ch.scales.y;
          const t = y.options.title || {};
          const f = t.font || {};
          ch.ctx.save();
          ch.ctx.font = `${f.style || 'normal'} ${f.weight || 'normal'} ${f.size || 12}px ${f.family || 'sans-serif'}`;
          const tw = t.display && t.text ? ch.ctx.measureText(String(t.text)).width : 0;
          ch.ctx.restore();
          const mid = (y.top + y.bottom) / 2;
          return { id: c.dataset.testid, area: ch.chartArea.bottom - ch.chartArea.top, titleFits: mid - tw / 2 >= -0.5 && mid + tw / 2 <= ch.height + 0.5 };
        }));
        expect(charts.length).toBeGreaterThan(0);
        for (const c of charts) {
          expect(c.area, `${w}px ${id}/${v} ${c.id}`).toBeGreaterThanOrEqual(160);
          expect(c.titleFits, `${w}px ${id}/${v} ${c.id}: título del eje y`).toBe(true);
        }
      }
    }
  });

  test('GAL-04: cambiar de sistema funde del todo, construye por partes (sin tareas > 100 ms) y no salta el eje y', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      window.__glLong = [];
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__glLong.push({ s: e.startTime, d: e.duration }); })
          .observe({ type: 'longtask', buffered: true });
      } catch (err) { /* sin longtask */ }
    });
    await openGallery(page, gotoApp);
    await page.waitForTimeout(600);
    const measure = async (id) => {
      // Sin getComputedStyle por fotograma (forzaría estilo y maquetación a mitad de la construcción):
      // el fundido se sigue con los eventos de transición y la clase is-leaving.
      await page.evaluate(() => {
        const st = document.querySelector('[data-testid="gl-stage"]');
        const old = new Set([...document.querySelectorAll('#galeria canvas[data-testid^="gl-chart-"]')].map((c) => window.Chart.getChart(c).id));
        const rec = window.__glRec = { t0: performance.now(), ev: [], ax: {} };
        const now = () => Math.round(performance.now() - rec.t0);
        const onEv = (e) => { if (e.target === st && e.propertyName === 'opacity') rec.ev.push([e.type, now(), Math.round(e.elapsedTime * 1000)]); };
        st.addEventListener('transitionend', onEv);
        st.addEventListener('transitioncancel', onEv);
        const mo = new MutationObserver(() => rec.ev.push([st.classList.contains('is-leaving') ? 'out' : 'in', now()]));
        mo.observe(st, { attributes: true, attributeFilter: ['class'] });
        rec.stop = () => { st.removeEventListener('transitionend', onEv); st.removeEventListener('transitioncancel', onEv); mo.disconnect(); };
        const frame = () => {
          document.querySelectorAll('#galeria canvas[data-testid^="gl-chart-"]').forEach((c) => {
            const ch = window.Chart.getChart(c);
            if (!ch || old.has(ch.id)) return;
            (rec.ax[ch.id] = rec.ax[ch.id] || []).push(ch.scales.y.min + '..' + ch.scales.y.max);
          });
          if (performance.now() - rec.t0 < 1500) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await page.getByTestId(`gl-system-${id}`).click();
      await settled(page, { systemId: id });
      await page.waitForTimeout(1300);
      return page.evaluate(() => {
        const rec = window.__glRec;
        rec.stop();
        // ventana del cambio: de la tarea del clic (la que pone is-leaving) al final del fundido de entrada,
        // sin la reproducción anterior ni la posterior
        // (los eventos anteriores a «out» son del cambio previo: el final de su fundido de entrada)
        const ev = rec.ev.slice(Math.max(0, rec.ev.findIndex((e) => e[0] === 'out')));
        const ends = ev.filter((e) => e[0] === 'transitionend');
        const from = rec.t0 + (ev.length ? ev[0][1] : 0);
        const until = rec.t0 + (ends.length >= 2 ? ends[1][1] : 1e9);
        return {
          long: window.__glLong.filter((e) => e.s + e.d >= from && e.s <= until).map((e) => Math.round(e.d)),
          steps: window.DSL.app.handles.gallery.state().switchSteps,
          ev,
          axes: Object.values(rec.ax).map((list) => [...new Set(list)]),
        };
      });
    };
    for (const id of ['tanks', 'rlc', 'sir', 'market', 'massSpring']) {
      let r = await measure(id);
      if (r.long.some((d) => d > 100)) {
        // una tarea larga aislada puede venir de la máquina (otros procesos, GC): se repite el cambio una
        // vez; un paso que siempre pasa de 100 ms falla también la segunda medida
        const other = id === 'massSpring' ? 'rlc' : 'massSpring';
        await page.getByTestId(`gl-system-${other}`).click();
        await settled(page, { systemId: other });
        r = await measure(id);
      }
      if (r.long.some((d) => d > 100)) {
        // control: 3 s de reproducción sin cambiar de sistema; si también hay tareas > 100 ms, la máquina
        // está saturada (otros procesos) y la medida no dice nada del cambio
        const control = await page.evaluate(async () => {
          const t0 = performance.now();
          await new Promise((res) => setTimeout(res, 3000));
          return window.__glLong.filter((e) => e.s >= t0).map((e) => Math.round(e.d));
        });
        test.skip(control.some((d) => d > 100), `máquina saturada: tareas largas sin cambio de sistema (${control.join(', ')} ms)`);
      }
      const info = `${id}: pasos ${r.steps.join('/')} ms; eventos ${JSON.stringify(r.ev)}`;
      expect(r.long.filter((d) => d > 100), `${info}; tareas largas`).toEqual([]);
      expect(r.steps.length, info).toBeGreaterThanOrEqual(8);
      // fundido: sale entero (sin cancelarse ni invertirse), se construye, y entra entero
      const kinds = r.ev.map((e) => e[0]);
      expect(kinds, info).toEqual(['out', 'transitionend', 'in', 'transitionend']);
      expect(r.ev[1][2], info).toBeGreaterThanOrEqual(140);
      expect(r.ev[3][2], info).toBeGreaterThanOrEqual(190);
      // cada gráfica nueva se ve desde el primer fotograma con su rango definitivo
      expect(r.axes.length, `${id}: gráficas nuevas`).toBeGreaterThan(0);
      for (const a of r.axes) expect(a, `${id}: rangos del eje y`).toHaveLength(1);
    }
  });

  test('GAL-05: entre 768 y 1023 px los chips de categoría del riel se leen enteros', async ({ page, gotoApp }) => {
    for (const [w, hgt] of [[768, 1024], [820, 1180], [900, 900], [1023, 800]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await gotoApp('#galeria');
      await scrollUnderHeader(page, '[data-testid="gl-rail"]');
      const chips = await page.evaluate(() => [...document.querySelectorAll('#galeria .gl-sys')].map((b) => {
        const chip = b.querySelector('.gl-sys__cat');
        const lab = chip.querySelector('.ds-chip__label') || chip;
        const cr = chip.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return {
          id: b.dataset.system,
          clipped: lab.scrollWidth > lab.clientWidth + 1 || chip.scrollWidth > chip.clientWidth + 1,
          inside: cr.left >= br.left - 0.5 && cr.right <= br.right + 0.5,
        };
      }));
      expect(chips).toHaveLength(5);
      for (const c of chips) {
        expect(c.clipped, `${w}px ${c.id}: chip recortado`).toBe(false);
        expect(c.inside, `${w}px ${c.id}: chip fuera de la tarjeta`).toBe(true);
      }
      expect(await overflow(page)).toBe(0);
    }
  });

  test('GAL-06: con colores forzados la tarjeta elegida lleva contorno propio; a 320 px nada se sale de la sección', async ({ page, gotoApp }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ forcedColors: 'active' });
    await openGallery(page, gotoApp);
    const fc = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'Canvas';
      document.body.appendChild(probe);
      const canvas = getComputedStyle(probe).color;
      probe.remove();
      return [...document.querySelectorAll('#galeria .gl-sys')].map((b) => {
        const cs = getComputedStyle(b);
        return { sel: b.getAttribute('aria-selected') === 'true', style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), visible: cs.outlineColor !== canvas };
      });
    });
    expect(fc.filter((c) => c.sel)).toEqual([{ sel: true, style: 'solid', width: 2, visible: true }]);
    expect(fc.filter((c) => !c.sel).every((c) => c.style === 'none')).toBe(true);
    await expect(page.getByTestId('gl-rail-plate')).toBeHidden();

    await page.emulateMedia({ forcedColors: 'none' });
    await page.setViewportSize({ width: 320, height: 640 });
    await openGallery(page, gotoApp);
    for (const [id, v] of COMBOS) {
      await selectVia(page, id, v);
      expect(await escapees(page), `${id}/${v}`).toEqual([]);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('#galeria .ds-seg__opt')]
        .filter((o) => o.scrollWidth > o.clientWidth + 1).map((o) => o.textContent.trim()));
      expect(clipped, `${id}/${v}: segmentos recortados`).toEqual([]);
      const tall = await page.evaluate(() => [...document.querySelectorAll('#galeria .gl-sliders .ds-slider__name')].filter((n) => {
        const cs = getComputedStyle(n);
        const lh = parseFloat(cs.lineHeight) || 1.3 * parseFloat(cs.fontSize);
        return n.getBoundingClientRect().height > 2.5 * lh;
      }).map((n) => n.textContent.trim()));
      expect(tall, `${id}/${v}: nombres de parámetro en más de dos líneas`).toEqual([]);
    }
  });

  test('GAL-07: «Restablecer parámetros» no pierde el foco; con teclado el aviso lo recibe y lo devuelve al primer parámetro', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    const restore = page.getByTestId('gl-params-restore');
    await setNumber(page, 'gl-param-k', 12);
    await expect(restore).toBeEnabled();
    await restore.focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await glState(page)).params).toEqual({ m: 1, b: 0.8, k: 4 });
    await expect(restore).toBeDisabled();
    await expect(page.getByTestId('gl-toast-action')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('gl-toast')).toHaveCount(0);
    await expect(page.getByTestId('gl-param-m-input')).toBeFocused();

    // con el ratón el aviso no roba el foco, y el botón deshabilitado no lo deja caer en <body>
    await setNumber(page, 'gl-param-k', 12);
    await expect(restore).toBeEnabled();
    await restore.click();
    await expect.poll(async () => (await glState(page)).params.k).toBe(4);
    await expect(page.getByTestId('gl-toast')).toBeVisible();
    await expect(page.getByTestId('gl-toast-action')).not.toBeFocused();
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      return { body: a === document.body, inParams: !!a.closest('.gl-panel--params') };
    });
    expect(where).toEqual({ body: false, inParams: true });
  });

  test('GAL-08: con el deslizador en marcha las lecturas se anuncian una sola vez, al detenerse', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await spyLive(page);
    await page.getByTestId('gl-param-k-input').focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    const during = await liveTexts(page);
    expect(during.length).toBeLessThanOrEqual(2);
    await page.waitForTimeout(900);
    const fresh = (await liveTexts(page)).slice(during.length);
    const label = await page.evaluate(() => {
      const st = window.DSL.app.handles.gallery.state();
      return window.DSL.systems.get('massSpring').readouts(st.params, 'base')[0].label;
    });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toContain(label);
    expect(fresh[0]).not.toMatch(/\.\./);
  });

  test('GAL-09: el nombre de cada pestaña contiene su texto visible (axe) y el panel se llama como el sistema', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    const axe = await new AxeBuilder({ page }).include('#galeria').withRules(['label-content-name-mismatch']).analyze();
    expect(axe.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(', '))).toEqual([]);
    await expect(page.getByRole('tab', { name: /^Mecánico Masa-resorte-amortiguador Una masa/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Masa-resorte-amortiguador', exact: true })).toBeVisible();
    await scrollUnderHeader(page, '[data-testid="gl-rail"]');
    await pick(page, 'rlc');
    await expect(page.getByRole('tabpanel', { name: 'Circuito RLC serie', exact: true })).toBeVisible();
  });

  test('GAL-10: los avisos y anuncios no acaban en «..»', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    const out = await page.evaluate(() => {
      const s = window.DSL.sections.gallery.helpers.sentence;
      return [s('Hola.'), s('Hola'), s('¿Qué?'), s('Fin…'), s('u.m. '), s('')];
    });
    expect(out).toEqual(['Hola.', 'Hola.', '¿Qué?', 'Fin…', 'u.m.', '']);
    await pick(page, 'market', 'telarana');
    await spyLive(page);
    await setNumber(page, 'gl-param-d', 4);
    await setNumber(page, 'gl-param-b', 0.5);
    await page.getByTestId('gl-speed-4').click();
    await expect(page.getByTestId('gl-halt')).toBeVisible({ timeout: 15_000 });
    expect(await page.getByTestId('gl-halt').textContent()).not.toMatch(/\.\./);
    await page.waitForTimeout(300);
    const live = await liveTexts(page);
    expect(live.length).toBeGreaterThan(0);
    for (const t of live) expect(t).not.toMatch(/\.\./);
  });

  test('GAL-11: las lecturas con explicación del modelo llevan su ayuda', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await pick(page, 'market', 'telarana');
    const tips = await page.evaluate(() => {
      const st = window.DSL.app.handles.gallery.state();
      return (window.DSL.systems.get('market').readouts(st.params, 'telarana') || []).filter((r) => r.tip).map((r) => ({ id: r.id, tip: r.tip }));
    });
    test.skip(!tips.length, 'Requiere CORE-13 (tip en las lecturas del modelo).');
    for (const t of tips) {
      const ro = page.getByTestId(`gl-readout-${t.id}`);
      await expect(ro.getByTestId(`gl-readout-${t.id}-help`)).toBeVisible();
      await expect(ro).toContainText(t.tip);
    }
  });

  test('GAL-12: arranque por fases (≤ 50 ms) en tiempo ocioso, esqueleto con la geometría final y data-lazy antes de 5 s', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    const geo = () => page.evaluate(() => {
      const st = document.querySelector('[data-testid="gl-stage"]');
      return {
        phases: window.DSL.app.handles.gallery.state().initPhases,
        pending: st.classList.contains('is-pending'),
        busy: st.getAttribute('aria-busy'),
        skel: !!st.querySelector('[data-testid="gl-skeleton"]'),
        nextTop: Math.round(document.getElementById('transferencia').getBoundingClientRect().top + window.scrollY),
      };
    });
    const run = async () => {
      await gotoApp();
      const pre = await geo();
      if (pre.phases.length <= 1) {
        expect(pre.pending).toBe(true);
        expect(pre.busy).toBe('true');
        expect(pre.skel).toBe(true);
      }
      await expect.poll(() => page.evaluate(() => document.querySelector('#galeria .gl').dataset.lazy || null), { timeout: 5_000 }).toBe('done');
      const post = await geo();
      expect((await glState(page)).ready).toBe(true);
      expect([post.pending, post.busy, post.skel]).toEqual([false, null, false]);
      expect(post.phases).toHaveLength(10);
      // la reserva del escenario es la del construido: lo que sigue a la galería apenas se mueve
      expect(Math.abs(post.nextTop - pre.nextTop)).toBeLessThanOrEqual(120);
      return post.phases;
    };
    let phases = await run();
    // una fase lenta aislada puede venir de la máquina (otros procesos, GC): se recarga y se mide una vez
    // más; una fase que siempre pasa de 50 ms falla también la segunda medida
    if (phases.some((ms) => ms > 50)) phases = await run();
    for (const ms of phases) expect(ms, `fases: ${phases.join(', ')} ms`).toBeLessThanOrEqual(50);
  });

  test('GAL-12: el salto del menú a la galería no deja huecos de más de 120 px en el escenario', TIMING, async ({ page, gotoApp }) => {
    await gotoApp();
    await page.waitForTimeout(300);
    await page.getByTestId('sh-nav-galeria').click();
    const band = () => page.evaluate(() => {
      const H = window.innerHeight;
      const st = document.querySelector('#galeria .gl-stage').getBoundingClientRect();
      const sel = ['.gl-head', '.gl-rail', '.gl-shead', '.gl-skel__head', '.gl-scene', '.gl-chart', '.gl-dock', '.gl-skel__dock', '.gl-data', '.gl-panel', '.gl-tf']
        .map((s) => '#galeria ' + s).join(', ');
      const lo = Math.max(0, st.top);
      const hi = Math.min(H, st.bottom);
      if (hi <= lo) return 0;
      const cov = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect())
        .filter((b) => b.height > 0).map((b) => [Math.max(lo, b.top), Math.min(hi, b.bottom)])
        .filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
      let gap = 0;
      let y = lo;
      for (const [a, b] of cov) { gap = Math.max(gap, a - y); y = Math.max(y, b); }
      return Math.round(Math.max(gap, hi - y));
    });
    await page.waitForTimeout(100);
    expect(await band()).toBeLessThanOrEqual(120);
    await settled(page);
    expect(await band()).toBeLessThanOrEqual(120);
  });

  test('GAL-13: el bucle se detiene cuando el visor sale de la vista aunque los paneles sigan a la vista', async ({ page, gotoApp }) => {
    await openGallery(page, gotoApp);
    await expect.poll(async () => (await glState(page)).running).toBe(true);
    await page.evaluate(() => {
      const v = document.querySelector('[data-testid="gl-viewer"]');
      window.scrollTo(0, window.scrollY + v.getBoundingClientRect().bottom + 120);
    });
    const vis = await page.evaluate(() => ({
      viewerBottom: document.querySelector('[data-testid="gl-viewer"]').getBoundingClientRect().bottom,
      panelsTop: document.querySelector('#galeria .gl-panels').getBoundingClientRect().top,
      h: window.innerHeight,
    }));
    expect(vis.viewerBottom).toBeLessThanOrEqual(-100);
    expect(vis.panelsTop).toBeLessThan(vis.h);
    await expect.poll(async () => (await glState(page)).running).toBe(false);
    await page.waitForTimeout(300);     // el último dibujo pendiente de las gráficas (un fotograma)
    let s = await glState(page);
    expect(s.playing).toBe(true);
    expect(s.viewerVisible).toBe(false);
    const updates = s.charts.map((c) => c.updates);
    const t0 = s.t;
    await page.waitForTimeout(2000);
    s = await glState(page);
    expect(s.charts.map((c) => c.updates)).toEqual(updates);
    expect(s.t).toBe(t0);
    // al volver sigue donde estaba, sin recuperar de golpe el tiempo perdido
    await scrollUnderHeader(page, '[data-testid="gl-stage"]');
    await expect.poll(async () => (await glState(page)).running).toBe(true);
    const t1 = (await glState(page)).t;
    expect(t1).toBeGreaterThanOrEqual(t0);
    expect(t1 - t0).toBeLessThan(1);
  });
});

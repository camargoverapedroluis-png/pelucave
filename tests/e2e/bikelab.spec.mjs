// tests/e2e/bikelab.spec.mjs — Propietario: bikelab.
// Laboratorio de la bicicleta en la página real (src y dist): inicio perezoso, escena en canvas a 60 fps,
// zoom al marco, capas de vectores, gráficas en tiempo real, parámetros en vivo, vista algebraica y diagrama
// de bloques interactivo (ratón y teclado), caída con «Reintentar», movimiento reducido y axe.
// Ejecutar: npx playwright test tests/e2e/bikelab.spec.mjs --project=src --no-deps --output "test-results/bikelab"
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, ROOT } from '../helpers/fixtures.mjs';

const SHOTS = path.join(ROOT, 'test-results', 'bikelab', 'shots');

/** Abre #galeria, completa el laboratorio y lo centra en la ventana (tras el asentamiento de la cabecera, 1.5 s). */
async function openLab(page, gotoApp, opts = {}) {
  await gotoApp('#galeria', opts);
  await page.evaluate(() => window.DSL.app.handles.bikeLab.init());
  await expect.poll(() => page.evaluate(() => window.DSL.app.handles.bikeLab.state().ready)).toBe(true);
  await page.waitForTimeout(1600);
  await center(page, 'bk-viewer');
  return page;
}

/** Desplaza la página para que el elemento quede centrado (fuera de la barra fija). */
async function center(page, testid) {
  await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`).scrollIntoView({ block: 'center', behavior: 'instant' }), testid);
  await page.waitForTimeout(150);
}

const state = (page) => page.evaluate(() => window.DSL.app.handles.bikeLab.state());

test.describe('laboratorio de la bicicleta', () => {
  test('se monta dentro de #galeria tras la galería, con su título, escena, gráficas y paneles', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    const root = page.locator('#galeria [data-mount="bikeLab"] .bk');
    await expect(root).toHaveCount(1);
    await expect(page.getByTestId('bk-title')).toContainText('Laboratorio avanzado');
    await expect(page.getByTestId('bk-stage')).toBeVisible();
    await expect(page.locator('.bk-chart canvas')).toHaveCount(3);
    await expect(page.locator('[data-testid^="bk-param-"] input[type="range"]')).toHaveCount(14);
    await expect(page.locator('.bk-readout')).toHaveCount(10);
    await expect(page.getByTestId('bk-verdict')).toContainText('Lazo cerrado estable');
    // El canvas tiene un búfer con DPR y se ha pintado (no está en blanco).
    const painted = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="bk-canvas"]');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBg = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) nonBg++;
      return { w: c.width, h: c.height, nonBg };
    });
    expect(painted.w).toBeGreaterThan(300);
    expect(painted.nonBg).toBeGreaterThan(50);
  });

  test('la simulación corre, las gráficas reciben muestras y el tiempo avanza', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    await expect.poll(async () => (await state(page)).running, { timeout: 8000 }).toBe(true);
    await expect.poll(async () => (await state(page)).t, { timeout: 8000 }).toBeGreaterThan(0.5);
    const st = await state(page);
    expect(st.playing).toBe(true);
    expect(st.charts.every((c) => c.points > 5)).toBe(true);
    await page.getByTestId('bk-play').click();
    const paused = await state(page);
    expect(paused.playing).toBe(false);
    await page.waitForTimeout(300);
    expect((await state(page)).t).toBe(paused.t);
  });

  test('zoom al marco, capas de vectores y freno', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    const zoom = page.getByTestId('bk-zoom');
    await zoom.click();
    await expect(zoom).toHaveAttribute('aria-pressed', 'true');
    expect((await state(page)).zoom).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'zoom.png'), clip: await page.getByTestId('bk-viewer').boundingBox() });
    await page.getByTestId('bk-layer-W').click();
    await expect(page.getByTestId('bk-layer-W')).toHaveAttribute('aria-pressed', 'false');
    const brake = page.getByTestId('bk-brake');
    await brake.click();
    await expect(brake).toHaveAttribute('aria-pressed', 'true');
    expect((await state(page)).braking).toBe(true);
    await brake.click();
    expect((await state(page)).braking).toBe(false);
    await zoom.click();
    expect((await state(page)).zoom).toBe(false);
  });

  test('los parámetros cambian en vivo las lecturas, las fórmulas y el veredicto del lazo', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await openLab(page, gotoApp);
    const before = await page.getByTestId('bk-eq-H').textContent();
    const k = page.getByTestId('bk-param-k-number');
    await k.fill('30000');
    await k.press('Enter');
    await expect.poll(async () => (await state(page)).params.k).toBe(30000);
    await expect.poll(async () => page.getByTestId('bk-eq-H').textContent()).not.toBe(before);
    await expect(page.getByTestId('bk-readout-wn-value')).not.toHaveText(/^—/);
    // Sin control el lazo deja de ser estable.
    for (const key of ['Kp', 'Kd', 'Ki']) {
      const n = page.getByTestId(`bk-param-${key}-number`);
      await n.fill('0');
      await n.press('Enter');
    }
    await expect.poll(async () => (await state(page)).verdict).not.toBe('estable');
    await page.getByTestId('bk-params-restore').click();
    await expect.poll(async () => (await state(page)).verdict).toBe('estable');
    await expect(page.getByTestId('bk-toast')).toBeVisible();
  });

  test('vista algebraica y diagrama de bloques: elegir un bloque o una señal muestra su detalle (ratón y teclado)', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    await expect(page.locator('[data-testid^="bk-eq-"]:not([data-testid^="bk-eq-pick"])')).toHaveCount(6);
    await page.getByTestId('bk-eq-pick-GC').click();
    await expect(page.getByTestId('bk-detail')).toContainText('Controlador biomecánico');
    await page.getByTestId('bk-view-diagram').click();
    await expect(page.getByTestId('bk-diagrambox')).toBeVisible();
    await expect(page.getByTestId('bk-algebra')).toBeHidden();
    await center(page, 'bk-diagrambox');
    await page.screenshot({ path: path.join(SHOTS, 'diagrama.png'), clip: await page.getByTestId('bk-diagrambox').boundingBox() });
    await page.getByTestId('bk-diagram-H').click();
    await expect(page.getByTestId('bk-diagram-H')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('bk-detail')).toContainText('Planta del amortiguador');
    await page.getByTestId('bk-diagram-Treac').click();
    await expect(page.getByTestId('bk-detail')).toContainText('Fuerza de reacción total');
    // Teclado: Tab hasta el bloque G_V y activar con Intro.
    await page.getByTestId('bk-diagram-GV').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('bk-detail')).toContainText('Actuador de desplazamiento corporal');
    expect((await state(page)).pick).toBe('GV');
    // Al pasar el ratón por otro bloque se previsualiza; al salir vuelve el elegido.
    await page.getByTestId('bk-diagram-G1').hover();
    await expect(page.getByTestId('bk-detail')).toContainText('Filtro de perturbación');
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('bk-detail')).toContainText('Actuador de desplazamiento corporal');
    // Los valores en vivo del diagrama se rellenan mientras corre.
    await expect(page.locator('[data-live="C"]')).not.toHaveText('—');
  });

  test('una pendiente extrema con frenada provoca la caída, el aviso y «Reintentar» recupera el control', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    const alpha = page.getByTestId('bk-param-alpha-number');
    await alpha.fill('55');
    await alpha.press('Enter');
    await page.getByTestId('bk-brake').click();
    await expect(page.getByTestId('bk-fall')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('bk-fall')).toContainText(/vuelco hacia delante/i);
    expect((await state(page)).fall).toBe('otb');
    await page.waitForTimeout(1600);   // animación de la caída completa
    await center(page, 'bk-viewer');
    await page.screenshot({ path: path.join(SHOTS, 'caida.png'), clip: await page.getByTestId('bk-viewer').boundingBox() });
    // Con 55° se vuelve a caer enseguida: se devuelve la pendiente a 10° antes de reintentar.
    await alpha.fill('10');
    await alpha.press('Enter');
    await center(page, 'bk-viewer');
    await page.getByTestId('bk-retry').click();
    await expect(page.getByTestId('bk-fall')).toBeHidden();
    const st = await state(page);
    expect(st.fall).toBeNull();
    expect(st.braking).toBe(false);
    expect(st.playing).toBe(true);
  });

  test('con movimiento reducido empieza en pausa y «Reproducir» la pone en marcha', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp, { reducedMotion: true });
    expect((await state(page)).playing).toBe(false);
    await page.getByTestId('bk-play').click();
    await expect.poll(async () => (await state(page)).running, { timeout: 8000 }).toBe(true);
    await expect.poll(async () => (await state(page)).t, { timeout: 8000 }).toBeGreaterThan(0.2);
  });

  test('accesibilidad: axe sin violaciones en el laboratorio', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    await page.getByTestId('bk-play').click();   // en pausa: el detalle y las lecturas no cambian durante el análisis
    // preload: false, como en tfengine: axe no descarga las hojas de estilo por XHR (bloqueado en file://).
    const axe = await new AxeBuilder({ page }).options({ preload: false }).include('[data-mount="bikeLab"]').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('capturas: vista general en ambos temas', async ({ page, gotoApp }) => {
    await openLab(page, gotoApp);
    await page.getByTestId('bk-play').click();
    await page.screenshot({ path: path.join(SHOTS, 'general-oscuro.png'), clip: await page.getByTestId('bk-viewer').boundingBox() });
    await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'general-claro.png'), clip: await page.getByTestId('bk-viewer').boundingBox() });
  });
});

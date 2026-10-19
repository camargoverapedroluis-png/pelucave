// tests/e2e/tfengine.spec.mjs — Propietario: tfengine.
// Sección #transferencia: modos, validación en español, evento tf:open, procedimiento, gráficas,
// métricas comparadas con DSL.core.tf, sin errores de consola (guard), capturas en ambos temas.
// Ejecutar: npx playwright test tests/e2e/tfengine.spec.mjs --project=src --output "test-results/tfengine"
import path from 'node:path';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';
import AxeBuilder from '@axe-core/playwright';

const SHOTS = path.join(ROOT, 'test-results', 'tfengine');

/** Abre la app en #transferencia y espera al primer cálculo. */
async function openEngine(page, gotoApp, opts = {}) {
  await gotoApp('#transferencia', opts);
  const sec = page.locator('#transferencia');
  await sec.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('tf-g')).toHaveAttribute('data-kind', /tf|diag/, { timeout: 10000 });
  return sec;
}

const result = (page) => page.evaluate(() => window.DSL.app.handles.tfengine.getResult());
const state = (page) => page.evaluate(() => window.DSL.app.handles.tfengine.getState());
const num = (s) => Number(String(s).replace(/−/g, '-').replace(/[^\d.\-e]/g, ''));

/** Escribe un valor exacto en el campo numérico de un slider y lo confirma con Enter. */
async function setSlider(page, testid, value) {
  const f = page.getByTestId(testid + '-number');
  await f.fill(String(value));
  await f.press('Enter');
}

/** Desplaza la página para que el elemento quede justo bajo la cabecera (y bajo la barra fija del procedimiento si es un paso). */
async function scrollToTestId(page, id) {
  await page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    const head = document.querySelector('[data-testid="tf-proc-bar"]');
    const barEl = head && getComputedStyle(head).display === 'contents' ? head.querySelector('.tf-proc__actions') : head;
    const bar = barEl && el.closest('[data-testid="tf-steps"]') ? barEl.offsetHeight : 0;
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - header - bar - 16);
  }, id);
  await page.waitForTimeout(350);
}

/** Espera a que el resultado cumpla una condición (el recálculo va en el siguiente frame). */
async function waitResult(page, fn, arg) {
  await page.waitForFunction(([src, a]) => {
    const r = window.DSL.app.handles.tfengine.getResult();
    // eslint-disable-next-line no-new-func
    return !!r && new Function('r', 'a', 'return (' + src + ')(r, a)')(r, a);
  }, [fn.toString(), arg]);
}

test.describe('#transferencia — motor de funciones de transferencia', () => {
  test('monta la sección con el masa-resorte por omisión, 7 pasos y números de DSL.core.tf', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await expect(page.locator('h2#transferencia-title')).toHaveText('Motor de funciones de transferencia');
    await expect(page.getByTestId('tf-mode-sistema')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tf-system')).toHaveValue('massSpring/base/x');

    const r = await result(page);
    expect(r.kind).toBe('tf');
    expect(r.den).toEqual([1, 0.8, 4]);
    expect(r.secondOrder.zeta).toBeCloseTo(0.2, 10);
    expect(r.secondOrder.wn).toBeCloseTo(2, 10);
    expect(r.steps).toEqual(['ley', 'laplace', 'despeje', 'canonica', 'polos', 'escalon', 'metricas']);

    // Lo que se muestra coincide con el motor (mismo formateo).
    const expected = await page.evaluate(() => {
      const G = new window.DSL.core.tf.TransferFunction([1], [1, 0.8, 4]);
      const i = G.stepInfo();
      const f = (x) => window.DSL.util.formatNumber(x, 4);
      return { mp: f(i.overshootPct), tp: f(i.peakTime), ts: f(i.settlingTime), tr: f(i.riseTime), fin: f(i.finalValue) };
    });
    await expect(page.getByTestId('tf-metric-mp-value')).toHaveText(expected.mp);
    await expect(page.getByTestId('tf-metric-tp-value')).toHaveText(expected.tp);
    await expect(page.getByTestId('tf-metric-ts-value')).toHaveText(expected.ts);
    await expect(page.getByTestId('tf-metric-tr-value')).toHaveText(expected.tr);
    await expect(page.getByTestId('tf-metric-final-value')).toHaveText(expected.fin);
    expect(num(expected.mp)).toBeCloseTo(52.66, 2);

    await expect(page.getByTestId('tf-stability')).toContainText('Estable');
    await expect(page.locator('[data-testid^="tf-step-"][data-testid$="-toggle"]')).toHaveCount(7);
    await expect(page.getByTestId('tf-step-1-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tf-step-2-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Gráficas creadas por la capa de charts.
    for (const id of ['tf-chart-step', 'tf-chart-pz', 'tf-chart-bode-mag', 'tf-chart-bode-phase']) {
      await expect(page.getByTestId(id)).toHaveAttribute('role', 'img');
    }
    await expect(page.getByTestId('tf-chart-step')).toHaveAttribute('aria-label', /Respuesta al escalón/);
  });

  test('«Paso siguiente» abre en orden y «Mostrar todo» despliega Routh, residuos e y(t)', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-next').click();
    await expect(page.getByTestId('tf-step-2-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tf-step-3-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('tf-show-all').click();
    for (let i = 1; i <= 7; i++) await expect(page.getByTestId(`tf-step-${i}-toggle`)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tf-next')).toBeDisabled();
    await expect(page.getByTestId('tf-show-all')).toContainText('Plegar todo');
    await expect(page.getByTestId('tf-routh')).toBeVisible();
    await expect(page.getByTestId('tf-routh').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('tf-pf')).toBeVisible();
    await expect(page.getByTestId('tf-yt')).toHaveAttribute('data-tex-src', /^y\(t\) = 0\.25 - e\^\{-0\.4t\}/);
    await expect(page.getByTestId('tf-metrics-table')).toContainText('aproximada');
    await expect(page.getByTestId('tf-metrics-table')).toContainText('exacta');
    await expect(page.getByTestId('tf-final')).toHaveAttribute('data-tex-src', /= 0\.25$/);
    await page.getByTestId('tf-show-all').click();
    await expect(page.getByTestId('tf-step-4-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('«Desde un sistema»: slider en vivo, cambio de sistema y «Restablecer parámetros» con deshacer', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-show-all').click();
    // b = 2 → ζ = b/(2√(k m)) = 0.5
    await setSlider(page, 'tf-param-b', 2);
    await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.5) < 1e-9);
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-tex-src', /s\^\{2\} \+ 2 s \+ 4/);
    await expect(page.getByTestId('tf-param-out-zeta-value')).toHaveText('0.5');
    await expect(page.getByTestId('tf-metric-mp-value')).toHaveText('16.3');
    expect((await result(page)).info.overshootPct).toBeCloseTo(16.3034, 3);

    await page.getByTestId('tf-reset-params').click();
    await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.2) < 1e-9);
    await expect(page.getByTestId('tf-toast')).toContainText('Parámetros restablecidos.');
    await page.getByTestId('tf-toast-action').click();
    await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.5) < 1e-9);

    // Primer orden: depósito lineal, K = R = 10, τ = A·R = 10 s.
    await page.getByTestId('tf-system').selectOption('tanks/lineal/h');
    await waitResult(page, (r) => r.entryId === 'tanks/lineal/h');
    const r = await result(page);
    expect(r.firstOrder.K).toBeCloseTo(10, 9);
    expect(r.firstOrder.tau).toBeCloseTo(10, 9);
    expect(r.info.riseTime).toBeCloseTo(10 * Math.log(9), 2);
    await expect(page.getByTestId('tf-metric-tp-sub')).toContainText('Sin pico');

    // Parámetros con unidades de presentación (mH, µF) en el RLC.
    await page.getByTestId('tf-system').selectOption('rlc/serie/vC');
    await waitResult(page, (r) => r.entryId === 'rlc/serie/vC');
    await expect(page.getByTestId('tf-param-L')).toContainText('mH');
    await expect(page.getByTestId('tf-param-C')).toContainText('µF');
    await expect(page.getByTestId('tf-io')).toContainText('Entrada:');
  });

  test('arrastre: recálculo por frame, procedimiento en vivo con resaltado y teclado en el slider', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-next').click();
    await page.getByTestId('tf-next').click();
    await page.getByTestId('tf-next').click();   // pasos 1–4 abiertos
    await expect(page.getByTestId('tf-step-4-toggle')).toHaveAttribute('aria-expanded', 'true');
    const updatesBefore = await page.evaluate(() => window.DSL.app.handles.tfengine.getResult().den[1]);
    expect(updatesBefore).toBeCloseTo(0.8, 9);
    // Registra los resaltados de 400 ms (clase is-changed) en el paso 4.
    await page.evaluate(() => {
      window.__changed = 0;
      const region = document.querySelector('[data-testid="tf-step-4-region"]');
      new MutationObserver((list) => {
        for (const m of list) if (m.target.classList && m.target.classList.contains('is-changed')) window.__changed++;
      }).observe(region, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    // Varios «input» seguidos sin «change» (arrastre): el resultado sigue al último valor.
    await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="tf-param-b-input"]');
      for (const v of [1, 1.4, 1.8, 2.4]) {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
    });
    await waitResult(page, (r) => Math.abs(r.den[1] - 2.4) < 1e-9);
    // El procedimiento abierto se actualiza en su sitio (debounce) y resalta la línea cambiada.
    await page.waitForFunction(() => window.__changed > 0);
    await expect(page.getByTestId('tf-param-out-zeta-value')).toHaveText('0.6');
    // Teclado: flechas en el slider confirman el valor.
    await page.getByTestId('tf-param-k-input').focus();
    await page.keyboard.press('ArrowRight');
    await waitResult(page, (r) => r.den[2] > 4);
  });

  test('SIR y telaraña: diagnóstico «sin G(s)» con enlace a los conceptos', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.evaluate(() => { window.__ev = []; window.DSL.bus.on('concepts:open', (p) => window.__ev.push(p)); });
    await page.getByTestId('tf-system').selectOption('sir/base');
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-kind', 'diag');
    await expect(page.getByTestId('tf-diagnostic')).toBeVisible();
    await expect(page.getByTestId('tf-charts-empty')).toBeVisible();
    await expect(page.getByTestId('tf-charts')).toBeHidden();
    const r = await result(page);
    expect(r.kind).toBe('diag');
    expect(r.steps).toContain('nolineal');
    await page.getByTestId('tf-diag-concepts').click();
    expect(await page.evaluate(() => window.__ev)).toEqual([{ card: 'linealidad', tab: 'superposicion' }]);

    await page.evaluate(() => { window.__ev.length = 0; });
    await page.getByTestId('tf-system').selectOption('market/telarana');
    await expect(page.getByTestId('tf-diagnostic')).toContainText(/discreto|diferencias|G\(s\)/);
    await page.getByTestId('tf-diag-concepts').click();
    expect(await page.evaluate(() => window.__ev)).toEqual([{ card: 'ecuaciones' }]);
  });

  test('«Forma estándar»: ζ = 0.5, ωn = 2 da Mp ≈ 16.3 % y tp ≈ 1.814 s; primer orden K = 2, τ = 3', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-mode-estandar').click();
    await expect(page.getByTestId('tf-panel-estandar')).toBeVisible();
    await setSlider(page, 'tf-std-zeta', '0,5');     // coma decimal aceptada
    await setSlider(page, 'tf-std-wn', 2);
    await waitResult(page, (r) => r.source === 'estandar' && Math.abs(r.secondOrder.zeta - 0.5) < 1e-9 && Math.abs(r.secondOrder.wn - 2) < 1e-9);
    const r = await result(page);
    expect(r.info.overshootPct).toBeCloseTo(16.3034, 3);
    expect(r.info.peakTime).toBeCloseTo(Math.PI / Math.sqrt(3), 3);   // π/ωd, ωd = 2·√(1−0.25)
    expect(r.secondOrder.canonical.settlingTime).toBeCloseTo(4, 9);
    await expect(page.getByTestId('tf-metric-mp-value')).toHaveText(/^16\.3/);
    await expect(page.getByTestId('tf-metric-tp-value')).toHaveText(/^1\.81/);
    await expect(page.getByTestId('tf-metric-ts-sub')).toContainText('aproximada');
    await expect(page.getByTestId('tf-roots-poles')).toHaveAttribute('data-tex-src', /-1 \\pm 1\.732j/);

    // ζ < 0: inestable, sin métricas.
    await setSlider(page, 'tf-std-zeta', -0.3);
    await expect(page.getByTestId('tf-stability')).toContainText('Inestable');
    await expect(page.getByTestId('tf-metric-mp-value')).toHaveText('—');

    // Primer orden.
    await page.getByTestId('tf-std-order-1').click();
    await expect(page.getByTestId('tf-std-zeta')).toBeHidden();
    await setSlider(page, 'tf-std-K', 2);
    await setSlider(page, 'tf-std-tau', 3);
    await waitResult(page, (r) => r.firstOrder && Math.abs(r.firstOrder.tau - 3) < 1e-9 && Math.abs(r.firstOrder.K - 2) < 1e-9);
    const r1 = await result(page);
    expect(r1.info.riseTime).toBeCloseTo(3 * Math.log(9), 2);
    expect(r1.info.settlingTime).toBeCloseTo(3 * Math.log(50), 2);
    expect(r1.info.finalValue).toBeCloseTo(2, 9);
    await expect(page.getByTestId('tf-metric-tr-sub')).toContainText('τ·ln 9');

    // Restablecer devuelve los valores por omisión y ofrece deshacer.
    await page.getByTestId('tf-reset-std').click();
    await waitResult(page, (r) => r.firstOrder && Math.abs(r.firstOrder.tau - 1) < 1e-9);
    await expect(page.getByTestId('tf-toast-action')).toHaveText('Deshacer');
  });

  test('«Personalizada»: errores de validación en español, coma decimal y ejemplos', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-mode-personalizada').click();
    await waitResult(page, (r) => r.source === 'personalizada');
    expect((await result(page)).den).toEqual([1, 4, 6, 4]);

    const num_ = page.getByTestId('tf-num');
    const den = page.getByTestId('tf-den');
    // Una entrada no válida conserva la última G(s) válida y lo avisa.
    await num_.fill('1');
    await den.fill('1 2 5');
    await den.press('Enter');
    await waitResult(page, (r) => r.den.join(' ') === '1 2 5');
    await den.fill('1 2 x');
    await den.press('Enter');
    await expect(page.getByTestId('tf-den')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('tf-stale')).toContainText('última G(s) válida');
    expect((await result(page)).den).toEqual([1, 2, 5]);
    await expect(page.getByTestId('tf-gpanel')).toHaveClass(/is-stale/);

    const cases = [
      { n: '1', d: '', field: 'den', msg: /Escriba los coeficientes del denominador/ },
      { n: '1', d: '1 2 x', field: 'den', msg: /«x» no es un número/ },
      { n: '1 2 3', d: '1 2', field: 'num', msg: /no puede tener mayor grado/ },
      { n: '1', d: '0 1 2', field: 'den', msg: /El primer coeficiente del denominador es 0/ },
      { n: '1', d: '1 2 3 4 5 6', field: 'den', msg: /hasta grado 4/ },
      { n: '0', d: '1 2', field: 'num', msg: /El numerador es 0/ },
    ];
    for (const c of cases) {
      await num_.fill(c.n);
      await den.fill(c.d);
      await den.press('Enter');
      const input = page.getByTestId('tf-' + c.field);
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId(`tf-${c.field}-error`)).toHaveText(c.msg);
      await expect(page.getByTestId('tf-stale')).toBeVisible();
      const other = c.field === 'num' ? 'den' : 'num';
      await expect(page.getByTestId('tf-' + other)).not.toHaveAttribute('aria-invalid', 'true');
    }
    expect((await state(page)).customError.code).toBe('num-zero');

    // Coma decimal y corrección: desaparece el error.
    await num_.fill('1,5 3');
    await den.fill('1 4 6 4');
    await den.press('Enter');
    await waitResult(page, (r) => r.num[0] === 1.5);
    await expect(page.getByTestId('tf-num-error')).toBeHidden();
    await expect(page.getByTestId('tf-den')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('tf-stale')).toHaveCount(0);
    await expect(page.getByTestId('tf-custom-degree')).toContainText('estrictamente propia');

    // Ejemplos: polo triple (y(t) con potencias de t), Routh con fila nula (marginal) y fase no mínima.
    await page.getByTestId('tf-preset-polo-triple').click();
    await waitResult(page, (r) => r.den.join(' ') === '1 3 3 1');
    await page.getByTestId('tf-show-all').click();
    await expect(page.getByTestId('tf-yt')).toHaveAttribute('data-tex-src', /0\.5\\,t\^\{2\}\\,e\^\{-t\}/);
    await expect(page.getByTestId('tf-roots-poles')).toHaveAttribute('data-tex-src', /triple/);

    await page.getByTestId('tf-preset-routh-fila-nula').click();
    await waitResult(page, (r) => r.den.join(' ') === '1 2 1 2');
    await expect(page.getByTestId('tf-stability')).toContainText('Marginalmente estable');
    await expect(page.getByTestId('tf-final')).toContainText('no se aplica');
    await expect(page.getByTestId('tf-metric-final-sub')).toContainText('marginalmente estable');

    await page.getByTestId('tf-preset-fase-no-minima').click();
    await waitResult(page, (r) => r.den.join(' ') === '1 3 2');
    await expect(page.getByTestId('tf-metric-mp-sub')).toContainText('Subimpulso');

    // Propia no estricta: término directo.
    await num_.fill('1 0 1');
    await den.fill('1 2 1');
    await den.press('Enter');
    await waitResult(page, (r) => r.num.length === 3);
    await expect(page.getByTestId('tf-custom-degree')).toContainText('propia (no estrictamente');
    await expect(page.getByTestId('tf-proper').locator('.ds-chip__label')).toHaveText('Propia');
  });

  test('tf:open carga sistema, variante (alias) y parámetros, y resalta el panel', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await page.getByTestId('tf-mode-personalizada').click();
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'rlc', variant: 'serie', params: { R: 20, L: 0.1, C: 1e-5 }, outputKey: 'vC' }));
    await expect(page.getByTestId('tf-mode-sistema')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tf-system')).toHaveValue('rlc/serie/vC');
    await expect(page.getByTestId('tf-controls')).toHaveClass(/tf-flash/);
    await expect(page.getByTestId('tf-gpanel')).toHaveClass(/tf-flash/);
    await waitResult(page, (r) => r.entryId === 'rlc/serie/vC' && Math.abs(r.secondOrder.zeta - 0.1) < 1e-9);
    const r = await result(page);
    expect(r.secondOrder.wn).toBeCloseTo(1000, 6);
    expect(r.info.overshootPct).toBeCloseTo(72.92, 1);
    await expect(page.getByTestId('tf-param-L-number')).toHaveValue('100');   // 0.1 H = 100 mH
    expect((await state(page)).sys.params).toMatchObject({ R: 20, L: 0.1, C: 1e-5 });

    // Alias de variante (ajuste → walras) y salida implícita.
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'market', variant: 'ajuste', params: { alpha: 0.5 } }));
    await waitResult(page, (r) => r.entryId === 'market/walras/P' && Math.abs(r.den[1] - 1.75) < 1e-9);
    await expect(page.getByTestId('tf-note')).toBeVisible();

    // Valores fuera de rango se acotan; claves desconocidas se ignoran.
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'massSpring', params: { b: 99, foo: 1 } }));
    await waitResult(page, (r) => r.entryId === 'massSpring/base/x');
    expect((await state(page)).sys.params.b).toBe(5);
  });

  test('tf:open antes de la inicialización perezosa se conserva y se aplica', async ({ page, gotoApp }) => {
    await gotoApp('');
    const before = await page.evaluate(() => window.DSL.app.handles.tfengine.getResult());
    expect(before).toBeNull();
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'tanks', variant: 'cascada', params: { A1: 1.5 }, outputKey: 'h2' }));
    await waitResult(page, (r) => r.entryId === 'tanks/cascada/h2');
    expect((await state(page)).mode).toBe('sistema');
    expect((await state(page)).sys.params.A1).toBe(1.5);
  });

  test('mount() es síncrono y ligero: sin cálculo ni gráficas hasta que la sección se acerca', TIMING, async ({ page, gotoApp }) => {
    await gotoApp('');
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-mount="tfengine"]');
      window.DSL.app.handles.tfengine.destroy();
      const t0 = performance.now();
      const handle = window.DSL.sections.tfengine.mount(el);
      const ms = performance.now() - t0;
      const out = { ms, title: !!el.querySelector('h2#transferencia-title'), result: handle.getResult(), charts: el.querySelectorAll('canvas[role="img"]').length };
      window.DSL.app.handles.tfengine = handle;
      return out;
    });
    console.log(`mount(): ${m.ms.toFixed(1)} ms`);
    expect(m.title).toBe(true);
    expect(m.result).toBeNull();
    expect(m.charts).toBe(0);
    expect(m.ms).toBeLessThan(150);
    await page.locator('#transferencia').scrollIntoViewIfNeeded();
    await waitResult(page, (r) => r.kind === 'tf');
  });

  test('impulso opcional, «Ver datos» y destroy() limpio', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await expect(page.getByTestId('tf-chart-impulse')).toBeHidden();
    await page.getByTestId('tf-impulse-toggle').click();
    await expect(page.getByTestId('tf-impulse-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('tf-chart-impulse')).toBeVisible();
    await expect(page.getByTestId('tf-chart-impulse')).toHaveAttribute('role', 'img');
    await page.getByTestId('tf-chart-step-data-toggle').click();
    await expect(page.getByTestId('tf-chart-step-data')).toBeVisible();

    const left = await page.evaluate(() => {
      const el = document.querySelector('[data-mount="tfengine"]');
      window.DSL.app.handles.tfengine.destroy();
      window.DSL.bus.emit('tf:open', { systemId: 'massSpring' });
      return el.childElementCount;
    });
    expect(left).toBe(0);
  });

  test('sin desbordamiento horizontal a 1024, 768 y 390 px', async ({ page, gotoApp }) => {
    for (const [w, h] of [[1024, 768], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await openEngine(page, gotoApp);
      await page.getByTestId('tf-show-all').click();
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `desbordamiento a ${w}px`).toBeLessThanOrEqual(0);
      const wide = await page.evaluate(() => {
        const sec = document.querySelector('[data-mount="tfengine"]').getBoundingClientRect();
        return [...document.querySelectorAll('[data-mount="tfengine"] *')]
          .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.right > sec.right + 1 && !n.closest('.tf-table-wrap, .ds-math-block, .tf-g, .tf-roots__v, .ds-tabs__list, .tf-std-form, .tf-io__pair'); })
          .map((n) => n.className || n.tagName).slice(0, 5);
      });
      expect(wide, `elementos fuera de la sección a ${w}px`).toEqual([]);
    }
  });

  for (const theme of ['dark', 'light']) {
    for (const [w, h] of [[1440, 900], [1024, 768]]) {
      test(`capturas ${w}×${h} (${theme})`, async ({ page, gotoApp }) => {
        test.setTimeout(90_000);   // la de 1440 oscuro hace 13 capturas; bajo carga pasa de 30 s
        await page.setViewportSize({ width: w, height: h });
        await openEngine(page, gotoApp, { reducedMotion: true });
        await page.evaluate((t) => window.DSL.prefs.setTheme(t), theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const tag = `tf-${w}-${theme}`;
        await page.locator('#transferencia-title').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -80));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, `${tag}-top.png`), animations: 'disabled' });
        await page.getByTestId('tf-show-all').click();
        await page.waitForTimeout(500);
        const parts = w === 1440 && theme === 'dark'
          ? ['tf-step-4', 'tf-step-5', 'tf-step-6', 'tf-step-7', 'tf-charts', 'tf-metrics']
          : ['tf-step-5', 'tf-charts', 'tf-metrics'];
        for (const id of parts) {
          await scrollToTestId(page, id);
          await page.screenshot({ path: path.join(SHOTS, `${tag}-${id.replace('tf-', '')}.png`), animations: 'disabled' });
        }
        await page.locator('#transferencia').screenshot({ path: path.join(SHOTS, `${tag}-full.png`), animations: 'disabled' });
        if (w === 1440 && theme === 'dark') {
          await page.getByTestId('tf-mode-personalizada').click();
          await page.getByTestId('tf-den').fill('1 2 x');
          await page.getByTestId('tf-den').press('Enter');
          await expect(page.getByTestId('tf-den-error')).toBeVisible();
          await scrollToTestId(page, 'tf-mode');
          await page.screenshot({ path: path.join(SHOTS, `${tag}-error.png`), animations: 'disabled' });
          await page.getByTestId('tf-mode-sistema').click();
          await page.getByTestId('tf-system').selectOption('sir/base');
          await scrollToTestId(page, 'tf-mode');
          await page.screenshot({ path: path.join(SHOTS, `${tag}-sir.png`), animations: 'disabled' });
          await page.getByTestId('tf-mode-estandar').click();
          await page.getByTestId('tf-std-order-1').click();
          await scrollToTestId(page, 'tf-mode');
          await page.screenshot({ path: path.join(SHOTS, `${tag}-estandar.png`), animations: 'disabled' });
        }
      });
    }
  }

  test('captura 390 px (oscuro)', async ({ page, gotoApp }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEngine(page, gotoApp, { reducedMotion: true });
    await page.getByTestId('tf-show-all').click();
    await page.waitForTimeout(400);
    for (const id of ['tf-mode', 'tf-gpanel', 'tf-step-5', 'tf-step-7', 'tf-charts', 'tf-metrics']) {
      await scrollToTestId(page, id);
      await page.screenshot({ path: path.join(SHOTS, `tf-390-dark-${id.replace('tf-', '')}.png`), animations: 'disabled' });
    }
  });
});

/* ======================================================================= regresiones de la auditoría TFE */

/** Espera a que la inicialización por fases termine (root[data-lazy="done"]). */
const lazyDone = (page, timeout = 5000) =>
  page.waitForFunction(() => document.querySelector('[data-mount="tfengine"]').dataset.lazy === 'done', null, { timeout });

/** Personalizada: escribe numerador y denominador y los confirma con Enter. */
async function setCustom(page, n, d) {
  if ((await state(page)).mode !== 'personalizada') {
    await page.getByTestId('tf-mode-personalizada').click();
    await waitResult(page, (r) => r.source === 'personalizada');
  }
  await page.getByTestId('tf-num').fill(n);
  await page.getByTestId('tf-den').fill(d);
  await page.getByTestId('tf-den').press('Enter');
}

/** Abre los siete pasos si no lo están. */
async function openAll(page) {
  const btn = page.getByTestId('tf-show-all');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  for (let i = 1; i <= 7; i++) await expect(page.getByTestId(`tf-step-${i}-toggle`)).toHaveAttribute('aria-expanded', 'true');
}

/** Fuentes TeX de un paso, una por línea. */
const texOf = (page, k) => page.evaluate((k) =>
  [...document.querySelectorAll(`[data-testid="tf-step-${k}-region"] [data-tex-src]`)].map((e) => e.getAttribute('data-tex-src')).join('\n'), k);

/** Espera a que el desplazamiento (suave o no) se detenga. */
async function settleScroll(page) {
  await page.waitForTimeout(80);
  await page.evaluate(() => new Promise((resolve) => {
    let last = -1;
    let same = 0;
    const tick = () => {
      const y = window.scrollY;
      if (y === last) { if (++same >= 6) { resolve(); return; } } else { same = 0; last = y; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

/** Curvas fantasma visibles en una gráfica de Chart.js (escalón o magnitud de Bode). */
const ghosts = (page, testid) => page.evaluate((tid) => {
  const c = window.Chart.getChart(document.querySelector(`[data-testid="${tid}"]`));
  if (!c) return -1;
  return c.data.datasets.filter((d, i) => (d._role === 'ghost' || (tid === 'tf-chart-bode-mag' && i === 0)) && !d.hidden && d.data && d.data.length > 0).length;
}, testid);

/** Registro de la región viva compartida (ds-live) desde la carga. */
async function recordAnnouncements(page) {
  await page.addInitScript(() => {
    window.__ann = [];
    let last = '';
    const start = () => new MutationObserver(() => {
      const el = document.querySelector('[data-testid="ds-live"]');
      const t = el ? el.textContent : '';
      if (t !== last) { last = t; if (t) window.__ann.push(t); }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  });
}
const recalcAnnouncements = (page) => page.evaluate(() => window.__ann.filter((t) => /G\(s\) recalculada|no tiene G\(s\)/.test(t)).length);

const axe = (page) => new AxeBuilder({ page }).include('#transferencia').options({ preload: false });

test.describe('#transferencia — regresiones TFE-01…TFE-16', () => {
  for (const [w, h] of [[1440, 900], [820, 1180]]) {
    test(`TFE-01: «Paso siguiente» deja cada paso nuevo entero bajo la barra fija y el foco en el paso 7 (${w}×${h})`, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: h });
      await openEngine(page, gotoApp);
      await lazyDone(page);
      const next = page.getByTestId('tf-next');
      await next.scrollIntoViewIfNeeded();
      for (let k = 2; k <= 7; k++) {
        await next.click();
        await expect(page.getByTestId(`tf-step-${k}-toggle`)).toHaveAttribute('aria-expanded', 'true');
        await settleScroll(page);
        const m = await page.evaluate((k) => {
          const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
          const barEl = document.querySelector('[data-testid="tf-proc-bar"]');
          const bar = barEl.getBoundingClientRect();
          const li = document.querySelector(`[data-testid="tf-step-${k}-toggle"]`).closest('li').getBoundingClientRect();
          const nb = document.querySelector('[data-testid="tf-next"]');
          const r = nb.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { header, barH: bar.height, barBottom: bar.bottom, top: li.top, nTop: r.top, nBottom: r.bottom, hit: nb.contains(hit), vh: window.innerHeight, pos: getComputedStyle(barEl).position };
        }, k);
        expect(m.pos).toBe('sticky');
        expect(m.top, `paso ${k}: no queda bajo la barra`).toBeGreaterThanOrEqual(m.barBottom - 1);
        expect(m.top, `paso ${k}: arriba, a cabecera + barra + 24 px como mucho`).toBeLessThanOrEqual(m.header + m.barH + 24);
        expect(m.nTop, `paso ${k}: «Paso siguiente» bajo la cabecera`).toBeGreaterThanOrEqual(m.header);
        expect(m.nBottom, `paso ${k}: «Paso siguiente» dentro de la vista`).toBeLessThanOrEqual(m.vh);
        expect(m.hit, `paso ${k}: «Paso siguiente» sin tapar`).toBe(true);
      }
      await expect(next).toBeDisabled();
      await expect(page.getByTestId('tf-step-7-toggle')).toBeFocused();
    });
  }

  test('TFE-01: con movimiento reducido el paso aparece entero, sin animación ni desplazamiento suave', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp, { reducedMotion: true });
    await lazyDone(page);
    await page.getByTestId('tf-next').scrollIntoViewIfNeeded();
    await page.getByTestId('tf-next').click();
    const m = await page.evaluate(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await raf();
      const y1 = window.scrollY;
      await new Promise((r) => setTimeout(r, 400));
      const y2 = window.scrollY;
      const reg = document.querySelector('[data-testid="tf-step-2-region"]');
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
      const bar = document.querySelector('[data-testid="tf-proc-bar"]').getBoundingClientRect();
      return {
        y1, y2,
        anims: [...reg.querySelectorAll('.tf-line')].map((l) => getComputedStyle(l).animationName),
        region: getComputedStyle(reg).transitionDuration,
        top: reg.closest('li').getBoundingClientRect().top, max: header + bar.height + 24,
      };
    });
    expect(m.y2, 'sin desplazamiento suave: la posición final llega en el primer frame').toBe(m.y1);
    expect(m.anims.length).toBeGreaterThan(0);
    expect([...new Set(m.anims)]).toEqual(['none']);
    expect(m.region).toBe('0s');
    expect(m.top).toBeLessThanOrEqual(m.max);
  });

  test('TFE-01: con movimiento normal los bloques entran en 250 ms escalonados 60 ms', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await page.getByTestId('tf-next').click();
    const a = await page.evaluate(() => [...document.querySelectorAll('[data-testid="tf-step-2-region"] .tf-line')].slice(0, 3).map((l) => {
      const cs = getComputedStyle(l);
      return { name: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay };
    }));
    expect(a.map((x) => x.name)).toEqual(['tf-rise', 'tf-rise', 'tf-rise']);
    expect(a.map((x) => x.dur)).toEqual(['0.25s', '0.25s', '0.25s']);
    expect(a.map((x) => x.delay)).toEqual(['0s', '0.06s', '0.12s']);
  });

  for (const [w, h] of [[768, 1024], [820, 1180]]) {
    test(`TFE-02: tableta vertical ${w}×${h}: dos columnas, el slider y la gráfica a la vez`, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: h });
      await openEngine(page, gotoApp);
      await lazyDone(page);
      const g = await page.evaluate(() => {
        const c = document.querySelector('[data-testid="tf-controls"]');
        const main = document.querySelector('[data-testid="tf-gpanel"]').getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        return { cw: cr.width, cr: cr.right, ml: main.left, mw: main.width, pos: getComputedStyle(c).position };
      });
      expect(g.cw).toBeGreaterThanOrEqual(240);
      expect(g.cw).toBeLessThanOrEqual(280);
      expect(g.mw).toBeGreaterThanOrEqual(380);
      expect(g.ml).toBeGreaterThan(g.cr);
      expect(g.pos).toBe('sticky');
      await scrollToTestId(page, 'tf-chart-step');
      const both = () => page.evaluate(() => {
        const vh = window.innerHeight;
        const s = document.querySelector('[data-testid="tf-param-b"]').getBoundingClientRect();
        const c = document.querySelector('[data-testid="tf-chart-step"]').getBoundingClientRect();
        return { slider: s.top >= 0 && s.bottom <= vh, chart: c.top >= 0 && c.bottom <= vh };
      });
      expect(await both()).toEqual({ slider: true, chart: true });
      await setSlider(page, 'tf-param-b', 2);
      await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.5) < 1e-9);
      expect(await both()).toEqual({ slider: true, chart: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('TFE-02: el teléfono sigue en una columna y desde 900 px de contenedor no cambia', async ({ page, gotoApp }) => {
    const geo = () => page.evaluate(() => {
      const c = document.querySelector('[data-testid="tf-controls"]').getBoundingClientRect();
      const m = document.querySelector('[data-testid="tf-gpanel"]').getBoundingClientRect();
      return { cw: c.width, cl: c.left, ml: m.left, mt: m.top, cb: c.bottom };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openEngine(page, gotoApp);
    let g = await geo();
    expect(Math.abs(g.cl - g.ml)).toBeLessThanOrEqual(1);
    expect(g.mt).toBeGreaterThan(g.cb);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);
    g = await geo();
    expect(g.cw).toBeGreaterThanOrEqual(300);
    expect(g.cw).toBeLessThanOrEqual(360);
  });

  test('TFE-03: los nombres de los sliders caben en una línea a 768, 820, 1024, 1280 y 1440 px', async ({ page, gotoApp }) => {
    test.setTimeout(120_000);
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const systems = await page.$$eval('[data-testid="tf-system"] option', (os) => os.map((o) => o.value));
    const check = (where) => page.evaluate((where) => [...document.querySelectorAll('.tf-sliders .ds-slider__name')]
      .filter((n) => n.offsetParent)
      .map((n) => {
        const head = n.closest('.ds-slider__head').getBoundingClientRect();
        const b = n.getBoundingClientRect();
        return { where, name: n.textContent, lines: n.getClientRects().length, over: b.right - head.right, hy: getComputedStyle(n).hyphens };
      })
      .filter((x) => x.lines !== 1 || x.over > 0.5 || x.hy !== 'manual'), where);
    const bad = [];
    let seen = 0;
    for (const w of [768, 820, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.getByTestId('tf-mode-sistema').click();
      for (const id of systems) {
        await page.getByTestId('tf-system').selectOption(id);
        await page.waitForTimeout(20);
        seen += await page.locator('.tf-sliders .ds-slider__name:visible').count();
        bad.push(...await check(`${w} ${id}`));
      }
      await page.getByTestId('tf-mode-estandar').click();
      await page.getByTestId('tf-std-order-2').click();
      bad.push(...await check(`${w} estándar 2`));
      await page.getByTestId('tf-std-order-1').click();
      bad.push(...await check(`${w} estándar 1`));
    }
    expect(seen).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });

  // Regresión (integración tras TFE-03): con el nombre en su propia fila, el panel fijo de controles dejaba
  // «Restablecer parámetros» cortado en su borde inferior a 1024×768. Los sistemas de tres deslizadores y la
  // forma estándar deben caber enteros, con el botón dentro del panel, sin desplazarlo.
  test('panel de controles a 1024×768: los sistemas de tres deslizadores y la forma estándar caben sin desplazar el panel', async ({ page, gotoApp }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const fit = (resetId) => page.evaluate((resetId) => {
      const c = document.querySelector('[data-testid="tf-controls"]');
      const cr = c.getBoundingClientRect();
      const b = document.querySelector(`[data-testid="${resetId}"]`).getBoundingClientRect();
      return { pos: getComputedStyle(c).position, over: c.scrollHeight - c.clientHeight, inside: b.top >= cr.top && b.bottom <= cr.bottom - 1 };
    }, resetId);
    for (const id of ['massSpring/base/x', 'tanks/torricelli/h', 'rlc/serie/vC', 'rlc/serie/i']) {
      await page.getByTestId('tf-system').selectOption(id);
      await page.waitForTimeout(50);
      expect({ id, ...(await fit('tf-reset-params')) }).toEqual({ id, pos: 'sticky', over: 0, inside: true });
    }
    await page.getByTestId('tf-mode-estandar').click();
    await page.getByTestId('tf-std-order-2').click();
    expect(await fit('tf-reset-std')).toEqual({ pos: 'sticky', over: 0, inside: true });
  });

  // Regresión (integración tras TFE-02): con dos columnas en tableta vertical la gráfica del escalón es
  // estrecha y el rótulo opcional «tr = …» se desplazaba encima del valle de la respuesta, tapándolo con su
  // fondo. Ningún rótulo dibujado (escalón y Bode) puede contener un punto de la curva actual.
  for (const [w, h] of [[820, 1180], [768, 1024], [1440, 900]]) {
    test(`rótulos de las gráficas a ${w}×${h}: ninguno tapa la curva actual`, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: h });
      await openEngine(page, gotoApp);
      await lazyDone(page);
      const covered = (tid) => page.evaluate((tid) => {
        const c = window.Chart.getChart(document.querySelector(`[data-testid="${tid}"]`));
        if (!c || !c.$labels) return null;
        const a = c.chartArea;
        const hits = [];
        c.data.datasets.forEach((ds, i) => {
          if (ds._role !== 'curve' || !c.isDatasetVisible(i)) return;
          const pts = ds.data.filter((p) => p && Number.isFinite(p.y)).map((p) => [c.scales.x.getPixelForValue(p.x), c.scales.y.getPixelForValue(p.y)])
            .filter(([x, y]) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom);
          const probe = [];
          pts.forEach((p, k) => { probe.push(p); if (k) probe.push([(p[0] + pts[k - 1][0]) / 2, (p[1] + pts[k - 1][1]) / 2]); });
          c.$labels.forEach((lb) => {
            const r = lb.rect;
            const n = probe.filter(([x, y]) => x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1).length;
            if (n) hits.push(`${lb.text}: ${n} puntos`);
          });
        });
        return { texts: c.$labels.map((l) => l.text.split(' ')[0]), hits };
      }, tid);
      for (const tid of ['tf-chart-step', 'tf-chart-bode-mag']) {
        await scrollToTestId(page, tid);
        await page.waitForFunction((tid) => { const c = window.Chart.getChart(document.querySelector(`[data-testid="${tid}"]`)); return !!(c && c.$labels); }, tid);
        await page.waitForTimeout(450);   // fin del revelado o del morph
        const r = await covered(tid);
        expect(r, tid).not.toBeNull();
        expect(r.hits, `${tid} ${w}×${h}`).toEqual([]);
        if (tid === 'tf-chart-step') expect(r.texts).toContain('Mp');
        if (tid === 'tf-chart-step' && w === 1440) expect(r.texts, 'a 1440 px «tr» sigue a la vista').toContain('tr');
      }
    });
  }

  test('TFE-04: el paso 4 explica la causa en primer y segundo orden sin ceros con a₀ ≤ 0', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await page.getByTestId('tf-mode-personalizada').click();
    await openAll(page);
    const OLD = 'No es un primer ni un segundo orden puro';
    for (const d of ['1 -2', '1 0', '1 0 0', '1 1 0', '1 1 -2']) {
      await setCustom(page, '1', d);
      await waitResult(page, (r, a) => r.den.join(' ') === a, d);
      const s4 = page.getByTestId('tf-step-4-region');
      await expect(s4, d).toContainText('orden puro');
      await expect(s4, d).toContainText(/s = 0|parte real positiva/);
      await expect(s4, d).not.toContainText(OLD);
      await expect(s4.locator('.katex-error')).toHaveCount(0);
    }
    // Con un cero (rlc/serie/i, G = Cs/(LCs² + RCs + 1)) la explicación de siempre no cambia.
    await page.getByTestId('tf-mode-sistema').click();
    await page.getByTestId('tf-system').selectOption('rlc/serie/i');
    await waitResult(page, (r) => r.entryId === 'rlc/serie/i');
    await openAll(page);
    await expect(page.getByTestId('tf-step-4-region')).toContainText(OLD);
    await expect(page.getByTestId('tf-step-4-region')).not.toContainText('orden puro, pero');
  });

  test('TFE-04/06: los pasos 4–7 renderizan su TeX (sin fuente cruda ni errores de KaTeX)', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const clean = async (label) => {
      for (let k = 4; k <= 7; k++) {
        const reg = page.getByTestId(`tf-step-${k}-region`);
        await expect(reg.locator('.katex-error'), `${label} paso ${k}`).toHaveCount(0);
        expect(await reg.innerText(), `${label} paso ${k}`).not.toMatch(/\\[a-z]|rac\{|\{\d/);
      }
    };
    await openAll(page);
    await clean('masa-resorte');
    for (const d of ['1 2', '1 2 5', '1 100.01 1', '1 4 6 4']) {
      await setCustom(page, '1', d);
      await waitResult(page, (r, a) => r.den.join(' ') === a, d);
      await openAll(page);
      await page.waitForTimeout(300);
      await clean(d);
    }
  });

  test('TFE-05: N = clamp(⌈20·T·máx|Im p|/(2π)⌉, 400, 20000) muestras en el escalón y el impulso', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    expect((await result(page)).samples).toBe(400);   // masa-resorte por omisión: el mínimo
    await page.getByTestId('tf-system').selectOption('rlc/serie/vC');
    await waitResult(page, (r) => r.entryId === 'rlc/serie/vC');
    await setSlider(page, 'tf-param-R', 2);
    await setSlider(page, 'tf-param-L', 1000);   // mH
    await setSlider(page, 'tf-param-C', 10);     // µF
    await waitResult(page, (r) => Math.abs(r.den[1] - 2) < 1e-9 && Math.abs(r.den[2] - 1e5) < 1e-3);
    const r = await result(page);
    const wmax = Math.max(...r.poles.map((p) => Math.abs(p.im)));
    const periods = r.horizon * wmax / (2 * Math.PI);
    expect(r.samples).toBe(Math.min(20000, Math.max(400, Math.ceil(20 * periods))));
    expect(r.samples).toBeGreaterThan(400);
    expect(r.samples / periods).toBeGreaterThanOrEqual(20);
    await page.getByTestId('tf-impulse-toggle').click();
    await expect(page.getByTestId('tf-chart-impulse')).toBeVisible();
    const chk = await page.evaluate(({ num, den, n, T }) => {
      const len = (tid) => {
        const c = window.Chart.getChart(document.querySelector(`[data-testid="${tid}"]`));
        return c.data.datasets.find((d) => d._role === 'curve').data.length;
      };
      const G = new window.DSL.core.tf.TransferFunction(num, den);
      const coarse = G.stepSamples(n, T);
      const fine = G.stepSamples(2 * n - 1, T);
      let err = 0;
      let amp = 0;
      for (let i = 0; i < n - 1; i++) err = Math.max(err, Math.abs(fine.y[2 * i + 1] - (coarse.y[i] + coarse.y[i + 1]) / 2));
      for (const y of fine.y) amp = Math.max(amp, Math.abs(y));
      return { step: len('tf-chart-step'), impulse: len('tf-chart-impulse'), rel: err / amp };
    }, { num: r.num, den: r.den, n: r.samples, T: r.horizon });
    expect(chk.step).toBe(r.samples);
    expect(chk.impulse).toBe(r.samples);
    expect(chk.rel, 'error en el punto medio entre muestras').toBeLessThanOrEqual(0.01);
  });

  test('TFE-06: Personalizada muestra los coeficientes con las cifras escritas; polos sin duplicados', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    // Sistemas y ejemplos: 4 cifras significativas.
    const sig = (tex) => (tex.match(/\d+(?:\.\d+)?/g) || []).map((t) => t.replace('.', '').replace(/^0+/, '').length);
    await page.getByTestId('tf-system').selectOption('tanks/torricelli/h');
    await waitResult(page, (r) => r.entryId === 'tanks/torricelli/h');
    expect(Math.max(...sig(await page.getByTestId('tf-g').getAttribute('data-tex-src')))).toBeLessThanOrEqual(4);

    await page.getByTestId('tf-mode-personalizada').click();
    await openAll(page);
    await setCustom(page, '1', '1 100.01 1');
    await waitResult(page, (r) => r.den[1] === 100.01);
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-tex-src', /s\^\{2\} \+ 100\.01 s \+ 1\}/);
    await expect.poll(() => texOf(page, 4)).toContain('\\frac{100.01}{2\\cdot 1} = 50.005');

    await setCustom(page, '1', '1 2.0001 1.0001');
    await waitResult(page, (r) => r.den[2] === 1.0001);
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-tex-src', /2\.0001 s \+ 1\.0001/);
    const poles = (await page.getByTestId('tf-roots-poles').getAttribute('data-tex-src')).split(/,\\quad\s*/).map((p) => p.split('=')[1].trim());
    expect(poles).toEqual(['-1.0001', '-1']);
    await expect.poll(() => texOf(page, 5)).toMatch(/\{-1\.0001\}.*\{-1\}/);

    // Hasta 10 cifras.
    await setCustom(page, '1', '1 3.14159265358979 2');
    await waitResult(page, (r) => Math.abs(r.den[1] - Math.PI) < 1e-12);
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-tex-src', /3\.141592654 s \+ 2\}/);

    // Los ejemplos vuelven a 4 cifras.
    await page.getByTestId('tf-preset-tercer-orden').click();
    await waitResult(page, (r) => r.den.length === 4);
    expect(Math.max(...sig(await page.getByTestId('tf-g').getAttribute('data-tex-src')))).toBeLessThanOrEqual(4);
  });

  test('paso 4: junto a ζ = 1, ωn y ζ llevan las cifras que hacen falta para que ζ escrito cumpla la desigualdad de la nota', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await page.getByTestId('tf-mode-personalizada').click();
    await openAll(page);
    const s4 = page.getByTestId('tf-step-4-region');
    const zetaOut = page.getByTestId('tf-param-out-zeta-value');

    // Sobreamortiguado con ζ = 1.0000000012: con las 5 cifras tecleadas se escribiría «1».
    await setCustom(page, '1', '1 2.0001 1.0001');
    await waitResult(page, (r) => r.den[2] === 1.0001 && r.secondOrder && r.secondOrder.damping === 'sobreamortiguado');
    await expect.poll(() => texOf(page, 4)).toContain('\\sqrt{1.0001} = 1.000049999');
    expect(await texOf(page, 4)).toContain('\\frac{2.0001}{2\\cdot 1.000049999} = 1.000000001');
    await expect(zetaOut).toHaveText('1.000000001');
    expect(Number(await zetaOut.textContent())).toBeGreaterThan(1);
    await expect(s4).toContainText('Como ζ > 1, el sistema es sobreamortiguado');
    await expect(s4).toContainText('Con 5 cifras, ζ se escribiría 1, justo la frontera entre regímenes; por eso aquí ωn y ζ llevan 10 cifras.');
    // Las lecturas largas caben en su celda (cifra y unidad), a 1440 y a 320 px.
    const overhang = () => page.evaluate(() => {
      const g = document.querySelector('[data-testid="tf-step-4-region"] [data-testid="tf-params"]');
      const right = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
      return [...g.querySelectorAll('.ds-readout')].map((ro) => {
        const inner = ro.getBoundingClientRect().right - parseFloat(getComputedStyle(ro).paddingRight);
        return Math.max(right(ro.querySelector('.ds-readout__num')), right(ro.querySelector('.ds-readout__unit'))) - inner;
      });
    });
    for (const o of await overhang()) expect(o).toBeLessThanOrEqual(0.5);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.waitForTimeout(300);
    for (const o of await overhang()) expect(o).toBeLessThanOrEqual(0.5);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Lejos de la frontera las cifras no cambian y no hay frase añadida.
    await setCustom(page, '1', '1 100.01 1');
    await waitResult(page, (r) => r.den[1] === 100.01);
    await expect.poll(() => texOf(page, 4)).toContain('\\frac{100.01}{2\\cdot 1} = 50.005');
    await expect(zetaOut).toHaveText('50.005');
    await expect(s4).not.toContainText('justo la frontera');

    // Crítico (polo doble): «Con ζ = 1» y ζ escrito 1.
    await setCustom(page, '1', '1 2 1');
    await waitResult(page, (r) => r.den[1] === 2 && r.den[2] === 1);
    await expect(zetaOut).toHaveText('1');
    await expect(s4).toContainText('Con ζ = 1 el amortiguamiento es crítico');
    await expect(s4).not.toContainText('justo la frontera');
  });

  test('ronda 2: en teléfono, la unidad de una lectura larga del paso 4 baja de línea sin sangría y en la línea sigue a un espacio', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await page.getByTestId('tf-mode-personalizada').click();
    await openAll(page);
    // Desde el borde izquierdo de la cifra hasta el primer glifo de la unidad, y si la unidad bajó de línea.
    // La lectura se mide a la vista: fuera de ella el rectángulo de un Range puede llegar vacío.
    const wn = async () => {
      await page.locator('[data-testid="tf-step-4-region"] [data-testid="tf-param-out-wn"]').scrollIntoViewIfNeeded();
      return measureWn();
    };
    const measureWn = () => page.evaluate(() => {
      const ro = document.querySelector('[data-testid="tf-step-4-region"] [data-testid="tf-param-out-wn"]');
      const num = ro.querySelector('.ds-readout__num');
      const unit = ro.querySelector('.ds-readout__unit');
      const t = unit.firstChild;
      const i = t.textContent.search(/\S/);
      const rg = document.createRange();
      rg.setStart(t, i);
      rg.setEnd(t, i + 1);
      const g = rg.getBoundingClientRect();
      const nb = num.getBoundingClientRect();
      return {
        text: ro.querySelector('.ds-readout__value').textContent,
        wrapped: g.top >= nb.bottom - 1, fromLeft: g.left - nb.left, fromRight: g.left - nb.right,
        sep: parseFloat(getComputedStyle(ro.querySelector('.ds-readout__value')).columnGap),
      };
    });
    for (const [den, wnText] of [['1 2.0001 1.0001', '1.000049999'], ['1 3.14159265358979 2', '1.414213562']]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setCustom(page, '1', den);
      await waitResult(page, (r, d) => JSON.stringify(r.den) === JSON.stringify(d.split(' ').map(Number)), den);
      await expect(page.getByTestId('tf-param-out-wn-value')).toHaveText(wnText);
      const wide = await wn();
      expect(wide.wrapped, `${den} a 1440 px`).toBe(false);
      // Un espacio entre cifra y unidad: el texto lo conserva y en pantalla es el hueco de un espacio de la unidad.
      expect(wide.text).toMatch(/^\d\.\d{9} rad\/s$/);
      expect(wide.sep).toBeGreaterThan(2);
      expect(Math.abs(wide.fromRight - wide.sep), JSON.stringify(wide)).toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(300);
      const narrow = await wn();
      expect(narrow.wrapped, `${den} a 320 px: la unidad baja de línea ${JSON.stringify(narrow)}`).toBe(true);
      expect(Math.abs(narrow.fromLeft), `${den} a 320 px: sangría de la unidad ${JSON.stringify(narrow)}`).toBeLessThanOrEqual(0.5);
    }
  });

  test('ronda 2: el anuncio cortés da ζ y ωn con las cifras que hacen falta junto a la frontera (y 3 lejos de ella)', async ({ page, gotoApp }) => {
    await recordAnnouncements(page);
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const said = (re) => page.evaluate((src) => window.__ann.filter((t) => new RegExp(src).test(t)).pop() || null, re.source);
    // Sobreamortiguado con ζ = 1.0000000012: con 3 cifras se anunciaría «ζ = 1».
    await setCustom(page, '1', '1 2.0001 1.0001');
    await waitResult(page, (r) => r.den[2] === 1.0001);
    await expect.poll(() => said(/G\(s\) recalculada/), { timeout: 5000 }).toContain('ζ = 1.000000001, ωn = 1.000049999 rad/s.');
    // Las mismas cifras que las lecturas del paso 4.
    await openAll(page);
    await expect(page.getByTestId('tf-param-out-zeta-value')).toHaveText('1.000000001');
    await expect(page.getByTestId('tf-param-out-wn-value')).toHaveText('1.000049999');
    // Lejos de la frontera: 3 cifras, como antes.
    await setCustom(page, '1', '1 100.01 1');
    await waitResult(page, (r) => r.den[1] === 100.01);
    const far = await page.evaluate(() => {
      const so = window.DSL.app.handles.tfengine.getResult().secondOrder;
      return `ζ = ${window.DSL.util.formatNumber(so.zeta, 3)}, ωn = ${window.DSL.util.formatNumber(so.wn, 3)} rad/s.`;
    });
    await expect.poll(() => said(/G\(s\) recalculada/), { timeout: 5000 }).toContain(far);
    // Crítico: «ζ = 1».
    await setCustom(page, '1', '1 2 1');
    await waitResult(page, (r) => r.den[1] === 2 && r.den[2] === 1);
    await expect.poll(() => said(/G\(s\) recalculada/), { timeout: 5000 }).toContain('ζ = 1, ωn = 1 rad/s.');
  });

  test('TFE-07: la frase de las métricas depende del caso', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const FO = 'Para un primer orden puro se comparan con τ·ln 9 y τ·ln 50';
    const SO = 'Para un segundo orden puro subamortiguado se comparan con las fórmulas canónicas';
    const NONE = 'Sin fórmula canónica: los valores se miden sobre la curva.';
    const s7 = page.getByTestId('tf-step-7-region');
    await openAll(page);
    await expect(s7).toContainText(SO);   // masa-resorte, ζ = 0.2
    for (const id of ['tanks/lineal/h', 'market/walras/P']) {
      await page.getByTestId('tf-system').selectOption(id);
      await waitResult(page, (r, a) => r.entryId === a, id);
      await openAll(page);
      await expect(s7, id).toContainText(FO);
      await expect(s7, id).not.toContainText(SO);
    }
    await page.getByTestId('tf-mode-personalizada').click();
    await page.getByTestId('tf-preset-tercer-orden').click();
    await waitResult(page, (r) => r.source === 'personalizada' && r.den.length === 4);
    await openAll(page);
    await expect(s7).toContainText(NONE);
    await expect(s7).not.toContainText(SO);
    await expect(s7).not.toContainText(FO);
  });

  test('TFE-08: avisos de coeficiente principal despreciable y de coma decimal', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const note = page.getByTestId('tf-trim-note');
    await setCustom(page, '1', '1e-15 1 1');
    await waitResult(page, (r) => r.den.join(' ') === '1 1');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('El coeficiente principal 1e-15 es despreciable frente a 1: se tomó grado 1.');
    await setCustom(page, '1e-15 1', '1 2');
    await waitResult(page, (r) => r.den.join(' ') === '1 2' && r.num.join(' ') === '1');
    await expect(note).toHaveText('En el numerador, el coeficiente principal 1e-15 es despreciable frente a 1: se tomó grado 0.');
    await setCustom(page, '1', '1 2');
    await expect(note).toBeHidden();
    await expect(note).toHaveText('');
    // «1,2» se lee como un solo coeficiente (1.2): el error lo explica.
    await setCustom(page, '1', '1,2');
    await expect(page.getByTestId('tf-den-error')).toContainText('La coma se interpretó como separador decimal (1,2 = 1.2): separe los coeficientes con espacios.');
    // Sin error, la coma decimal no lleva nota.
    await setCustom(page, '1,5 2', '1 3 2');
    await waitResult(page, (r) => r.num[0] === 1.5);
    await expect(page.getByTestId('tf-num-error')).toBeHidden();
    await expect(page.getByTestId('tf-den-error')).toBeHidden();
    await expect(note).toBeHidden();
  });

  test('TFE-09: el impulso de un sistema estable marca y∞ = 0', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await page.getByTestId('tf-impulse-toggle').click();
    const imp = page.getByTestId('tf-chart-impulse');
    await expect(imp).toHaveAttribute('aria-label', /valor final 0(?!\.?\d)/);
    await setCustom(page, '1', '1 -2');
    await waitResult(page, (r) => r.den.join(' ') === '1 -2');
    await expect(imp).toHaveAttribute('aria-label', /sin valor final/);
    await expect(imp).not.toHaveAttribute('aria-label', /valor final 0/);
  });

  for (const theme of ['dark', 'light']) {
    test(`TFE-10: G(s) desactualizada sin opacidad, con distintivo y contraste AA (${theme})`, async ({ page, gotoApp }) => {
      await openEngine(page, gotoApp, { reducedMotion: true });
      await lazyDone(page);
      await page.evaluate((t) => window.DSL.prefs.setTheme(t), theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const badge = page.getByTestId('tf-stale-badge');
      await expect(badge).toBeHidden();
      await setCustom(page, '1', '1 2 5');
      await waitResult(page, (r) => r.den.join(' ') === '1 2 5');
      await setCustom(page, '1', '1 2 x');
      await expect(page.getByTestId('tf-gpanel')).toHaveClass(/is-stale/);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Desactualizado: corrija la entrada');
      const dim = await page.evaluate(() => [document.querySelector('[data-testid="tf-gpanel"]'), ...document.querySelectorAll('[data-testid="tf-gpanel"] *')]
        .filter((e) => Number(getComputedStyle(e).opacity) < 1).map((e) => String(e.className || e.tagName)));
      expect(dim).toEqual([]);
      await page.waitForTimeout(300);
      const r = await axe(page).withRules(['color-contrast']).analyze();
      expect(r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
      await setCustom(page, '1', '1 2 6');
      await waitResult(page, (r) => r.den.join(' ') === '1 2 6');
      await expect(badge).toBeHidden();
      await expect(page.getByTestId('tf-gpanel')).not.toHaveClass(/is-stale/);
    });
  }

  test('TFE-11: sin anuncio al iniciar; uno por cambio de slider; tf:open sí anuncia', async ({ page, gotoApp }) => {
    await recordAnnouncements(page);
    await gotoApp('');
    await lazyDone(page);   // inicio perezoso en tiempo ocioso
    await page.locator('#transferencia').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    expect(await recalcAnnouncements(page)).toBe(0);
    await setSlider(page, 'tf-param-b', 2);
    await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.5) < 1e-9);
    await page.waitForTimeout(900);
    expect(await recalcAnnouncements(page)).toBe(1);
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'tanks', variant: 'lineal' }));
    await waitResult(page, (r) => r.entryId === 'tanks/lineal/h');
    await page.waitForTimeout(900);
    expect(await recalcAnnouncements(page)).toBe(2);
  });

  test('TFE-11: sin anuncio en el inicio inmediato al acercarse; tf:open antes del inicio anuncia una vez', async ({ page, gotoApp }) => {
    await recordAnnouncements(page);
    await openEngine(page, gotoApp);   // la sección se acerca: fases seguidas
    await lazyDone(page);
    await page.waitForTimeout(900);
    expect(await recalcAnnouncements(page)).toBe(0);

    await gotoApp('');
    expect(await result(page)).toBeNull();
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'massSpring' }));
    await waitResult(page, (r) => r.entryId === 'massSpring/base/x');
    await page.waitForTimeout(900);
    expect(await recalcAnnouncements(page)).toBe(1);
  });

  test('TFE-12: filas de Routh con nombre accesible y títulos de figura h4', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    await openAll(page);
    const heads = page.getByTestId('tf-routh').locator('tbody th');
    await expect(heads).toHaveCount(3);
    await expect(heads.locator('.sr-only')).toHaveText(['fila s²', 'fila s¹', 'fila s⁰']);
    const titles = await page.locator('#transferencia .tf-fig__title').evaluateAll((els) => els.map((e) => e.tagName));
    expect(titles.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(titles)]).toEqual(['H4']);
    const r = await axe(page).withRules(['empty-table-header', 'heading-order', 'th-has-data-cells']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  test('TFE-13: las pastillas explican su significado (tooltip y lector de pantalla); axe sin problemas', async ({ page, gotoApp }) => {
    test.setTimeout(120_000);   // axe completo sobre los siete pasos abiertos
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const chips = await page.locator('[data-testid="tf-gpanel"] .ds-chip').evaluateAll((els) => els.map((e) => ({
      tip: e.getAttribute('data-tip') || '', sr: (e.querySelector('.sr-only') || {}).textContent || '',
    })));
    expect(chips.length).toBeGreaterThanOrEqual(3);
    for (const c of chips) {
      expect(c.tip.length).toBeGreaterThan(20);
      expect(c.sr).toContain(c.tip);
    }
    await page.getByTestId('tf-stability').hover();
    await expect(page.locator('.ds-tooltip')).toBeVisible();
    await expect(page.locator('.ds-tooltip')).toContainText('semiplano izquierdo');
    await page.mouse.move(2, 2);
    await openAll(page);
    await page.waitForTimeout(400);
    const r = await axe(page).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('TFE-14: sin curva fantasma tras cambiar de G(s); con fantasma tras mover un parámetro', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const g = (n) => expect.poll(() => ghosts(page, 'tf-chart-step')).toBe(n);
    await g(0);
    await setSlider(page, 'tf-param-b', 2);
    await g(1);
    await expect.poll(() => ghosts(page, 'tf-chart-bode-mag')).toBe(1);
    await page.getByTestId('tf-system').selectOption('tanks/lineal/h');
    await waitResult(page, (r) => r.entryId === 'tanks/lineal/h');
    await g(0);
    await expect.poll(() => ghosts(page, 'tf-chart-bode-mag')).toBe(0);
    await page.getByTestId('tf-mode-personalizada').click();
    await waitResult(page, (r) => r.source === 'personalizada');
    await g(0);
    await page.getByTestId('tf-preset-polo-triple').click();
    await waitResult(page, (r) => r.den.join(' ') === '1 3 3 1');
    await g(0);
    await setCustom(page, '1', '1 2 5');
    await waitResult(page, (r) => r.den.join(' ') === '1 2 5');
    await g(0);
    await page.getByTestId('tf-mode-estandar').click();
    await waitResult(page, (r) => r.source === 'estandar');
    await g(0);
    await setSlider(page, 'tf-std-zeta', 0.8);   // por omisión vale 0.5
    await waitResult(page, (r) => Math.abs(r.secondOrder.zeta - 0.8) < 1e-9);
    await g(1);
    await page.getByTestId('tf-std-order-1').click();
    await waitResult(page, (r) => !!r.firstOrder);
    await g(0);
  });

  test('TFE-15: inicio por fases en tiempo ocioso: data-lazy="done" en 5 s y ninguna tarea > 120 ms', TIMING, async ({ page, gotoApp }) => {
    await gotoApp('');
    await lazyDone(page, 5000);
    // Montaje controlado lejos de la vista: cada fase va en su propia tarea ociosa.
    const m = await page.evaluate(async () => {
      window.scrollTo(0, 0);
      const el = document.querySelector('[data-mount="tfengine"]');
      window.DSL.app.handles.tfengine.destroy();
      const tasks = [];
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push(e.duration); });
      po.observe({ type: 'longtask' });
      const t0 = performance.now();
      window.DSL.app.handles.tfengine = window.DSL.sections.tfengine.mount(el);
      const sync = el.dataset.lazy || '';
      await new Promise((resolve) => {
        const tick = () => (el.dataset.lazy === 'done' || performance.now() - t0 > 8000 ? resolve() : setTimeout(tick, 20));
        tick();
      });
      await new Promise((r) => setTimeout(r, 200));
      po.disconnect();
      return { sync, done: el.dataset.lazy, ms: performance.now() - t0, max: Math.max(0, ...tasks), tasks };
    });
    console.log(`TFE-15 fases: ${m.ms.toFixed(0)} ms hasta done; tareas largas ${JSON.stringify(m.tasks.map((d) => Math.round(d)))}`);
    expect(m.sync).not.toBe('done');
    expect(m.done).toBe('done');
    expect(m.max).toBeLessThanOrEqual(120);
    expect(await result(page)).toMatchObject({ kind: 'tf', entryId: 'massSpring/base/x' });
  });

  test('TFE-15: a 4× de CPU, la mediana de Event Timing al cambiar de ejemplo con todo abierto ≤ 274 ms', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(120_000);
    await openEngine(page, gotoApp, { reducedMotion: true });
    await lazyDone(page);
    await page.getByTestId('tf-mode-personalizada').click();
    await waitResult(page, (r) => r.source === 'personalizada');
    await openAll(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__ev = new Map();
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.interactionId) continue;
          window.__ev.set(e.interactionId, Math.max(window.__ev.get(e.interactionId) || 0, e.duration));
        }
      }).observe({ type: 'event', durationThreshold: 16, buffered: false });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      for (const id of ['tercer-orden', 'polo-triple', 'fase-no-minima', 'integrador', 'routh-fila-nula', 'routh-epsilon', 'inestable']) {
        await page.getByTestId('tf-preset-' + id).click();
        await page.waitForTimeout(1500);
      }
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    const d = await page.evaluate(() => [...window.__ev.values()].sort((a, b) => a - b));
    const median = d.length ? d[Math.floor((d.length - 1) / 2)] : 0;
    console.log(`TFE-15 Event Timing a 4×: ${JSON.stringify(d)} ms; mediana ${median}`);
    expect(d.length).toBeGreaterThanOrEqual(5);
    expect(median).toBeLessThanOrEqual(274);
  });

  test('TFE-16: con un cero que cancela el polo en el origen la tarjeta muestra el límite de y(t)', async ({ page, gotoApp }) => {
    await openEngine(page, gotoApp);
    await lazyDone(page);
    const val = page.getByTestId('tf-metric-final-value');
    const sub = page.getByTestId('tf-metric-final-sub');
    for (const [n, d] of [['1 0', '1 1 0'], ['2 0', '1 3 0']]) {
      await setCustom(page, n, d);
      await waitResult(page, (r, a) => r.num.join(' ') + '/' + r.den.join(' ') === a, `${n}/${d}`);
      const r = await result(page);
      const expected = await page.evaluate(({ num, den }) => {
        const G = new window.DSL.core.tf.TransferFunction(num, den);
        return window.DSL.util.formatNumber(G.stepInfo().limitValue, 4);
      }, { num: r.num, den: r.den });
      expect(r.info.limitValue).not.toBeNull();
      await expect(val).toHaveText(expected);
      await expect(sub).toHaveText('límite de y(t): el cero cancela el polo en el origen');
    }
    // 1/s: integrador sin cancelación, no hay límite.
    await setCustom(page, '1', '1 0');
    await waitResult(page, (r) => r.den.join(' ') === '1 0' && r.num.join(' ') === '1');
    expect((await result(page)).info.limitValue).toBeNull();
    await expect(val).toHaveText('—');
    await expect(sub).not.toContainText('límite de y(t)');
  });
});

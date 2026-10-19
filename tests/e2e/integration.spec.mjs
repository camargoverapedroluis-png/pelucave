// tests/e2e/integration.spec.mjs — Propietario: integrator.
// Integración entre secciones (solo por DSL.bus, como fija ARCHITECTURE §13), en ambos proyectos:
// - galería → motor: «Ver G(s) paso a paso» carga el mismo sistema, variante, salida y parámetros (SI);
// - asistente → motor y asistente → galería con las cargas útiles del asistente;
// - motor (diagnóstico SIR) → conceptos y → galería; galería (SIR, telaraña) → conceptos;
// - llamadas a la acción del hero: el desplazamiento suave termina con la sección bajo la barra;
// - sin red: toda petición http(s) se aborta y la página funciona igual, sin peticiones fallidas;
// - rendimiento orientativo: intervalos de frame con la galería reproduciendo (mediana y p95);
// - fuentes: tras un recorrido completo ninguna cara falla, y las que el archivo único omite
//   (DIST_PRUNED_FONTS, tools/lib.mjs) nunca se piden en «src» y no existen en «dist».
// El fixture guard falla cualquier test con console.error, pageerror, petición fallida o de red.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';
import { DIST_PRUNED_FONTS, fontFaceRules } from '../../tools/lib.mjs';

const OUT = path.join(ROOT, 'test-results', 'integrator');

/** Recorre la página de arriba abajo para que cada sección haga su inicio perezoso. */
async function warmAll(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
}

/** Espera a que el desplazamiento se detenga (scrollY estable durante 300 ms). */
async function settleScroll(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let last = window.scrollY;
    let still = 0;
    const t = setInterval(() => {
      if (Math.abs(window.scrollY - last) < 0.5) still += 1; else still = 0;
      last = window.scrollY;
      if (still >= 6) { clearInterval(t); resolve(true); }
    }, 50);
  }), null, { timeout: 8000 });
}

/** Posición del borde superior de la sección respecto a la barra fija. */
async function sectionOffset(page, id) {
  return page.evaluate((sid) => {
    const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    return document.getElementById(sid).getBoundingClientRect().top - head;
  }, id);
}

const tfState = (page) => page.evaluate(() => window.DSL.app.handles.tfengine.getState());
const tfResult = (page) => page.evaluate(() => window.DSL.app.handles.tfengine.getResult());
const galleryState = (page) => page.evaluate(() => window.DSL.app.handles.gallery.state());

/** G(s) que da el modelo con los parámetros indicados (referencia independiente del motor). */
async function modelDen(page, systemId, variant, params, outputKey) {
  return page.evaluate(({ s, v, p, o }) => {
    const m = window.DSL.systems.get(s);
    const r = m.tf(p, v, o);
    return { num: Array.from(r.tf.num), den: Array.from(r.tf.den) };
  }, { s: systemId, v: variant, p: params, o: outputKey });
}

function closeArrays(a, b, tol = 1e-9) {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b[i]))));
}

test.describe('integración entre secciones', () => {
  const GALLERY_TF = [
    { systemId: 'massSpring', variant: 'base', outputKey: 'x' },
    { systemId: 'tanks', variant: 'lineal', outputKey: 'h' },
    { systemId: 'tanks', variant: 'torricelli', outputKey: 'h' },
    { systemId: 'tanks', variant: 'cascada', outputKey: 'h2' },
    { systemId: 'rlc', variant: 'serie', outputKey: 'i' },
    { systemId: 'market', variant: 'walras', outputKey: 'P' },
  ];

  test('galería → motor: «Ver G(s) paso a paso» carga sistema, variante, salida y parámetros', async ({ page, gotoApp }) => {
    test.setTimeout(90_000);
    await gotoApp('#galeria', { reducedMotion: true });
    for (const c of GALLERY_TF) {
      await page.evaluate(({ s, v }) => window.DSL.app.handles.gallery.select(s, v), { s: c.systemId, v: c.variant });
      await expect.poll(async () => {
        const st = await galleryState(page);
        return st.ready && !st.switching && st.systemId === c.systemId && st.variant === c.variant;
      }).toBe(true);
      if (c.outputKey === 'i') await page.getByTestId(`gl-tf-output-${c.outputKey}`).click();
      const g = await galleryState(page);
      await page.getByTestId('gl-tf-open').click();
      const id = `${c.systemId}/${c.variant}/${c.outputKey}`;
      await expect.poll(async () => (await tfState(page)).sys.entryId, { message: id }).toBe(id);
      const st = await tfState(page);
      expect(st.mode).toBe('sistema');
      for (const [k, v] of Object.entries(st.sys.params)) {
        if (k in g.params) expect(v, `${id}: ${k}`).toBeCloseTo(g.params[k], 10);
      }
      await expect.poll(async () => (await tfResult(page))?.entryId).toBe(id);
      const res = await tfResult(page);
      const ref = await modelDen(page, c.systemId, c.variant, g.params, c.outputKey);
      closeArrays(res.den, ref.den.map((x) => x / ref.den[0]));
    }
  });

  test('galería → motor con un parámetro cambiado: el denominador sigue al slider (masa-resorte, k = 9)', async ({ page, gotoApp }) => {
    await gotoApp('#galeria', { reducedMotion: true });
    await page.evaluate(() => window.DSL.app.handles.gallery.select('massSpring', 'base'));
    await expect.poll(async () => (await galleryState(page)).ready).toBe(true);
    const field = page.getByTestId('gl-param-k-number');
    await field.fill('9');
    await field.press('Enter');
    await expect.poll(async () => (await galleryState(page)).params.k).toBe(9);
    const g = await galleryState(page);
    await page.getByTestId('gl-tf-open').click();
    await expect.poll(async () => (await tfResult(page))?.entryId).toBe('massSpring/base/x');
    await expect.poll(async () => (await tfState(page)).sys.params.k).toBe(9);
    const res = await tfResult(page);
    closeArrays(res.den, [1, g.params.b / g.params.m, 9 / g.params.m]);
    // El slider del motor muestra el mismo valor que la galería.
    await expect(page.getByTestId('tf-param-k-number')).toHaveValue(/^9(\.0+)?$/);
  });

  test('asistente → motor: los tres ejemplos lineales abren su G(s) con sus parámetros', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await gotoApp('#modelado', { reducedMotion: true });
    await page.locator('#modelado').scrollIntoViewIfNeeded();
    for (const [slug, id] of [['massspring', 'massSpring/base/x'], ['rlc', 'rlc/serie/vC'], ['tanks', 'tanks/lineal/h']]) {
      await page.getByTestId(`wz-example-${slug}`).click();
      await page.getByTestId('wz-step-3').click();
      await expect(page.getByTestId('wz-open-tf')).toBeVisible();
      await page.getByTestId('wz-open-tf').click();
      await expect.poll(async () => (await tfResult(page))?.entryId, { message: slug }).toBe(id);
      await expect(page.getByTestId('tf-g')).toHaveAttribute('data-kind', 'tf');
      await page.locator('#modelado').scrollIntoViewIfNeeded();
    }
  });

  test('asistente → galería: «Abrir en la galería» selecciona el ejemplo y desplaza a #galeria', async ({ page, gotoApp }) => {
    await gotoApp('#modelado', { reducedMotion: true });
    await page.locator('#modelado').scrollIntoViewIfNeeded();
    await page.getByTestId('wz-example-rlc').click();
    await page.getByTestId('wz-step-4').click();
    await page.getByTestId('wz-open-gallery').click();
    await expect.poll(async () => {
      const st = await galleryState(page);
      return st.ready && st.systemId === 'rlc' && st.variant === 'serie';
    }).toBe(true);
    await settleScroll(page);
    const off = await sectionOffset(page, 'galeria');
    expect(Math.abs(off), 'el borde de #galeria queda bajo la barra').toBeLessThanOrEqual(4);
  });

  test('motor (SIR sin G(s)) → conceptos y → galería; galería (telaraña) → conceptos', async ({ page, gotoApp }) => {
    await gotoApp('#transferencia', { reducedMotion: true });
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'sir', variant: 'base' }));
    await expect(page.getByTestId('tf-g')).toHaveAttribute('data-kind', 'diag');
    await page.getByTestId('tf-diag-concepts').click();
    const card = page.getByTestId('cc-card-linealidad');
    await expect(card).toHaveClass(/is-highlight/);
    await settleScroll(page);
    await expect(card).toBeInViewport();
    expect(await page.evaluate(() => !!document.activeElement.closest('[data-testid="cc-card-linealidad"]'))).toBe(true);

    await page.locator('#transferencia').scrollIntoViewIfNeeded();
    await page.getByTestId('tf-diag-gallery').click();
    await expect.poll(async () => {
      const st = await galleryState(page);
      return st.ready && st.systemId === 'sir';
    }).toBe(true);

    await page.evaluate(() => window.DSL.app.handles.gallery.select('market', 'telarana'));
    await expect.poll(async () => (await galleryState(page)).variant).toBe('telarana');
    await page.getByTestId('gl-notf-concepts').click();
    await expect(page.getByTestId('cc-card-ecuaciones')).toHaveClass(/is-highlight/);
  });

  test('hero: las llamadas a la acción dejan cada sección justo bajo la barra (desplazamiento suave)', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await gotoApp();
    for (const id of ['galeria', 'transferencia']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await settleScroll(page);
      await page.getByTestId(`hero-cta-${id}`).click();
      await settleScroll(page);
      const off = await sectionOffset(page, id);
      expect(Math.abs(off), `#${id}: borde respecto a la barra (${off.toFixed(1)} px)`).toBeLessThanOrEqual(4);
      await expect(page.locator(`#${id}-title`)).toBeInViewport();
    }
  });
});

test.describe('sin red', () => {
  test('con toda petición http(s) abortada la página funciona sin peticiones fallidas ni errores', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    const aborted = [];
    const all = [];
    await page.route(/^https?:\/\//i, (route) => { aborted.push(route.request().url()); return route.abort(); });
    page.on('request', (r) => all.push(r.url()));
    await gotoApp();
    await warmAll(page);
    // Uso real: galería en marcha, motor con un preset, conceptos abiertos.
    await page.evaluate(() => window.DSL.app.handles.gallery.select('rlc', 'serie'));
    await expect.poll(async () => (await galleryState(page)).ready).toBe(true);
    await page.evaluate(() => window.DSL.bus.emit('tf:open', { systemId: 'tanks', variant: 'cascada' }));
    await expect.poll(async () => (await tfResult(page))?.entryId).toBe('tanks/cascada/h2');
    await page.waitForTimeout(500);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
    expect(aborted, 'peticiones de red intentadas').toEqual([]);
    for (const u of all.concat(resources)) expect(u, u).toMatch(/^(file|data|blob|about):/i);
    await expect(page.locator('.app-error')).toHaveCount(0);
    await expect(page.locator('.tex-fallback')).toHaveCount(0);
    expect(await page.locator('.katex').count()).toBeGreaterThan(50);
    expect(await page.locator('canvas').count()).toBeGreaterThan(8);
  });
});

test.describe('rendimiento', () => {
  test('galería reproduciendo: intervalos de frame durante ~3 s (mediana y p95)', TIMING, async ({ page, gotoApp }, testInfo) => {
    await gotoApp('#galeria');
    await page.locator('#galeria').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.DSL.app.handles.gallery.select('massSpring', 'base'));
    await expect.poll(async () => {
      const st = await galleryState(page);
      return st.ready && st.playing && st.running;
    }).toBe(true);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const d = [];
      let last = performance.now();
      const t0 = last;
      function f(now) {
        d.push(now - last);
        last = now;
        if (now - t0 < 3000) requestAnimationFrame(f);
        else resolve(d.slice(1));
      }
      requestAnimationFrame(f);
    }));
    const s = r.slice().sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const stats = { project: testInfo.project.name, frames: s.length, median: q(0.5), p95: q(0.95), max: s[s.length - 1] };
    const st = await galleryState(page);
    stats.simTime = st.t;
    fs.mkdirSync(OUT, { recursive: true });
    // Corre en «src-timing» o «dist-timing» (@timing); el archivo conserva el nombre de la página.
    fs.writeFileSync(path.join(OUT, `frames-${testInfo.project.name.replace(/-timing$/, '')}.json`), JSON.stringify(stats, null, 2));
    console.log(`frames ${testInfo.project.name}: ${JSON.stringify(stats)}`);
    expect(stats.frames).toBeGreaterThan(60);
    expect(stats.median, 'mediana del intervalo de frame (ms)').toBeLessThan(34);
  });
});

/** Clave de una cara: familia sin comillas | estilo | peso | primer punto de código de su unicode-range. */
function faceKey(family, style, weight, unicodeRange) {
  const m = /U\+([0-9a-f]+)/i.exec(unicodeRange || '');
  return [String(family).replace(/^["']|["']$/g, ''), String(style).trim(), String(weight).trim().replace(/\s+/g, ' '),
    m ? parseInt(m[1], 16) : 0].join('|');
}

/** Caras que tools/build.mjs omite, con su clave, leídas de las hojas de vendor/ que enlaza index.html. */
function prunedFaces() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(vendor\/[^"]+)"/g)].map((m) => m[1]);
  return sheets.flatMap((s) => fontFaceRules(fs.readFileSync(path.join(ROOT, s), 'utf8')))
    .filter((r) => DIST_PRUNED_FONTS.includes(r.file))
    .map((r) => ({ file: r.file, key: faceKey(r.family, r.style, r.weight, r.unicodeRange) }));
}

/**
 * Despliega todo lo que hay bajo `selector`: cada pestaña (y lo que contiene su panel), cada sección plegable,
 * cada «Ver datos» y cada paso del motor (con content-visibility: auto solo se maqueta a la vista).
 */
async function revealAll(page, selector) {
  await page.evaluate(async (sel) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const visible = (el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
    async function reveal(root, depth) {
      for (const b of root.querySelectorAll('.ds-collapse__btn[aria-expanded="false"], .ch-data__toggle[aria-expanded="false"]')) {
        if (visible(b)) { b.click(); await frame(); }
      }
      for (const el of root.querySelectorAll('.tf-steps__item')) {
        if (visible(el)) { el.scrollIntoView({ block: 'center' }); await frame(); }
      }
      if (depth > 3) return;
      for (const list of [...root.querySelectorAll('[role="tablist"]')].filter(visible)) {
        for (const tab of list.querySelectorAll('[role="tab"]')) {
          if (!visible(tab)) continue;
          tab.click();
          await frame();
          const panel = document.getElementById(tab.getAttribute('aria-controls') || '');
          if (panel) await reveal(panel, depth + 1);
        }
      }
    }
    await reveal(document.querySelector(sel), 0);
    void document.body.offsetHeight;
  }, selector);
}

test.describe('fuentes', () => {
  test('recorrido completo: ninguna cara falla y las que el archivo único omite nunca se piden', async ({ page, gotoApp }, testInfo) => {
    test.setTimeout(180_000);
    const pruned = prunedFaces();
    expect(pruned.map((p) => p.file).sort(), 'una cara por nombre de DIST_PRUNED_FONTS').toEqual(DIST_PRUNED_FONTS.slice().sort());
    expect(new Set(pruned.map((p) => p.key)).size, 'claves distintas').toBe(pruned.length);

    await gotoApp('', { reducedMotion: true });
    await warmAll(page);
    const pairs = await page.evaluate(() => window.DSL.systems.list().flatMap((m) => m.variants.map((v) => [m.id, v.id])));
    expect(pairs.length).toBeGreaterThanOrEqual(8);

    // Asistente: cada ejemplo en cada paso.
    await page.locator('#modelado').scrollIntoViewIfNeeded();
    for (const slug of ['massspring', 'rlc', 'tanks', 'sir']) {
      await page.getByTestId(`wz-example-${slug}`).click();
      for (let k = 1; k <= 4; k += 1) {
        await page.getByTestId(`wz-step-${k}`).click();
        await page.waitForTimeout(120);
        await revealAll(page, '#modelado');
      }
    }

    // Galería: cada sistema y variante.
    for (const [s, v] of pairs) {
      await page.evaluate(([id, vr]) => window.DSL.app.handles.gallery.select(id, vr), [s, v]);
      await expect.poll(async () => {
        const st = await galleryState(page);
        return st.ready && !st.switching && st.systemId === s && st.variant === v;
      }, { message: `${s}/${v}` }).toBe(true);
      await revealAll(page, '#galeria');
    }

    // Motor: cada sistema (con todos los pasos abiertos), luego sus modos y ejemplos.
    await page.locator('#transferencia').scrollIntoViewIfNeeded();
    for (const [s, v] of pairs) {
      await page.evaluate(([id, vr]) => window.DSL.bus.emit('tf:open', { systemId: id, variant: vr }), [s, v]);
      await page.waitForTimeout(150);
      const all = page.getByTestId('tf-show-all');
      if (await all.isVisible() && /Mostrar/.test(await all.innerText())) await all.click();
      await revealAll(page, '#transferencia');
    }
    for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-testid^="tf-preset-"]')].map((b) => b.dataset.testid))) {
      const b = page.getByTestId(id);
      if (!(await b.isVisible())) continue;
      await b.click();
      await page.waitForTimeout(120);
      await revealAll(page, '#transferencia');
    }

    // Inicio, conceptos (cada pestaña de cada tarjeta) y el tema claro.
    await revealAll(page, '#inicio');
    await revealAll(page, '#conceptos');
    await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    await warmAll(page);
    await page.evaluate(() => window.DSL.prefs.setTheme('dark', { persist: false }));

    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].map((f) => ({ family: f.family, style: f.style, weight: f.weight, unicodeRange: f.unicodeRange, status: f.status }));
    });
    const keyed = faces.map((f) => ({ ...f, key: faceKey(f.family, f.style, f.weight, f.unicodeRange) }));
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `fonts-${testInfo.project.name}.json`), JSON.stringify(keyed, null, 2));

    expect(keyed.filter((f) => f.status === 'error'), 'caras que fallaron').toEqual([]);
    const loaded = new Set(keyed.filter((f) => f.status === 'loaded').map((f) => f.key));
    // El recorrido llega de verdad al texto: cursiva matemática, caligráfica (ℒ), negrita, latin-ext normal (ẋ, ḣ).
    for (const k of ['KaTeX_Main|normal|400|0', 'KaTeX_Math|italic|400|0', 'KaTeX_Caligraphic|normal|400|0',
      'KaTeX_Main|normal|700|0', 'IBM Plex Sans|normal|100 700|256', 'Bricolage Grotesque|normal|200 800|0']) {
      expect(loaded.has(k), `se usa ${k}`).toBe(true);
    }
    const isDist = await page.evaluate(() => !!document.querySelector('style[data-src="vendor/fonts.css"]'));
    for (const p of pruned) {
      const present = keyed.filter((f) => f.key === p.key);
      if (isDist) expect(present, `${p.file}: no se incrusta en el archivo único`).toEqual([]);
      else expect(present.map((f) => f.status), `${p.file}: declarada en vendor/ pero nunca pedida`).toEqual(['unloaded']);
    }
  });
});

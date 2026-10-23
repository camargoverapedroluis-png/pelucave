// tests/unit/ns.motion.test.mjs — Propietario: architect.
// ?movimiento=normal|reducido fuerza la preferencia de movimiento durante la carga (sin guardarla) y
// setReducedMotion(null) devuelve el control al sistema.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL } from '../helpers/load.mjs';

const RM = '(prefers-reduced-motion: reduce)';

function boot(search, media) {
  return loadDSL([], {
    media: { [RM]: media },
    globals: { location: { href: 'file:///index.html' + search, protocol: 'file:', hash: '', pathname: '/index.html', search } },
  });
}

describe('parámetro ?movimiento', () => {
  test('sin parámetro manda el sistema', () => {
    assert.equal(boot('', true).DSL.prefs.reducedMotion, true);
    assert.equal(boot('', false).DSL.prefs.reducedMotion, false);
    assert.equal(boot('?movimiento=otro', true).DSL.prefs.reducedMotion, true);
  });

  test('movimiento=normal fuerza las animaciones aunque el sistema pida reducirlas', () => {
    const { DSL, env } = boot('?movimiento=normal', true);
    assert.equal(DSL.prefs.reducedMotion, false);
    env.setMedia(RM, false);
    env.setMedia(RM, true);
    assert.equal(DSL.prefs.reducedMotion, false, 'el cambio del sistema no manda mientras está forzado');
    DSL.prefs.setReducedMotion(null);
    assert.equal(DSL.prefs.reducedMotion, true, 'null devuelve el control al sistema');
    assert.equal(env.storage.size, 0, 'no se guarda nada');
  });

  test('movimiento=reducido fuerza la reducción y convive con otros parámetros', () => {
    assert.equal(boot('?x=1&movimiento=reducido', false).DSL.prefs.reducedMotion, true);
    assert.equal(boot('?movimiento=normal&x=1', true).DSL.prefs.reducedMotion, false);
  });
});

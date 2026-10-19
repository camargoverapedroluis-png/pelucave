// tests/crosscheck/dump.mjs — Propietario: math.
// Evalúa el motor JS (DSL.core.numeric + DSL.core.tf, y los balances de energía de DSL.systems.simulate)
// sobre la lista fija de tests/crosscheck/cases.json
// y escribe un JSON en stdout (o en la ruta dada como primer argumento) para que run.py lo compare con
// NumPy/SciPy. Determinista: mismas entradas → mismos bytes. ±Infinity y NaN se escriben como
// Infinity/-Infinity/NaN (JSON extendido que entiende el módulo json de Python).
import fs from 'node:fs';
import path from 'node:path';
import { loadDSL, SCRIPTS, toPlain, ROOT } from '../helpers/load.mjs';

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/crosscheck/cases.json'), 'utf8'));
const { DSL, env } = loadDSL([...SCRIPTS.core, ...SCRIPTS.systems]);
const N = DSL.core.numeric;
const { TransferFunction: TF } = DSL.core.tf;

const strip = (o) => { const { notes, ...rest } = o; return rest; };

const tf = cases.tf.map((c) => {
  const G = new TF(c.num, c.den);
  const sa = G.stepAnalytic();
  const step = G.stepSamples();
  const imp = G.impulseSamples();
  const bode = G.bode();
  const routh = G.routh();
  return {
    name: c.name,
    input: { num: c.num, den: c.den },
    num: G.num,
    den: G.den,
    expect: c.expect,
    tags: c.tags,
    poles: G.poles(),
    zeros: G.zeros(),
    poleGroups: G.poleGroups(),
    dcGain: G.dcGain(),
    stability: G.stability(),
    routh: { signChanges: routh.signChanges, special: routh.special ? routh.special.type : null, firstColumn: routh.firstColumn },
    exact: sa.exact,
    stepTex: sa.tex,
    timeHorizon: G.timeHorizon(),
    step,
    impulse: imp,
    bode: { omega: bode.omega, magDb: bode.magDb, phaseDeg: bode.phaseDeg },
    pfStep: G.partialFractionsStep(),
    stepInfo: strip(G.stepInfo()),
    secondOrder: G.secondOrderParams(),
  };
});

const poly = cases.poly.map((c) => ({ name: c.name, coeffs: c.coeffs, roots: N.polyRoots(c.coeffs) }));

const P = cases.integrators.pendulum;
const pend = (t, x) => [x[1], -P.c * x[1] - P.gL * Math.sin(x[0])];
const tEval = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (k * P.t1) / 10);
const integ = cases.integrators.runs.map((r) => {
  const res = N.integrate(pend, [P.theta0, P.omega0], 0, P.t1, { ...r, tEval });
  return { ...r, t: res.t, x: res.x, stats: res.stats };
});
const orders = cases.integrators.orders.map((o) => ({
  ...o,
  finals: o.dts.map((dt) => {
    const res = N.integrate(pend, [P.theta0, P.omega0], 0, P.t1, { method: o.method, dt });
    return res.x[res.x.length - 1];
  }),
}));

// Balances de energía de DSL.systems.simulate (integrales sobre la trayectoria del integrador).
const energy = (cases.energy || []).map((c) => {
  const m = DSL.systems.get(c.model);
  const traj = DSL.systems.simulate(m, { variant: c.variant, params: c.params, input: c.input, duration: c.duration, method: c.method, dt: c.dt });
  const inv = m.invariants(traj)[0];
  return { ...c, ok: inv.ok, relative: inv.relative, residual: inv.value, parts: inv.parts, steps: traj.stats.steps };
});

const out = { tf, poly, integrators: { pendulum: P, tEval, runs: integ, orders }, energy };
const SENT = { '__+INF__': 'Infinity', '__-INF__': '-Infinity', '__NAN__': 'NaN' };
let text = JSON.stringify(toPlain(out), (k, v) => {
  if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? '__NAN__' : v > 0 ? '__+INF__' : '__-INF__';
  return v;
});
text = text.replace(/"(__\+INF__|__-INF__|__NAN__)"/g, (_, s) => SENT[s]);

const errors = env.console.error || [];
if (errors.length) {
  process.stderr.write('dump.mjs: errores de consola en el motor JS:\n' + errors.map((e) => e.join(' ')).join('\n') + '\n');
  process.exitCode = 2;
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], text + '\n', 'utf8');
else process.stdout.write(text + '\n');

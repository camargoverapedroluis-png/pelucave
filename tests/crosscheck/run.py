"""tests/crosscheck/run.py — Propietario: math.

Contraste del motor numérico JS (js/core/numeric.js, js/core/tf.js) con NumPy/SciPy.

    uv run --with numpy --with scipy python tests/crosscheck/run.py      (o: npm run crosscheck)

1. Ejecuta `node tests/crosscheck/dump.mjs`, que evalúa el motor JS sobre la lista fija de
   tests/crosscheck/cases.json, y lee su JSON (copia en test-results/math/crosscheck-js.json).
2. Calcula referencias independientes con NumPy/SciPy y compara, caso por caso:
   polos y ceros (np.roots, emparejamiento óptimo, tolerancia según multiplicidad), centros y
   multiplicidades de polos repetidos, ganancia en continua, estabilidad, cambios de signo de Routh
   frente a polos en el semiplano derecho, respuesta al escalón y al impulso (scipy.signal.step /
   impulse), Bode (scipy.signal.bode: módulo en dB y fase), fracciones parciales de G(s)/s
   (reconstrucción en puntos complejos y scipy.signal.residue), métricas del escalón sobre una
   respuesta fina de SciPy, fórmulas canónicas de 2.º orden, raíces de polinomios sueltos e
   integradores (péndulo no lineal frente a solve_ivp DOP853, y órdenes de convergencia) y balances
   de energía de DSL.systems.simulate (masa-resorte y RLC frente a DOP853 del sistema aumentado).
3. Imprime tablas resumen y sale con código 1 si alguna comparación supera su tolerancia
   (2 si el volcado JS falla).
"""

from __future__ import annotations

import json
import math
import pathlib
import shutil
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.integrate import solve_ivp
from scipy.optimize import linear_sum_assignment

ROOT = pathlib.Path(__file__).resolve().parents[2]
EPS = float(np.finfo(float).eps)

# Tolerancias (todas documentadas en docs/api/tf.md, sección «Contraste con SciPy»).
TOL = {
    "root_simple": 1e-9,      # × escala, raíz aislada
    "group_center": 1e-9,     # × escala, centro de un grupo repetido
    "backward": 1e-8,         # coeficientes de Π(s − r) frente al polinomio, relativo a Π(s + |r|)
    "dc": 1e-12,
    "resp": 1e-8,             # escalón/impulso: × max|y_ref| (+1e-12 absoluto)
    "mag_db": 1e-7,
    "phase_deg": 1e-6,
    "anchor_deg": 15.0,
    "pf": 1e-9,
    "residue": 1e-7,
    "metric_pct": 1e-5,       # puntos porcentuales
    "metric_dt": 2.0,         # × paso de la rejilla fina de referencia
    "canonical": 1e-7,
}
INTEG_SAME_METHOD = 1e-9     # paso fijo: JS frente a una implementación independiente del mismo método
INTEG_RK45_FACTOR = 10.0     # rk45: error ≤ 10 × error de scipy RK45 con las mismas tolerancias (mín. 1e-8)


def fixed_step(method, f, x0, t0, t1, dt):
    """Euler, Heun o RK4 con la misma malla que js/core/numeric.js (último paso recortado a t1)."""
    n_steps = max(1, math.ceil((t1 - t0) / dt - 1e-9))
    x = [float(v) for v in x0]
    for k in range(n_steps):
        ta = t0 + k * dt
        tb = t1 if k == n_steps - 1 else t0 + (k + 1) * dt
        h = tb - ta
        if method == "euler":
            d = f(ta, x)
            x = [x[i] + h * d[i] for i in range(len(x))]
        elif method == "heun":
            k1 = f(ta, x)
            k2 = f(ta + h, [x[i] + h * k1[i] for i in range(len(x))])
            x = [x[i] + 0.5 * h * (k1[i] + k2[i]) for i in range(len(x))]
        else:
            k1 = f(ta, x)
            k2 = f(ta + h / 2, [x[i] + h / 2 * k1[i] for i in range(len(x))])
            k3 = f(ta + h / 2, [x[i] + h / 2 * k2[i] for i in range(len(x))])
            k4 = f(ta + h, [x[i] + h * k3[i] for i in range(len(x))])
            x = [x[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(len(x))]
    return np.asarray(x)


def load_dump() -> dict:
    node = shutil.which("node")
    if not node:
        print("crosscheck: no se encontró «node» en el PATH.")
        sys.exit(2)
    out_dir = ROOT / "test-results" / "math"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "crosscheck-js.json"
    proc = subprocess.run(
        [node, str(ROOT / "tests" / "crosscheck" / "dump.mjs"), str(out)],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=600,
    )
    if proc.returncode != 0:
        print("crosscheck: dump.mjs falló:\n" + proc.stdout + proc.stderr)
        sys.exit(2)
    return json.loads(out.read_text(encoding="utf-8"))


def cplx(lst) -> np.ndarray:
    return np.array([complex(r["re"], r["im"]) for r in lst], dtype=complex)


def scale_of(roots: np.ndarray) -> float:
    return float(max(1.0, np.max(np.abs(roots)))) if len(roots) else 1.0


def cluster_sizes(ref: np.ndarray, S: float, rad: float = 1e-3) -> np.ndarray:
    n = len(ref)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if abs(ref[i] - ref[j]) <= rad * S:
                parent[find(i)] = find(j)
    roots_of = [find(i) for i in range(n)]
    return np.array([roots_of.count(r) for r in roots_of], dtype=float)


def roots_check(js: np.ndarray, ref: np.ndarray, S: float):
    """Emparejamiento óptimo; tolerancia 1e-9·S para raíces aisladas y ~u^(1/m)·S en grupos de m."""
    if len(js) != len(ref):
        return math.inf, f"{len(js)} raíces frente a {len(ref)}"
    if len(ref) == 0:
        return 0.0, ""
    C = np.abs(js[:, None] - ref[None, :])
    r, c = linear_sum_assignment(C)
    m = cluster_sizes(ref, S)
    tol = np.where(m <= 1, TOL["root_simple"] * S, 50.0 * EPS ** (1.0 / np.maximum(m, 1)) * S)
    ratio = float(np.max(C[r, c] / tol[c]))
    return ratio, f"max|Δ| = {np.max(C[r, c]):.1e}"


def backward_check(js: np.ndarray, coeffs) -> float:
    """Π(s − r_js) frente al polinomio mónico, relativo a Π(s + |r|)."""
    if len(js) == 0:
        return 0.0
    c = np.trim_zeros(np.asarray(coeffs, dtype=float), "f")
    c = c / c[0]
    rec = np.real(np.poly(js))
    bound = np.real(np.poly(-np.abs(js)))
    err = np.abs(rec - c) / (TOL["backward"] * np.abs(bound) + 1e-14 * np.max(np.abs(bound)) + 1e-300)
    return float(np.max(err))


def groups_check(groups, ref: np.ndarray, S: float) -> float:
    """Cada grupo JS (valor, m): la media de las m raíces de NumPy más próximas coincide con su valor."""
    if sum(g["multiplicity"] for g in groups) != len(ref):
        return math.inf
    worst = 0.0
    for g in groups:
        v = complex(g["value"]["re"], g["value"]["im"])
        m = g["multiplicity"]
        idx = np.argsort(np.abs(ref - v))[:m]
        center = np.mean(ref[idx])
        tol = TOL["group_center"] * S if m > 1 else TOL["root_simple"] * S
        if m > 1:
            tol = max(tol, 1e3 * EPS * np.max(np.abs(ref)))  # error propio del centroide de NumPy
        worst = max(worst, abs(center - v) / tol)
    return worst


def routh_ref(den) -> int | None:
    """Primera columna de Routh en aritmética exacta (Fraction) sobre los coeficientes de punto flotante.

    Una casilla cuenta como nula si la resta que la produce cancela hasta el redondeo
    (|p1 − p2| ≤ 1e-10·(|p1| + |p2|)). Devuelve el número de cambios de signo, o None si aparece
    un caso especial (cero en la primera columna o fila nula), que se decide polo a polo.
    """
    from fractions import Fraction

    a = [Fraction(float(c)) for c in den]
    n = len(a) - 1
    w = n // 2 + 1
    r0 = [a[2 * j] if 2 * j <= n else Fraction(0) for j in range(w)]
    r1 = [a[2 * j + 1] if 2 * j + 1 <= n else Fraction(0) for j in range(w)]
    rows = [r0, r1][: n + 1]
    for i in range(2, n + 1):
        A, B = rows[-2], rows[-1]
        if B[0] == 0:
            return None
        row = []
        for j in range(w - 1):
            p1, p2 = B[0] * A[j + 1], A[0] * B[j + 1]
            d = p1 - p2
            row.append(Fraction(0) if abs(d) <= Fraction(1, 10**10) * (abs(p1) + abs(p2)) else d / B[0])
        rows.append(row + [Fraction(0)])
    fc = [r[0] for r in rows]
    if any(x == 0 for x in fc):
        return None
    return sum(1 for i in range(1, len(fc)) if (fc[i] > 0) != (fc[i - 1] > 0))


def classify(ref: np.ndarray, S: float, den) -> str:
    """Routh decide si su tabla es regular; si no, polo a polo con |Re p| ≤ 1e-9·max(1, |p|)
    (o la precisión de np.roots en un grupo de m raíces, ~u^(1/m)·S)."""
    changes = routh_ref(den)
    if changes is not None:
        return "inestable" if changes > 0 else "estable"
    m = cluster_sizes(ref, S)
    tol = np.maximum(1e-9 * np.maximum(1.0, np.abs(ref)), np.where(m <= 1, 0.0, 50.0 * EPS ** (1.0 / np.maximum(m, 1)) * S))
    if np.any(ref.real > tol):
        return "inestable"
    axis = ref[np.abs(ref.real) <= tol]
    if len(axis):
        for i in range(len(axis)):
            for j in range(i + 1, len(axis)):
                if abs(axis[i] - axis[j]) <= 1e-4 * S:
                    return "inestable"
        return "marginal"
    return "estable"


def dc_ref(num, den) -> float:
    n0, d0 = num[-1], den[-1]
    if d0 != 0:
        return n0 / d0
    if n0 == 0:
        return math.nan
    low = next(c for c in reversed(den) if c != 0)
    return math.inf if n0 / low > 0 else -math.inf


def same_number(a: float, b: float, rtol: float) -> bool:
    if math.isnan(a) or math.isnan(b):
        return math.isnan(a) and math.isnan(b)
    if math.isinf(a) or math.isinf(b):
        return a == b
    return abs(a - b) <= rtol * max(1.0, abs(b))


def anchor_deg(num, den, ph_ref=None) -> float:
    """Asíntota de baja frecuencia: −90°·(polos − ceros en el origen) y, si la ganancia de baja
    frecuencia es negativa, ±180°: la rama con menor max|φ| para la forma de la curva `ph_ref`
    (solo cuentan sus variaciones respecto del primer punto; empate: +180°)."""
    qz = len(num) - len(np.trim_zeros(np.asarray(num, dtype=float), "b"))
    qp = len(den) - len(np.trim_zeros(np.asarray(den, dtype=float), "b"))
    n_low = next(c for c in reversed(num) if c != 0)
    d_low = next(c for c in reversed(den) if c != 0)
    base = -90.0 * (qp - qz)
    if n_low / d_low > 0:
        return base
    if ph_ref is None:
        return base + 180.0
    off = np.asarray(ph_ref, dtype=float)
    off = off[np.isfinite(off)] - off[np.isfinite(off)][0]
    up = float(np.max(np.abs(base + 180.0 + off)))
    down = float(np.max(np.abs(base - 180.0 + off)))
    return base - 180.0 if down < up - 1e-9 else base + 180.0


def wrap180(x: np.ndarray) -> np.ndarray:
    return (x + 180.0) % 360.0 - 180.0


def first_cross(t, z, level):
    idx = np.nonzero((z[:-1] < level) & (z[1:] >= level))[0]
    if not len(idx):
        return None
    i = idx[0]
    return t[i] + (level - z[i]) * (t[i + 1] - t[i]) / (z[i + 1] - z[i])


def check_tf(case: dict) -> dict:
    num = np.asarray(case["num"], dtype=float)
    den = np.asarray(case["den"], dtype=float)
    raw_num, raw_den = case["input"]["num"], case["input"]["den"]
    res = {"name": case["name"], "fails": []}

    def fail(what):
        res["fails"].append(what)

    # Normalización: G JS = G de entrada.
    for s in (0.3 + 0.7j, 2.1 - 1.3j):
        g_in = np.polyval(raw_num, s) / np.polyval(raw_den, s)
        g_js = np.polyval(num, s) / np.polyval(den, s)
        if abs(g_in - g_js) > 1e-13 * max(1, abs(g_in)):
            fail("normalización")
    if den[0] != 1.0:
        fail("denominador no mónico")

    # Polos, ceros, grupos.
    ref_p = np.roots(den)
    S = scale_of(ref_p)
    js_p = cplx(case["poles"])
    ratio, detail = roots_check(js_p, ref_p, S)
    res["poles"] = ratio
    if ratio > 1:
        fail(f"polos ({detail})")
    if backward_check(js_p, den) > 1:
        fail("polos: reconstrucción del denominador")
    gr = groups_check(case["poleGroups"], ref_p, S)
    res["groups"] = gr
    if gr > 1:
        fail("grupos de polos repetidos")
    num_trim = np.trim_zeros(num, "f")
    ref_z = np.roots(num_trim) if len(num_trim) > 1 else np.array([], dtype=complex)
    js_z = cplx(case["zeros"])
    zr, zdetail = roots_check(js_z, ref_z, scale_of(ref_z))
    res["zeros"] = zr
    if zr > 1:
        fail(f"ceros ({zdetail})")

    # Ganancia, estabilidad, Routh.
    if not same_number(case["dcGain"], dc_ref(list(num), list(den)), TOL["dc"]):
        fail("ganancia en continua")
    ref_class = classify(ref_p, S, list(den))
    if case["stability"] != case["expect"] or case["stability"] != ref_class:
        fail(f"estabilidad ({case['stability']} / esperado {case['expect']} / NumPy {ref_class})")
    rhp = int(np.sum(ref_p.real > 1e-7 * S))
    if case["routh"]["signChanges"] != rhp:
        fail(f"Routh: {case['routh']['signChanges']} cambios de signo frente a {rhp} polos en el SPD")
    if not case["exact"]:
        fail("y(t) no analítica")

    sys_lti = signal.lti(num, den)

    # Escalón e impulso.
    t = np.asarray(case["step"]["t"], dtype=float)
    ti = np.asarray(case["impulse"]["t"], dtype=float)
    if "stiff" in case["tags"]:
        # Con polos separados ~10 órdenes, signal.step/impulse (exponencial de la realización compañera)
        # pierden ~1e-7; la referencia es la suma de residuos de scipy.signal.residue (polos simples
        # bien separados, donde los residuos están bien condicionados).
        def by_residues(b, a, tt):
            r, p, _k = signal.residue(b, a)
            return np.real(np.sum(r[None, :] * np.exp(np.outer(tt, p)), axis=1))

        y_ref = by_residues(num, np.polymul(den, [1.0, 0.0]), t)
        g_ref = by_residues(num, den, ti)
    else:
        _, y_ref = signal.step(sys_lti, T=t)
        _, g_ref = signal.impulse(sys_lti, T=ti)
    y_js = np.asarray(case["step"]["y"], dtype=float)
    sc = float(np.max(np.abs(y_ref)))
    e = float(np.max(np.abs(y_js - y_ref)))
    res["step"] = e / (TOL["resp"] * sc + 1e-12)
    if res["step"] > 1:
        fail(f"escalón (max|Δ| = {e:.1e})")
    g_js = np.asarray(case["impulse"]["y"], dtype=float)
    sc = float(np.max(np.abs(g_ref)))
    e = float(np.max(np.abs(g_js - g_ref)))
    res["impulse"] = e / (TOL["resp"] * sc + 1e-12)
    if res["impulse"] > 1:
        fail(f"impulso (max|Δ| = {e:.1e})")

    # Bode.
    w = np.asarray(case["bode"]["omega"], dtype=float)
    _, mag_ref, ph_ref = signal.bode(sys_lti, w=w)
    mag_js = np.asarray(case["bode"]["magDb"], dtype=float)
    ph_js = np.asarray(case["bode"]["phaseDeg"], dtype=float)
    fin = np.isfinite(mag_ref) & np.isfinite(mag_js)
    if not np.array_equal(np.isfinite(mag_ref), np.isfinite(mag_js)):
        fail("Bode: valores infinitos distintos")
    dmag = float(np.max(np.abs(mag_js[fin] - mag_ref[fin]))) if fin.any() else 0.0
    res["mag"] = dmag
    if dmag > TOL["mag_db"]:
        fail(f"Bode |G| (Δ = {dmag:.1e} dB)")
    okp = np.isfinite(ph_js) & np.isfinite(ph_ref)
    dph = float(np.max(np.abs(wrap180(ph_js[okp] - ph_ref[okp])))) if okp.any() else 0.0
    res["phase"] = dph
    if dph > TOL["phase_deg"]:
        fail(f"Bode fase (Δ = {dph:.1e}°)")
    if "axis" not in case["tags"]:
        off = ph_js - ph_ref
        k = np.round(off[0] / 360.0) * 360.0
        if np.max(np.abs(off - k)) > TOL["phase_deg"]:
            fail("Bode: la fase desenrollada no es continua")
    # Forma de la curva para elegir la rama ±180°: la de SciPy; con raíces sobre el eje jω el sentido de
    # los saltos de ±180° es una convención (np.unwrap no la ve), así que se usa la del motor JS, cuyo
    # valor módulo 360° ya se comprobó arriba frente a SciPy.
    anchor = anchor_deg(list(num), list(den), ph_js if "axis" in case["tags"] else ph_ref)
    if abs(ph_js[0] - anchor) > TOL["anchor_deg"]:
        fail(f"Bode: fase inicial {ph_js[0]:.1f}° lejos de la asíntota {anchor:.0f}°")

    # Fracciones parciales de Y(s) = G(s)/s.
    pf = case["pfStep"]
    yden = np.polymul(den, [1.0, 0.0])
    if sum(e_["multiplicity"] for e_ in pf if e_["power"] == e_["multiplicity"]) != len(yden) - 1:
        fail("fracciones parciales: multiplicidades")
    poles_pf = np.array([complex(e_["pole"]["re"], e_["pole"]["im"]) for e_ in pf])
    Sp = max(1.0, float(np.max(np.abs(poles_pf))))
    worst = 0.0
    for rad, ang in ((0.37, 0.4), (0.8, 2.2), (1.3, -1.0), (2.9, 1.2), (0.55, -2.5)):
        s = rad * Sp * np.exp(1j * ang)
        if np.min(np.abs(s - poles_pf)) < 1e-3 * Sp:
            continue
        Y = np.polyval(num, s) / np.polyval(yden, s)
        terms = [complex(e_["residue"]["re"], e_["residue"]["im"]) / (s - complex(e_["pole"]["re"], e_["pole"]["im"])) ** e_["power"] for e_ in pf]
        err = abs(sum(terms) - Y) / (TOL["pf"] * (abs(Y) + 1e-3 * sum(abs(x) for x in terms)))
        worst = max(worst, err)
    res["pf"] = worst
    if worst > 1:
        fail("fracciones parciales: reconstrucción")
    distinct = all(e_["multiplicity"] == 1 for e_ in pf)
    close_poles = len(poles_pf) > 1 and np.min([abs(a - b) for i, a in enumerate(poles_pf) for b in poles_pf[i + 1:]]) < 1e-2 * Sp
    if distinct and not close_poles:
        r_ref, p_ref, _ = signal.residue(num, yden)
        for e_ in pf:
            p = complex(e_["pole"]["re"], e_["pole"]["im"])
            j = int(np.argmin(np.abs(p_ref - p)))
            rv = complex(e_["residue"]["re"], e_["residue"]["im"])
            if abs(rv - r_ref[j]) > TOL["residue"] * max(1.0, abs(r_ref[j])):
                fail(f"residuo en {p:.4g}")

    # Métricas del escalón frente a una respuesta fina de SciPy.
    info = case["stepInfo"]
    res["info"] = 0.0
    if info["stable"] and info["finalValue"] not in (None, 0) and case["exact"]:
        tf_ = np.linspace(0.0, info["tEnd"], 200001)
        dt = tf_[1] - tf_[0]
        _, yy = signal.step(sys_lti, T=tf_)
        yf = info["finalValue"]
        if not same_number(yf, dc_ref(list(num), list(den)), 1e-12):
            fail("valor final")
        z = yy / yf
        worst = 0.0
        if info["overshootPct"] is not None and info["overshootPct"] > 0:
            i = int(np.argmax(z))
            worst = max(worst, abs(info["overshootPct"] - (z[i] - 1) * 100) / (TOL["metric_pct"] + 1e-6 * info["overshootPct"]))
            worst = max(worst, abs(info["peakTime"] - tf_[i]) / (TOL["metric_dt"] * dt))
        elif info["overshootPct"] == 0:
            i = int(np.argmax(z))
            if z[i] > 1 + 1e-6 and 0 < i < len(z) - 1:
                fail("sobrepaso no detectado")
        if info["riseTimes"]:
            for key, lev in (("t10", 0.1), ("t90", 0.9)):
                tr = first_cross(tf_, z, lev)
                worst = max(worst, abs(info["riseTimes"][key] - tr) / (TOL["metric_dt"] * dt))
        if info["settlingTime"] is not None:
            out = np.nonzero(np.abs(yy - yf) > 0.02 * abs(yf))[0]
            if len(out):
                i = out[-1]
                a0 = abs(yy[i] - yf) - 0.02 * abs(yf)
                a1 = abs(yy[i + 1] - yf) - 0.02 * abs(yf)
                ts_ref = tf_[i] + a0 * dt / (a0 - a1)
            else:
                ts_ref = 0.0
            worst = max(worst, abs(info["settlingTime"] - ts_ref) / (TOL["metric_dt"] * dt))
        if info["undershootPct"]:
            worst = max(worst, abs(info["undershootPct"] + np.min(z) * 100) / (TOL["metric_pct"] + 1e-6 * info["undershootPct"]))
        res["info"] = worst
        if worst > 1:
            fail(f"métricas del escalón (ratio {worst:.2g})")

    # Fórmulas canónicas de 2.º orden puro.
    if "canonical" in case["tags"]:
        so = case["secondOrder"]
        a1, a0 = den[1], den[2]
        wn = math.sqrt(a0)
        zeta = a1 / (2 * wn)
        wd = wn * math.sqrt(1 - zeta * zeta)
        mp = 100 * math.exp(-zeta * math.pi / math.sqrt(1 - zeta * zeta))
        if abs(so["zeta"] - zeta) > 1e-14 or abs(so["wn"] - wn) > 1e-14 * wn:
            fail("ζ, ωn")
        if abs(so["canonical"]["overshootPct"] - mp) > TOL["canonical"] or abs(info["overshootPct"] - mp) > TOL["canonical"]:
            fail("sobrepaso canónico")
        if abs(info["peakTime"] - math.pi / wd) > TOL["canonical"] * math.pi / wd:
            fail("tiempo de pico canónico")
    return res


def check_poly(case: dict) -> dict:
    coeffs = case["coeffs"]
    ref = np.roots(coeffs)
    S = scale_of(ref)
    js = cplx(case["roots"])
    ratio, detail = roots_check(js, ref, S)
    back = backward_check(js, coeffs)
    fails = []
    if ratio > 1:
        fails.append(f"raíces ({detail})")
    if back > 1:
        fails.append("reconstrucción del polinomio")
    for r in js:
        if r.imag != 0 and not np.any((js.real == r.real) & (js.imag == -r.imag)):
            fails.append("par conjugado no exacto")
            break
    return {"name": case["name"], "roots": ratio, "backward": back, "fails": fails}


def check_integrators(data: dict) -> list:
    P = data["pendulum"]

    def f(t, x):
        return [x[1], -P["c"] * x[1] - P["gL"] * math.sin(x[0])]

    sol = solve_ivp(f, (0.0, P["t1"]), [P["theta0"], P["omega0"]], method="DOP853", rtol=1e-13, atol=1e-14, dense_output=True)
    rows = []
    for run in data["runs"]:
        ref = sol.sol(np.asarray(run["t"])).T
        err = float(np.max(np.abs(np.asarray(run["x"]) - ref)))
        label = f"{run['method']} " + (f"dt={run['dt']:g}" if "dt" in run else f"rtol={run['rtol']:g}")
        if run["method"] == "rk45":
            sp = solve_ivp(f, (0.0, P["t1"]), [P["theta0"], P["omega0"]], method="RK45",
                           rtol=run["rtol"], atol=run["atol"], t_eval=run["t"])
            err_sp = float(np.max(np.abs(sp.y.T - ref)))
            tol = max(INTEG_RK45_FACTOR * err_sp, 1e-8)
            check, what = err, f"error {err:.1e} > {tol:.1e} (scipy RK45: {err_sp:.1e})"
        else:
            same = fixed_step(run["method"], f, [P["theta0"], P["omega0"]], 0.0, P["t1"], run["dt"])
            check = float(np.max(np.abs(np.asarray(run["x"][-1]) - same)))
            tol = INTEG_SAME_METHOD
            what = f"difiere de la implementación independiente del mismo método en {check:.1e}"
        fails = [] if (check <= tol and run["stats"]["success"]) else [what]
        rows.append({"name": label, "err": err, "check": check, "tol": tol, "steps": run["stats"]["steps"], "fails": fails})
    xref = sol.sol(P["t1"])
    for o in data["orders"]:
        e1, e2 = (float(np.max(np.abs(np.asarray(xf) - xref))) for xf in o["finals"])
        p = math.log(e1 / e2) / math.log(o["dts"][0] / o["dts"][1])
        fails = [] if abs(p - o["order"]) <= 0.25 else [f"orden observado {p:.2f}"]
        rows.append({"name": f"orden {o['method']}", "err": p, "check": None, "tol": o["order"], "steps": None, "fails": fails})
    return rows


ENERGY_TOL = 1e-3            # balances de energía: |Δ| ≤ 1e-3 × escala (máx. de E, ∫P_dis, ∫P_ent) frente a DOP853


def energy_model(case):
    """(f(t, x, u), x0, almacenada, disipada, aportada) del modelo del caso (masa-resorte o RLC serie)."""
    p = case["params"]
    if case["model"] == "massSpring":
        m, b, k = p["m"], p["b"], p["k"]
        return (lambda t, x, u: [x[1], (u - b * x[1] - k * x[0]) / m], [0.0, 0.0],
                lambda x: 0.5 * k * x[0] ** 2 + 0.5 * m * x[1] ** 2, lambda x, u: b * x[1] ** 2, lambda x, u: u * x[1])
    if case["model"] == "rlc":
        R, L, C = p["R"], p["L"], p["C"]
        return (lambda t, x, u: [(u - R * x[0] - x[1]) / L, x[0] / C], [0.0, 0.0],
                lambda x: 0.5 * L * x[0] ** 2 + 0.5 * C * x[1] ** 2, lambda x, u: R * x[0] ** 2, lambda x, u: u * x[0])
    raise ValueError(case["model"])


def check_energy(case: dict) -> dict:
    """Integra con DOP853 el sistema aumentado [x, ∫P_dis, ∫P_ent] por tramos entre los saltos de la entrada."""
    res = {"name": case["name"], "fails": []}
    f, x0, stored, dis, pin = energy_model(case)
    inp = case["input"]
    A, t0 = inp.get("amplitude", 1.0), inp.get("t0", 0.0)
    w = inp.get("width", 1.0)
    T = case["duration"]
    if inp["type"] == "escalon":
        edges, levels = [0.0, t0, T], [0.0, A]
    elif inp["type"] == "pulso":
        edges, levels = [0.0, t0, t0 + w, T], [0.0, A, 0.0]
    else:
        raise ValueError(inp["type"])
    y = np.array(x0 + [0.0, 0.0])
    emax = 0.0
    for a, b_, u in zip(edges[:-1], edges[1:], levels):
        if b_ <= a:
            continue

        def g(t, z, u=u):
            x = z[:2]
            return list(f(t, x, u)) + [dis(x, u), pin(x, u)]

        sol = solve_ivp(g, (a, b_), y, method="DOP853", rtol=1e-12, atol=1e-15, dense_output=True)
        for tt in np.linspace(a, b_, 400):
            emax = max(emax, abs(stored(sol.sol(tt)[:2])))
        y = sol.y[:, -1]
    ref = {"E0": stored(x0), "E1": stored(y[:2]), "dissipated": y[2], "input": y[3]}
    scale = max(emax, abs(ref["dissipated"]), abs(ref["input"]), 1e-300)
    js = case["parts"]
    worst = 0.0
    for key in ("E1", "dissipated", "input"):
        worst = max(worst, abs(js[key] - ref[key]) / (ENERGY_TOL * scale))
    res["ratio"] = worst
    res["relative"] = case["relative"]
    res["steps"] = case["steps"]
    if worst > 1:
        res["fails"].append(f"energías frente a DOP853 (razón {worst:.2g})")
    if not case["ok"] or case["parts"].get("source") != "trayectoria":
        res["fails"].append(f"balance JS no se cumple (relativo {case['relative']:.2g})")
    return res


def fmt(x) -> str:
    if x is None:
        return "-"
    if isinstance(x, float) and (math.isinf(x) or math.isnan(x)):
        return "inf"
    return f"{x:.1e}"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    data = load_dump()
    total_fail = 0

    print("\nFunciones de transferencia (razón error/tolerancia; ≤ 1 es correcto; Bode en dB y grados)")
    hdr = f"{'caso':32} {'polos':>8} {'grupos':>8} {'ceros':>8} {'escalón':>8} {'impulso':>8} {'|G| dB':>8} {'fase °':>8} {'FP':>8} {'métricas':>8}  estado"
    print(hdr)
    print("-" * len(hdr))
    for case in data["tf"]:
        r = check_tf(case)
        ok = not r["fails"]
        total_fail += 0 if ok else 1
        print(f"{r['name'][:32]:32} {fmt(r['poles']):>8} {fmt(r['groups']):>8} {fmt(r['zeros']):>8} {fmt(r['step']):>8} {fmt(r['impulse']):>8} "
              f"{fmt(r['mag']):>8} {fmt(r['phase']):>8} {fmt(r['pf']):>8} {fmt(r['info']):>8}  {'OK' if ok else 'FALLA: ' + '; '.join(r['fails'])}")

    print("\nRaíces de polinomios (razón error/tolerancia)")
    print(f"{'polinomio':32} {'raíces':>8} {'reconstr.':>9}  estado")
    for case in data["poly"]:
        r = check_poly(case)
        ok = not r["fails"]
        total_fail += 0 if ok else 1
        print(f"{r['name'][:32]:32} {fmt(r['roots']):>8} {fmt(r['backward']):>9}  {'OK' if ok else 'FALLA: ' + '; '.join(r['fails'])}")

    print("\nIntegradores: péndulo no lineal (error frente a solve_ivp DOP853, rtol 1e-13)")
    print("  paso fijo: comprobado frente a una implementación independiente del mismo método (≤ 1e-9)")
    print("  rk45: error ≤ 10 × el de scipy RK45 con las mismas tolerancias; órdenes: |p − p_teórico| ≤ 0.25")
    print(f"{'ejecución':32} {'error':>9} {'comprob.':>9} {'límite':>9} {'pasos':>7}  estado")
    for r in check_integrators(data["integrators"]):
        ok = not r["fails"]
        total_fail += 0 if ok else 1
        st = "OK" if ok else "FALLA: " + "; ".join(r["fails"])
        if r["steps"] is None:
            print(f"{r['name']:32} {'p = ' + format(r['err'], '.2f'):>9} {'':>9} {r['tol']:>9} {'':>7}  {st}")
        else:
            print(f"{r['name']:32} {r['err']:>9.1e} {r['check']:>9.1e} {r['tol']:>9.1e} {r['steps']:>7}  {st}")

    print("\nBalances de energía de simulate() (E₁, ∫P_dis, ∫P_ent frente a solve_ivp DOP853 del sistema aumentado; razón ≤ 1)")
    print(f"{'ejecución':32} {'razón':>9} {'residuo JS':>11} {'pasos':>7}  estado")
    for case in data.get("energy", []):
        r = check_energy(case)
        ok = not r["fails"]
        total_fail += 0 if ok else 1
        print(f"{r['name'][:32]:32} {r['ratio']:>9.1e} {r['relative']:>11.1e} {r['steps']:>7}  {'OK' if ok else 'FALLA: ' + '; '.join(r['fails'])}")

    n = len(data["tf"]) + len(data["poly"]) + len(data["integrators"]["runs"]) + len(data["integrators"]["orders"]) + len(data.get("energy", []))
    print(f"\nResumen: {n - total_fail} de {n} comprobaciones correctas ({len(data['tf'])} funciones de transferencia).")
    if total_fail:
        print(f"crosscheck: {total_fail} discrepancia(s) por encima de la tolerancia.")
        return 1
    print("crosscheck: todo coincide con NumPy/SciPy dentro de las tolerancias.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

// tools/pelucave.mjs — Propietario: anim.
// Genera js/anim/pelucaveAsset.js (geometría del logo Pelucave por capas) a partir de
// tools/pelucave/svg-completo.svg: el compuesto original de 762×734 con 32 <path> (1–16 solo contorno,
// 17–32 con relleno). Los índices por capa son los mismos que usa el arnés de calibración
// («la mejor page», src/config/layers.js): cambiar uno aquí desalinea los pivotes calibrados.
//
// - Determinista: mismo SVG ⇒ mismos bytes. Atómico: escribe en un temporal y renombra.
// - Falla (código 1) si el SVG no tiene 32 paths, su viewBox no es 0 0 762 734 o algún path no tiene d.
//
// Uso: node tools/pelucave.mjs [--check]
//   --check  no escribe; falla si js/anim/pelucaveAsset.js no está al día.
import fs from 'node:fs';
import { rel, writeAtomic, fail, posixRel } from './lib.mjs';

const SRC = rel('tools', 'pelucave', 'svg-completo.svg');
const OUT = rel('js', 'anim', 'pelucaveAsset.js');
const EXPECTED_PATHS = 32;
const VIEWBOX = Object.freeze({ x: 0, y: 0, width: 762, height: 734 });

/** Índices (base 1) de los <path> del compuesto que forman cada capa. */
const INDEX = Object.freeze({
  craneo: [17],                              // silueta: contorno exterior + 12 agujeros (ojo y placas)
  pelo: [19, 20],                            // dos mechones sueltos
  ojo: [21, 22],                             // globo + párpado
  mandibulaSuperior: [23, 25, 27, 29, 31],   // arcada superior: placas impares
  mandibulaInferior: [24, 26, 28, 30, 32],   // arcada inferior: placas pares
});

const checkOnly = process.argv.includes('--check');
if (!fs.existsSync(SRC)) fail(`Falta ${posixRel(SRC)}.`);
const text = fs.readFileSync(SRC, 'utf8');

const vb = text.match(/\bviewBox="([^"]+)"/);
if (!vb || vb[1].trim().split(/\s+/).map(Number).join(' ') !== `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`) {
  fail(`${posixRel(SRC)}: viewBox inesperado «${vb ? vb[1] : '(ninguno)'}»; se esperaba 0 0 762 734.`);
}

/** Atributos d de cada <path>, en orden de aparición. */
function extractPaths(svgText) {
  const out = [];
  for (const m of svgText.matchAll(/<path\b([^>]*?)\/?>/gs)) {
    const d = m[1].match(/\bd="([^"]*)"/);
    if (d) out.push(d[1].trim());
  }
  return out;
}

/** Primer subtrazo (hasta el primer Z): el contorno exterior sin agujeros, región de recorte de los dientes. */
function firstSubpath(d) {
  const i = d.search(/[Zz]/);
  return i === -1 ? d : d.slice(0, i + 1);
}

const paths = extractPaths(text);
if (paths.length !== EXPECTED_PATHS) fail(`${posixRel(SRC)}: se esperaban ${EXPECTED_PATHS} paths y hay ${paths.length}.`);
const d = (i) => paths[i - 1];

const layers = {};
for (const [key, idx] of Object.entries(INDEX)) layers[key] = idx.map(d);
const craneoSolido = firstSubpath(layers.craneo[0]);

function lines(list) {
  return list.map((s) => `      ${JSON.stringify(s)}`).join(',\n');
}

const body = Object.entries(layers)
  .map(([key, list]) => `    ${key}: Object.freeze([\n${lines(list)}\n    ])`)
  .join(',\n');

const output = `/*
 * js/anim/pelucaveAsset.js — GENERADO por tools/pelucave.mjs. No editar a mano.
 * Fuente: tools/pelucave/svg-completo.svg (logo Pelucave, viewBox 0 0 762 734, 32 paths).
 * Capas (índices del compuesto): craneo [17] · pelo [19, 20] · ojo [21, 22] ·
 * mandibulaSuperior [23, 25, 27, 29, 31] · mandibulaInferior [24, 26, 28, 30, 32].
 * craneoSolido = primer subtrazo de la silueta (sin agujeros): región del <clipPath> que contiene los dientes.
 * Geometría sin presentación: los colores los pone css/pelucave.css. API: docs/api/pelucave.md.
 */
(function (global) {
  'use strict';
  var DSL = global.DSL = global.DSL || {};
  DSL.anim = DSL.anim || {};
  DSL.anim.pelucaveAsset = Object.freeze({
    viewBox: Object.freeze({ x: ${VIEWBOX.x}, y: ${VIEWBOX.y}, width: ${VIEWBOX.width}, height: ${VIEWBOX.height} }),
    craneoSolido: ${JSON.stringify(craneoSolido)},
    paths: Object.freeze({
${body}
    })
  });
})(typeof window !== 'undefined' ? window : globalThis);
`;

const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if (checkOnly) {
  if (current !== output) fail(`${posixRel(OUT)} no está al día. Ejecute: node tools/pelucave.mjs`);
  console.log(`${posixRel(OUT)} al día.`);
} else {
  if (current !== output) writeAtomic(OUT, output);
  const n = Object.values(layers).reduce((s, l) => s + l.length, 0);
  console.log(`${posixRel(OUT)}: ${n} paths en ${Object.keys(layers).length} capas` + (current === output ? ' (sin cambios)' : ''));
}

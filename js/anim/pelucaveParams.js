/*
 * js/anim/pelucaveParams.js — Propietario: anim.
 * Parámetros físicos de la transición Pelucave, tal como los exportó el arnés de calibración
 * («la mejor page», tag v2-calibrated-export). Son la ÚNICA fuente de verdad y son inmutables: no se
 * ajustan aquí. Para recalibrar: panel del arnés → «Exportar JSON» → pegar el bloque completo.
 * Ángulos en grados (positivo = horario en pantalla), distancias en unidades de usuario del viewBox
 * 0 0 762 734, tiempos en segundos. API: docs/api/pelucave.md.
 */
(function (global) {
  'use strict';
  var DSL = global.DSL = global.DSL || {};
  DSL.anim = DSL.anim || {};

  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]);
    });
    return Object.freeze(o);
  }

  /* ---- JSON exportado (no alterar ningún valor) ---- */
  DSL.anim.pelucaveParams = deepFreeze({
    mandibula: {
      anguloApertura: 32,
      dx: -6,
      dy: 10,
      contraccion: -3,
      pivoteX: 384,
      pivoteY: 452,
      separacionInicial: 0,
      separacionMaxima: 28,
      anguloSuperior: -4,
      anguloInferior: 0,
      pivoteSupX: 426,
      pivoteSupY: 390
    },
    cabeza: {
      anguloAnticipacion: -8,
      retraccion: 18,
      anguloApertura: 5,
      squash: 0.05,
      pivoteX: 420,
      pivoteY: 699
    },
    inercia: {
      retrasoOjo: 0.06,
      retrasoPelo: 0.09,
      amplitudOjo: 10,
      amplitudPelo: 14,
      rotacionPelo: -5
    },
    elastico: {
      amplitud: 1.2,
      periodo: 0.35
    },
    fases: {
      anticipacion: 0.28,
      apertura: 0.18,
      climax: 0.35,
      recuperacion: 0.9
    },
    dummy: {
      tamano: 56,
      distancia: 260,
      elevacion: -40
    }
  });

  /*
   * Geometría fija del asset (no es calibración: depende solo del dibujo), tomada del arnés
   * (src/config/layers.js ANCHORS y las cajas getBBox en reposo de docs/arquitectura.md):
   * - lineaDental: frontera entre arcadas; su normal (hacia abajo-izquierda) es la dirección de separación dental.
   * - bboxReposo: cajas en reposo de las piezas móviles. Fijarlas evita leer getBBox() en tiempo de ejecución
   *   (prohibido en el bucle) y hace el punto de eyección independiente del navegador.
   */
  DSL.anim.pelucaveGeometria = deepFreeze({
    viewBox: { x: 0, y: 0, width: 762, height: 734 },
    lineaDental: { arriba: { x: 418, y: 395 }, abajo: { x: 528, y: 690 } },
    bboxReposo: {
      superior: { x: 416.483, y: 353, width: 123.839, height: 332 },
      inferior: { x: 366.248, y: 376, width: 166.752, height: 316.404 },
      pelo: { x: 104, y: 205, width: 188, height: 262.009 }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot =
  path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      relativePath
    ),
    'utf8'
  );
}

test(
  'package publica la auditoría funcional de Fase 11',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts[
        'data:functional-coverage:desafio1'
      ],
      'node scripts/auditarCoberturaFuncionalDesafio1.js'
    );
  }
);

test(
  'Dashboard consume un reporte agregado de cobertura funcional',
  () => {
    const html =
      read('frontend/dashboard.html');
    const js =
      read('frontend/dashboard.js');

    assert.match(
      html,
      /FASE 11 · COBERTURA FUNCIONAL/
    );
    assert.match(
      html,
      /¿Qué aporta cada dataset al prototipo\?/
    );
    assert.match(
      js,
      /\/api\/demo\/data-coverage/
    );
    assert.doesNotMatch(
      js,
      /subscriberKey|customerKey|financialAccount|phoneHash/
    );
  }
);

test(
  'documentación distingue integración de fuentes de cobertura causal',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-fase11.md'
      );

    assert.match(
      doc,
      /No se fuerza que cada CSV produzca una causa visible/i
    );
    assert.match(
      doc,
      /NOTAS DE CRÉDITO\/DÉBITO/i
    );
    assert.match(
      doc,
      /Cuota de equipo financiado/i
    );
    assert.match(
      doc,
      /SUBSCRIBER_KEY/
    );
  }
);

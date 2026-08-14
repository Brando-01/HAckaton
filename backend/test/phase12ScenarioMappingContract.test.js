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
  'package publica la auditoría de mapeo de Fase 12',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts[
        'data:scenario-mapping:desafio1'
      ],
      'node scripts/auditarMapeoEscenariosDesafio1.js'
    );
  }
);

test(
  'Dashboard presenta Fase 12 como auditoría y no como causas ya resueltas',
  () => {
    const html =
      read('frontend/dashboard.html');
    const js =
      read('frontend/dashboard.js');

    assert.match(
      html,
      /FASE 12 · MAPEO DE ESCENARIOS/
    );
    assert.match(
      html,
      /Un patrón encontrado no se convierte automáticamente en causa financiera/
    );
    assert.match(
      js,
      /\/api\/demo\/scenario-mapping/
    );
    assert.doesNotMatch(
      js,
      /subscriberKey|customerKey|financialAccount|phoneHash/
    );
  }
);

test(
  'Fase 12 documenta que equipo financiado no se fuerza desde financiamiento de deuda',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-fase12.md'
      );

    assert.match(
      doc,
      /Financiamiento de Deuda Móvil/i
    );
    assert.match(
      doc,
      /no equivale automáticamente a una cuota de equipo/i
    );
    assert.match(
      doc,
      /SUBSCRIBER_KEY/
    );
    assert.match(
      doc,
      /Fase 13/i
    );
  }
);

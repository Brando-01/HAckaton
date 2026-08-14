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
  'Checkpoint 14A adopta FACTURACION v2 sin conservar deuda o vencimiento fantasma',
  () => {
    const datasets =
      read(
        'backend/scripts/desafio1/datasets.js'
      );
    const repository =
      read(
        'backend/services/desafio1Repository.js'
      );
    const validation =
      read(
        'backend/scripts/desafio1/validation.js'
      );

    assert.match(
      datasets,
      /fileName: 'FACTURACION-CLIENTES\.csv'/
    );
    assert.match(
      datasets,
      /delimiter: ','/
    );
    assert.match(
      datasets,
      /PRIMARY_RESOURCE_VALUE/
    );
    assert.match(
      datasets,
      /SUBSCRIBER_KEY_1/
    );
    assert.match(
      datasets,
      /billingPeriodEnd/
    );
    assert.doesNotMatch(
      datasets,
      /source: 'DEUDA'|source: 'FECHA-VENCIMIENTO'/
    );
    assert.doesNotMatch(
      repository,
      /\bdue_date\b|\bdebt_status\b/
    );
    assert.match(
      validation,
      /facturacion_periodos_invertidos/
    );
    assert.match(
      validation,
      /facturacion_sentinel_periodo_persistido/
    );
  }
);

test(
  'Checkpoint 14A no persiste ni publica los campos auxiliares del layout v2',
  () => {
    const datasets =
      read(
        'backend/scripts/desafio1/datasets.js'
      );
    const server =
      read('backend/server.js');
    const gitignore =
      read('.gitignore');

    assert.match(
      datasets,
      /ignoredHeaders:[\s\S]*PRIMARY_RESOURCE_VALUE[\s\S]*SUBSCRIBER_KEY_1/
    );
    assert.match(
      datasets,
      /left: 'SUBSCRIBER_KEY'[\s\S]*right: 'SUBSCRIBER_KEY_1'/
    );
    assert.match(
      server,
      /billing:[\s\S]*'FACTURACION-CLIENTES\.csv'/
    );
    assert.doesNotMatch(
      server,
      /FACTURACION-CLIENTES_\.csv/
    );
    assert.match(
      gitignore,
      /^FACTURACION-CLIENTES\.csv$/m
    );
  }
);

test(
  'Checkpoint 14A documenta sentinel, abstención de deuda y compatibilidad con Fase 14',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-checkpoint14a-facturacion-v2.md'
      );

    assert.match(doc, /2222-01-01/);
    assert.match(doc, /no se infiere deuda/i);
    assert.match(doc, /SUBSCRIBER_KEY == SUBSCRIBER_KEY_1/);
    assert.match(doc, /no reescribe el histórico/i);
    assert.match(doc, /Checkpoint 14B/i);
    assert.match(doc, /297,002/);
    assert.match(doc, /95\.23%/);
  }
);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test(
  'Fase 15 define estados de resolución separados de los estados financieros',
  () => {
    const source = read(
      'backend/services/desafio1ResolutionLogic.js'
    );

    assert.match(
      source,
      /RESOLVED/
    );
    assert.match(
      source,
      /PARTIALLY_RESOLVED/
    );
    assert.match(
      source,
      /UNRESOLVED/
    );
    assert.match(
      source,
      /VARIATION_FULLY_EXPLAINED/
    );
    assert.match(
      source,
      /DEBT_STATUS_NOT_AVAILABLE/
    );
  }
);

test(
  'Fase 15 reemplaza las acciones oficiales estáticas por una política determinista',
  () => {
    const source = read(
      'backend/services/officialDemoExperienceService.js'
    );

    assert.match(
      source,
      /buildAppNextActions/
    );
    assert.match(
      source,
      /actionPolicy\.nextActions/
    );
    assert.doesNotMatch(
      source,
      /nextActions:\s*\[\s*\{\s*id:\s*'EXPLAIN_BILL'/s
    );
  }
);

test(
  'API de chat expone resolución y la conserva en contexto para siguientes fases',
  () => {
    const source = read(
      'backend/server.js'
    );

    assert.match(
      source,
      /resolutionStatus:/
    );
    assert.match(
      source,
      /nextActions:/
    );
    assert.match(
      source,
      /lastResolutionStatus:/
    );
    assert.match(
      source,
      /lastResolutionReason:/
    );
    assert.match(
      source,
      /aggregateCustomerResolutions/
    );
  }
);

test(
  'Lucía y Mi Movistar ejecutan solo acciones CHAT o navegación local',
  () => {
    const chat = read(
      'frontend/chat.js'
    );
    const app = read(
      'frontend/app.js'
    );

    assert.match(
      chat,
      /appendNextActions/
    );
    assert.match(
      chat,
      /action\.type === 'CHAT'/
    );
    assert.match(
      chat,
      /action\.type === 'NAVIGATE'/
    );
    assert.match(
      chat,
      /action\.href\.startsWith\('\/'\)/
    );
    assert.match(
      app,
      /action\.type === 'NAVIGATE'/
    );
    assert.match(
      app,
      /action\.href\.startsWith\('\/'\)/
    );
  }
);

test(
  'documentación Fase 15 prohíbe pago y cross-selling sin evidencia',
  () => {
    const doc = read(
      'backend/docs/desafio1-fase15.md'
    );

    assert.match(
      doc,
      /no ofrece `PAY_BILL`/i
    );
    assert.match(
      doc,
      /FACTURACION v2 eliminó `DEUDA`/i
    );
    assert.match(
      doc,
      /no ofrece acciones comerciales/i
    );
    assert.match(
      doc,
      /lastResolutionStatus/
    );
    assert.match(
      doc,
      /Resolución digital\*/
    );
  }
);

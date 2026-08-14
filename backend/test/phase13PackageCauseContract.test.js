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
  'Fase 13 documenta marcador estructurado, delta monetario y abstención',
  () => {
    const doc =
      read(
        'backend/docs/desafio1-fase13.md'
      );

    assert.match(
      doc,
      /GRUPO = PAQUETES/
    );
    assert.match(
      doc,
      /delta del mismo `CHARGE_CODE_ID`/i
    );
    assert.match(
      doc,
      /no.*suficiente.*crear una causa/is
    );
    assert.match(
      doc,
      /equipo financiado.*ambiguo/is
    );
  }
);

test(
  'motor causal de paquetes usa marcadores estructurados y no texto descriptivo como única regla',
  () => {
    const logic =
      read(
        'backend/services/desafio1ExplanationLogic.js'
      );

    assert.match(
      logic,
      /function isPackageItem/
    );
    assert.match(
      logic,
      /value === 'paquetes'/
    );
    assert.match(
      logic,
      /PACKAGE_STRUCTURED_CHARGE_DELTA/
    );
    assert.match(
      logic,
      /packageCauseAmountsDerivedFromChargeDelta:\s*true/
    );
  }
);

test(
  'explorador expone PACKAGES como filtro seguro sin cambiar los escenarios premium de Fase 4',
  () => {
    const html =
      read('frontend/explorer.html');
    const explorerLogic =
      read(
        'backend/services/datasetExplorerLogic.js'
      );
    const demoSelection =
      read(
        'backend/services/desafio1DemoSelectionLogic.js'
      );

    assert.match(
      html,
      /value="PACKAGES"/
    );
    assert.match(
      explorerLogic,
      /PACKAGES:\s*'Paquetes adicionales'/
    );
    assert.doesNotMatch(
      demoSelection,
      /PACKAGES:\s*\{/
    );
  }
);

test(
  'capa conversacional reconoce consultas personales de paquetes sin delegar razonamiento financiero',
  () => {
    const conversation =
      read(
        'backend/services/desafio1ConversationLogic.js'
      );

    assert.match(
      conversation,
      /PACKAGE_CHARGE/
    );
    assert.match(
      conversation,
      /No encontré una variación verificable del recibo atribuible a un paquete/i
    );
    assert.match(
      conversation,
      /financialReasoningByLlm:\s*false/
    );
  }
);

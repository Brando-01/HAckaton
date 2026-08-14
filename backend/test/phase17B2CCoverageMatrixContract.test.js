const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
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
  'Fase 17 publica un comando dedicado para la matriz B2C completa',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts[
        'audit:b2c-matrix:desafio1'
      ],
      'node scripts/auditarMatrizB2CDesafio1.js'
    );
  }
);

test(
  'el artefacto local de Fase 17 y los parches de transporte quedan fuera de Git',
  () => {
    const gitignore =
      read('.gitignore');

    assert.match(
      gitignore,
      /\/backend\/data\/phase17-b2c-matrix\.local\.json/
    );
    assert.match(
      gitignore,
      /\/\*\.patch/
    );
  }
);

test(
  'el parche correctivo de Fase 16 ya no forma parte del producto versionado',
  () => {
    assert.equal(
      fs.existsSync(
        path.join(
          root,
          'fase16-correctivo-retrieval-redondeo.patch'
        )
      ),
      false
    );
  }
);

test(
  'la lógica declara cinco escenarios críticos y prohíbe checks por soporte teórico',
  () => {
    const source = read(
      'backend/services/desafio1B2CCoverageMatrixLogic.js'
    );

    for (
      const scenario of [
        'PRORATION',
        'FINANCED_EQUIPMENT',
        'RECONNECTION',
        'DISCOUNT_ENDED',
        'PLAN_CHANGE'
      ]
    ) {
      assert.match(
        source,
        new RegExp(scenario)
      );
    }

    assert.match(
      source,
      /verifiedCellRequiresObservedHighEvidenceCase:\s*true/
    );
    assert.match(
      source,
      /theoreticalSupportMarkedVerified:\s*false/
    );
    assert.match(
      source,
      /financedEquipmentPromotedWithoutEvidence:\s*false/
    );
  }
);

test(
  'la documentación distingue negocio, lob_type y RA/RV sin presentar huecos como soporte',
  () => {
    const docs = read(
      'backend/docs/desafio1-fase17.md'
    );

    assert.match(
      docs,
      /negocio \+ lob_type × RA\/RV/i
    );
    assert.match(
      docs,
      /NO poner ✓ por soporte teórico/i
    );
    assert.match(
      docs,
      /PENDING_MAPPING/
    );
    assert.match(
      docs,
      /SAMPLE_ONLY/
    );
    assert.match(
      docs,
      /SUBSCRIBER_KEY/
    );
  }
);

test(
  'README explica cómo reproducir la matriz sin convertir una muestra en cobertura total',
  () => {
    const readme =
      read('README.md');

    assert.match(
      readme,
      /audit:b2c-matrix:desafio1/
    );
    assert.match(
      readme,
      /SAMPLE_ONLY/
    );
    assert.match(
      readme,
      /FINANCED_EQUIPMENT/
    );
  }
);

test(
  'el CLI escanea todo por defecto y ofrece details, write y limit explícito para pruebas',
  () => {
    const {
      parseArgs
    } = require(
      '../scripts/auditarMatrizB2CDesafio1'
    );

    const defaults =
      parseArgs([]);

    assert.equal(
      defaults.limit,
      null
    );
    assert.equal(
      defaults.concurrency,
      4
    );

    const custom = parseArgs([
      '--limit',
      '500',
      '--concurrency',
      '3',
      '--details',
      '--write',
      'tmp/matrix.json'
    ]);

    assert.equal(
      custom.limit,
      500
    );
    assert.equal(
      custom.concurrency,
      3
    );
    assert.equal(
      custom.details,
      true
    );
    assert.equal(
      custom.write,
      true
    );
    assert.match(
      custom.outputPath,
      /tmp[\\/]matrix\.json$/
    );
  }
);

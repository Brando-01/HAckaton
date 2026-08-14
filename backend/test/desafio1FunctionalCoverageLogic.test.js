const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SOURCE_DEFINITIONS,
  CONFIRMED_DATA_RULES,
  buildFunctionalCoverageReport
} = require(
  '../services/desafio1FunctionalCoverageLogic'
);

function buildMetadata() {
  return SOURCE_DEFINITIONS.map(
    (source, index) => ({
      datasetKey: source.key,
      importedRows:
        100 + index,
      parseWarningCount: 0
    })
  );
}

test(
  'Fase 11 declara exactamente las ocho fuentes oficiales con un rol funcional',
  () => {
    assert.equal(
      SOURCE_DEFINITIONS.length,
      8
    );

    assert.deepEqual(
      SOURCE_DEFINITIONS.map(
        (source) => source.key
      ),
      [
        'planta_clientes',
        'facturacion_clientes',
        'ordenes',
        'catalogo_ofertas',
        'brainy_descuentos_cuotas',
        'brainy_prorrateo',
        'brainy_reconexiones',
        'notas_credito'
      ]
    );

    SOURCE_DEFINITIONS.forEach(
      (source) => {
        assert.ok(source.role);
        assert.ok(
          source.capabilities.length > 0
        );
      }
    );
  }
);

test(
  'el reporte diferencia fuentes importadas de escenarios consolidados',
  () => {
    const report =
      buildFunctionalCoverageReport({
        importMetadata:
          buildMetadata(),
        diagnostics: {
          facturationSubscribers:
            18450,
          catalogChargeCoveragePct:
            95.9,
          planChangeOrderCount: 3,
          suspensionOrderCount: 5,
          adjustmentNoteCount: 9
        }
      });

    assert.equal(
      report.summary.importedSources,
      8
    );
    assert.equal(
      report.summary.allSourcesImported,
      true
    );
    assert.ok(
      report.summary.readyScenarios >= 7
    );

    const notes =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'ADJUSTMENT_NOTES'
      );
    const equipment =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'FINANCED_EQUIPMENT'
      );

    assert.equal(
      notes.status,
      'CONTEXT_ONLY'
    );
    assert.equal(
      equipment.status,
      'PENDING_MAPPING'
    );
  }
);

test(
  'las decisiones confirmadas preservan subscriber como llave canónica y el error conocido de periodos',
  () => {
    const serialized =
      JSON.stringify(
        CONFIRMED_DATA_RULES
      );

    assert.match(
      serialized,
      /NUM_ANEXO/
    );
    assert.match(
      serialized,
      /SUBSCRIBER_KEY/
    );
    assert.match(
      serialized,
      /COD_CLIENTE puede agrupar varias suscripciones/
    );
    assert.match(
      serialized,
      /PERIOD_START_DATE/
    );
    assert.match(
      serialized,
      /incidencia/i
    );
  }
);

test(
  'si una fuente requerida falta, el escenario no se presenta como listo',
  () => {
    const metadata =
      buildMetadata().filter(
        (item) =>
          item.datasetKey !==
          'brainy_prorrateo'
      );

    const report =
      buildFunctionalCoverageReport({
        importMetadata: metadata
      });

    const proration =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'PRORATION'
      );

    assert.equal(
      proration.status,
      'SOURCE_MISSING'
    );
    assert.deepEqual(
      proration.missingSourceKeys,
      ['brainy_prorrateo']
    );
  }
);

test(
  'Fase 13 incorpora paquetes adicionales como capacidad consolidada sin promover equipo o suspensión',
  () => {
    const report =
      buildFunctionalCoverageReport({
        importMetadata:
          buildMetadata()
      });

    const packages =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'PACKAGES'
      );
    const suspension =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'SUSPENSION_ADJUSTMENT'
      );
    const equipment =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'FINANCED_EQUIPMENT'
      );

    assert.equal(
      packages.status,
      'READY'
    );
    assert.match(
      packages.detail,
      /delta monetario/i
    );
    assert.equal(
      report.summary.readyScenarios,
      8
    );
    assert.equal(
      suspension.status,
      'PARTIAL'
    );
    assert.equal(
      equipment.status,
      'PENDING_MAPPING'
    );
  }
);

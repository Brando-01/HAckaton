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
  'las decisiones confirmadas preservan subscriber y registran la migración segura de FACTURACION v2',
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
      /2222-01-01/
    );
    assert.match(
      serialized,
      /no incluye DEUDA ni FECHA-VENCIMIENTO/i
    );
    assert.match(
      serialized,
      /SUBSCRIBER_KEY_1/
    );

    const billingSource =
      SOURCE_DEFINITIONS.find(
        (source) =>
          source.key ===
          'facturacion_clientes'
      );

    assert.ok(
      billingSource.capabilities.includes(
        'CHARGE_PERIOD'
      )
    );
    assert.equal(
      billingSource.capabilities.includes(
        'DEBT'
      ),
      false
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
  'Checkpoint 14B conserva paquetes y consolida el hallazgo verificable de suspensión sin promover equipo',
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
    assert.ok(
      report.summary.readyScenarios >= 8
    );
    assert.equal(
      suspension.status,
      'READY'
    );
    assert.match(
      suspension.detail,
      /hallazgo verificable/i
    );
    assert.equal(
      equipment.status,
      'PENDING_MAPPING'
    );
  }
);


test(
  'Checkpoint 14B registra la regla de crédito RA y mantiene las notas generales como contexto',
  () => {
    const report =
      buildFunctionalCoverageReport({
        importMetadata: buildMetadata(),
        diagnostics: {
          adjustmentNoteCount: 8861,
          suspensionOrderCount: 16379
        }
      });

    const suspension =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'SUSPENSION_ADJUSTMENT'
      );
    const notes =
      report.scenarios.find(
        (scenario) =>
          scenario.id ===
          'ADJUSTMENT_NOTES'
      );

    assert.equal(suspension.status, 'READY');
    assert.deepEqual(
      suspension.sourceKeys,
      [
        'facturacion_clientes',
        'catalogo_ofertas',
        'brainy_reconexiones',
        'notas_credito'
      ]
    );
    assert.equal(notes.status, 'CONTEXT_ONLY');
    assert.match(notes.detail, /subconjunto/i);

    const rule =
      CONFIRMED_DATA_RULES.find(
        (item) =>
          item.id ===
          'SUSPENSION_RA_CREDIT_RECONCILIATION'
      );

    assert.ok(rule);
    assert.match(rule.detail, /no se suma al delta/i);
  }
);

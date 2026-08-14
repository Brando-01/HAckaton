const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SOURCE_DEFINITIONS
} = require(
  '../services/desafio1FunctionalCoverageLogic'
);

const {
  createDesafio1FunctionalCoverageService
} = require(
  '../services/desafio1FunctionalCoverageService'
);

function fakeValueForSql(sql) {
  const normalized =
    String(sql).toLowerCase();

  if (
    normalized.includes(
      "rent_type = 'ra'"
    )
  ) return 3000;
  if (
    normalized.includes(
      "rent_type = 'rv'"
    )
  ) return 3500;
  if (
    normalized.includes(
      'customerswithmultiplesubscriptions'
    )
  ) return 0;
  if (
    normalized.includes(
      'having count('
    ) &&
    normalized.includes(
      'distinct subscriber_key'
    )
  ) return 27;
  if (
    normalized.includes(
      'period_start_date is not null'
    )
  ) return 95.23;
  if (
    normalized.includes(
      'period_end_date is not null'
    )
  ) return 95.23;
  if (
    normalized.includes(
      'd1_catalogo_ofertas c'
    )
  ) return 95.9;
  if (
    /count\s*\(\s*distinct\s+subscriber_key\s*\)/.test(normalized) &&
    /from\s+d1_facturacion/.test(normalized)
  ) return 18450;
  if (
    normalized.includes(
      'cambio de plan'
    )
  ) return 12;
  if (
    normalized.includes(
      '%suspens%'
    )
  ) return 20;
  if (
    normalized.includes(
      'from d1_notas_credito'
    ) &&
    !normalized.includes(
      'left join'
    )
  ) return 8861;

  return 0;
}

test(
  'el servicio abre/cierra el repositorio y devuelve un reporte agregado sin identificadores',
  async () => {
    const calls = {
      open: 0,
      close: 0,
      get: 0
    };

    const repository = {
      async open() {
        calls.open += 1;
      },
      async close() {
        calls.close += 1;
      },
      async getImportMetadata() {
        return SOURCE_DEFINITIONS.map(
          (source) => ({
            datasetKey: source.key,
            importedRows: 10,
            parseWarningCount: 0
          })
        );
      },
      async get(sql) {
        calls.get += 1;
        return {
          value:
            fakeValueForSql(sql)
        };
      }
    };

    const service =
      createDesafio1FunctionalCoverageService({
        repositoryFactory() {
          return repository;
        }
      });

    const report =
      await service.buildReport();

    assert.equal(calls.open, 1);
    assert.equal(calls.close, 1);
    assert.ok(calls.get >= 10);
    assert.equal(
      report.summary.importedSources,
      8
    );
    assert.equal(
      report.diagnostics.facturationSubscribers,
      18450
    );
    assert.equal(
      report.diagnostics.periodStartAvailabilityPct,
      95.23
    );
    assert.equal(
      report.diagnostics.periodEndAvailabilityPct,
      95.23
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /"subscriberKey"|"customerKey"|"financialAccount"|"phoneHash"/
    );
  }
);

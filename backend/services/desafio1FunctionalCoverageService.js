const {
  buildFunctionalCoverageReport
} = require(
  './desafio1FunctionalCoverageLogic'
);

function defaultRepositoryFactory() {
  const {
    createDesafio1Repository
  } = require(
    './desafio1Repository'
  );

  return createDesafio1Repository();
}

async function getNumericValue(
  repository,
  sql
) {
  const row =
    await repository.get(sql);

  return Number(
    row?.value ?? 0
  );
}

async function collectDiagnostics(
  repository
) {
  const [
    catalogChargeCoveragePct,
    periodStartAvailabilityPct,
    periodEndAvailabilityPct,
    facturationSubscribers,
    customersWithMultipleSubscriptions,
    facturationSubscriberJoinMisses,
    ordersSubscriberJoinMisses,
    notesSubscriberJoinMisses,
    planChangeOrderCount,
    suspensionOrderCount,
    adjustmentNoteCount,
    rentTypeRaRows,
    rentTypeRvRows
  ] = await Promise.all([
    getNumericValue(
      repository,
      `
        SELECT ROUND(
          100.0 * COUNT(
            DISTINCT CASE
              WHEN c.charge_code IS NOT NULL
              THEN f.charge_code_id
            END
          ) /
          NULLIF(
            COUNT(
              DISTINCT f.charge_code_id
            ),
            0
          ),
          2
        ) AS value
        FROM d1_facturacion f
        LEFT JOIN d1_catalogo_ofertas c
          ON c.charge_code =
             f.charge_code_id
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT ROUND(
          100.0 * SUM(
            CASE
              WHEN period_start_date IS NOT NULL
              THEN 1 ELSE 0
            END
          ) / NULLIF(COUNT(*), 0),
          2
        ) AS value
        FROM d1_facturacion
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT ROUND(
          100.0 * SUM(
            CASE
              WHEN period_end_date IS NOT NULL
              THEN 1 ELSE 0
            END
          ) / NULLIF(COUNT(*), 0),
          2
        ) AS value
        FROM d1_facturacion
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(
          DISTINCT subscriber_key
        ) AS value
        FROM d1_facturacion
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM (
          SELECT customer_key
          FROM d1_clientes
          GROUP BY customer_key
          HAVING COUNT(
            DISTINCT subscriber_key
          ) > 1
        ) grouped
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(
          DISTINCT f.subscriber_key
        ) AS value
        FROM d1_facturacion f
        LEFT JOIN d1_clientes c
          ON c.subscriber_key =
             f.subscriber_key
        WHERE c.subscriber_key IS NULL
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(
          DISTINCT o.subscriber_key
        ) AS value
        FROM d1_ordenes o
        LEFT JOIN d1_clientes c
          ON c.subscriber_key =
             o.subscriber_key
        WHERE c.subscriber_key IS NULL
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(
          DISTINCT n.service_receiver_id
        ) AS value
        FROM d1_notas_credito n
        LEFT JOIN d1_clientes c
          ON c.subscriber_key =
             n.service_receiver_id
        WHERE c.subscriber_key IS NULL
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM d1_ordenes
        WHERE LOWER(
          COALESCE(reason_desc, '')
        ) LIKE '%cambio de plan%'
          OR LOWER(
            COALESCE(item_type_desc, '')
          ) LIKE '%cambio de plan%'
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM d1_ordenes
        WHERE LOWER(
          COALESCE(reason_desc, '')
        ) LIKE '%suspens%'
          OR LOWER(
            COALESCE(reason_desc, '')
          ) LIKE '%corte%'
          OR LOWER(
            COALESCE(item_type_desc, '')
          ) LIKE '%suspens%'
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM d1_notas_credito
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM d1_catalogo_ofertas
        WHERE rent_type = 'RA'
      `
    ),
    getNumericValue(
      repository,
      `
        SELECT COUNT(*) AS value
        FROM d1_catalogo_ofertas
        WHERE rent_type = 'RV'
      `
    )
  ]);

  return {
    catalogChargeCoveragePct,
    periodStartAvailabilityPct,
    periodEndAvailabilityPct,
    facturationSubscribers,
    customersWithMultipleSubscriptions,
    facturationSubscriberJoinMisses,
    ordersSubscriberJoinMisses,
    notesSubscriberJoinMisses,
    planChangeOrderCount,
    suspensionOrderCount,
    adjustmentNoteCount,
    rentTypeRaRows,
    rentTypeRvRows
  };
}

class Desafio1FunctionalCoverageService {
  constructor({
    repositoryFactory = null,
    cacheTtlMs = 5 * 60 * 1000
  } = {}) {
    this.repositoryFactory =
      repositoryFactory ||
      defaultRepositoryFactory;
    this.cacheTtlMs =
      Math.max(0, Number(cacheTtlMs) || 0);
    this.cachedReport = null;
    this.cachedAt = 0;
  }

  async buildReport({
    force = false
  } = {}) {
    const now = Date.now();

    if (
      !force &&
      this.cachedReport &&
      this.cacheTtlMs > 0 &&
      now - this.cachedAt <
        this.cacheTtlMs
    ) {
      return this.cachedReport;
    }

    const repository =
      this.repositoryFactory();

    await repository.open();

    try {
      const [
        importMetadata,
        diagnostics
      ] = await Promise.all([
        repository.getImportMetadata(),
        collectDiagnostics(repository)
      ]);

      const report =
        buildFunctionalCoverageReport({
          importMetadata,
          diagnostics
        });

      this.cachedReport = report;
      this.cachedAt = now;

      return report;
    } finally {
      await repository.close();
    }
  }
}

function createDesafio1FunctionalCoverageService(
  options = {}
) {
  return new Desafio1FunctionalCoverageService(
    options
  );
}

module.exports = {
  collectDiagnostics,
  Desafio1FunctionalCoverageService,
  createDesafio1FunctionalCoverageService
};

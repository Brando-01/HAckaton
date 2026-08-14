const {
  buildScenarioMappingReport
} = require(
  './desafio1ScenarioMappingLogic'
);

function defaultRepositoryFactory() {
  const {
    createDesafio1Repository
  } = require(
    './desafio1Repository'
  );

  return createDesafio1Repository();
}

async function numericRow(
  repository,
  sql
) {
  return (
    await repository.get(sql)
  ) || {};
}

async function collectScenarioMappingDiagnostics(
  repository
) {
  const [
    packageSummary,
    packageOrders,
    packagePatterns,
    equipmentSummary,
    equipmentOrders,
    financingPatterns,
    additionalSummary,
    additionalPatterns,
    suspensionSummary,
    suspensionNearby,
    suspensionVerifiedCredits,
    noteSummary,
    noteMatches
  ] = await Promise.all([
    numericRow(
      repository,
      `
        SELECT
          COUNT(*) AS packageBillingRows,
          COUNT(DISTINCT subscriber_key)
            AS packageBillingSubscribers,
          COUNT(DISTINCT charge_code_id)
            AS packageBillingCodes,
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_classification,
                  ''
                )
              ) LIKE '%cargo unico paquete%'
              THEN 1 ELSE 0
            END
          ) AS packageOneShotRows,
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_classification,
                  ''
                )
              ) LIKE '%cargo recurrente paquete%'
              THEN 1 ELSE 0
            END
          ) AS packageRecurringRows
        FROM d1_facturacion
        WHERE UPPER(
          COALESCE(
            charge_group,
            ''
          )
        ) = 'PAQUETES'
          OR LOWER(
            COALESCE(
              charge_code_classification,
              ''
            )
          ) LIKE '%paquete%'
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          COUNT(*) AS packageOrderRows
        FROM d1_ordenes
        WHERE LOWER(
          COALESCE(reason_desc, '')
        ) LIKE '%paquete%'
          OR LOWER(
            COALESCE(
              item_type_desc,
              ''
            )
          ) LIKE '%paquete%'
      `
    ),
    repository.all(
      `
        SELECT
          charge_code_id AS chargeCode,
          charge_code_desc AS description,
          charge_code_classification
            AS classification,
          charge_group AS "group",
          charge_subgroup AS subgroup,
          COUNT(*) AS rows
        FROM d1_facturacion
        WHERE UPPER(
          COALESCE(
            charge_group,
            ''
          )
        ) = 'PAQUETES'
          OR LOWER(
            COALESCE(
              charge_code_classification,
              ''
            )
          ) LIKE '%paquete%'
        GROUP BY
          charge_code_id,
          charge_code_desc,
          charge_code_classification,
          charge_group,
          charge_subgroup
        ORDER BY rows DESC
        LIMIT 8
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_desc,
                  ''
                )
              ) LIKE '%equipo%'
                OR LOWER(
                  COALESCE(
                    charge_code_desc,
                    ''
                  )
                ) LIKE '%terminal%'
                OR LOWER(
                  COALESCE(
                    charge_code_desc,
                    ''
                  )
                ) LIKE '%cuota%'
              THEN 1 ELSE 0
            END
          ) AS explicitEquipmentChargeRows,
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_desc,
                  ''
                )
              ) LIKE '%financ%'
                OR LOWER(
                  COALESCE(
                    charge_code_classification,
                    ''
                  )
                ) LIKE '%financ%'
                OR LOWER(
                  COALESCE(
                    charge_subgroup,
                    ''
                  )
                ) LIKE '%financ%'
              THEN 1 ELSE 0
            END
          ) AS financingKeywordRows,
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_desc,
                  ''
                )
              ) LIKE '%financiamiento de deuda%'
              THEN 1 ELSE 0
            END
          ) AS financingDebtRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  charge_subgroup,
                  ''
                )
              ) = 'EQUIPOS'
              THEN 1 ELSE 0
            END
          ) AS equipmentSubgroupRows
        FROM d1_facturacion
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          COUNT(*) AS equipmentOrderRows
        FROM d1_ordenes
        WHERE LOWER(
          COALESCE(reason_desc, '')
        ) LIKE '%equipo%'
          OR LOWER(
            COALESCE(reason_desc, '')
          ) LIKE '%caeq%'
          OR LOWER(
            COALESCE(
              item_type_desc,
              ''
            )
          ) LIKE '%equipo%'
      `
    ),
    repository.all(
      `
        SELECT
          charge_code_id AS chargeCode,
          charge_code_desc AS description,
          charge_code_classification
            AS classification,
          charge_group AS "group",
          charge_subgroup AS subgroup,
          COUNT(*) AS rows
        FROM d1_facturacion
        WHERE LOWER(
          COALESCE(
            charge_code_desc,
            ''
          )
        ) LIKE '%financ%'
          OR LOWER(
            COALESCE(
              charge_code_classification,
              ''
            )
          ) LIKE '%financ%'
          OR LOWER(
            COALESCE(
              charge_subgroup,
              ''
            )
          ) LIKE '%financ%'
          OR UPPER(
            COALESCE(
              charge_subgroup,
              ''
            )
          ) = 'EQUIPOS'
        GROUP BY
          charge_code_id,
          charge_code_desc,
          charge_code_classification,
          charge_group,
          charge_subgroup
        ORDER BY rows DESC
        LIMIT 8
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  charge_group,
                  ''
                )
              ) = 'TRAFICO ADICIONAL'
              THEN 1 ELSE 0
            END
          ) AS additionalTrafficRows,
          COUNT(
            DISTINCT CASE
              WHEN UPPER(
                COALESCE(
                  charge_group,
                  ''
                )
              ) = 'TRAFICO ADICIONAL'
              THEN subscriber_key
            END
          ) AS additionalTrafficSubscribers,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  charge_group,
                  ''
                )
              ) = 'ROAMING'
              THEN 1 ELSE 0
            END
          ) AS additionalRoamingRows,
          COUNT(
            DISTINCT CASE
              WHEN UPPER(
                COALESCE(
                  charge_group,
                  ''
                )
              ) = 'ROAMING'
              THEN subscriber_key
            END
          ) AS additionalRoamingSubscribers,
          SUM(
            CASE
              WHEN LOWER(
                COALESCE(
                  charge_code_classification,
                  ''
                )
              ) = 'cargo recurrente de servicios'
              THEN 1 ELSE 0
            END
          ) AS additionalRecurringServiceRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  charge_group,
                  ''
                )
              ) = 'OTROS'
                AND LOWER(
                  COALESCE(
                    charge_code_classification,
                    ''
                  )
                ) LIKE 'cargo unico%'
              THEN 1 ELSE 0
            END
          ) AS additionalOtherUniqueRows
        FROM d1_facturacion
      `
    ),
    repository.all(
      `
        SELECT
          charge_code_id AS chargeCode,
          charge_code_desc AS description,
          charge_code_classification
            AS classification,
          charge_group AS "group",
          charge_subgroup AS subgroup,
          COUNT(*) AS rows
        FROM d1_facturacion
        WHERE UPPER(
          COALESCE(
            charge_group,
            ''
          )
        ) IN (
          'TRAFICO ADICIONAL',
          'ROAMING'
        )
          OR LOWER(
            COALESCE(
              charge_code_classification,
              ''
            )
          ) = 'cargo recurrente de servicios'
          OR (
            UPPER(
              COALESCE(
                charge_group,
                ''
              )
            ) = 'OTROS'
            AND LOWER(
              COALESCE(
                charge_code_classification,
                ''
              )
            ) LIKE 'cargo unico%'
          )
        GROUP BY
          charge_code_id,
          charge_code_desc,
          charge_code_classification,
          charge_group,
          charge_subgroup
        ORDER BY rows DESC
        LIMIT 8
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          COUNT(*) AS suspensionOrderRows,
          COUNT(DISTINCT subscriber_key)
            AS suspensionSubscribers,
          (
            SELECT COUNT(*)
            FROM d1_facturacion f
            WHERE LOWER(
              COALESCE(
                f.charge_code_desc,
                ''
              )
            ) LIKE '%suspens%'
              OR LOWER(
                COALESCE(
                  f.charge_code_desc,
                  ''
                )
              ) LIKE '%dias sin servicio%'
              OR LOWER(
                COALESCE(
                  f.charge_subgroup,
                  ''
                )
              ) LIKE '%suspens%'
          ) AS explicitSuspensionChargeRows
        FROM d1_ordenes
        WHERE LOWER(
          COALESCE(reason_desc, '')
        ) LIKE '%suspens%'
          OR LOWER(
            COALESCE(reason_desc, '')
          ) LIKE '%corte%'
          OR LOWER(
            COALESCE(
              item_type_desc,
              ''
            )
          ) LIKE '%suspend%'
      `
    ),
    numericRow(
      repository,
      `
        SELECT COUNT(*)
          AS suspensionNearbyProportionalInvoices
        FROM (
          SELECT DISTINCT
            o.subscriber_key,
            f.legal_invoice_number
          FROM d1_ordenes o
          INNER JOIN d1_facturacion f
            ON f.subscriber_key =
               o.subscriber_key
          WHERE (
            LOWER(
              COALESCE(
                o.reason_desc,
                ''
              )
            ) LIKE '%suspens%'
            OR LOWER(
              COALESCE(
                o.reason_desc,
                ''
              )
            ) LIKE '%corte%'
            OR LOWER(
              COALESCE(
                o.item_type_desc,
                ''
              )
            ) LIKE '%suspend%'
          )
            AND UPPER(
              COALESCE(
                f.charge_group,
                ''
              )
            ) LIKE 'CARGO FIJO PROPORCIONAL%'
            AND ABS(
              julianday(
                f.billing_cycle_date
              ) -
              julianday(
                substr(
                  COALESCE(
                    o.completion_date,
                    o.start_date
                  ),
                  1,
                  10
                )
              )
            ) <= 62
        ) nearby
      `
    ),
    numericRow(
      repository,
      `
        WITH unambiguous_ra_codes AS (
          SELECT charge_code
          FROM d1_catalogo_ofertas
          WHERE rent_type IS NOT NULL
          GROUP BY charge_code
          HAVING COUNT(DISTINCT rent_type) = 1
             AND MAX(rent_type) = 'RA'
        ),
        reconnection_windows AS (
          SELECT DISTINCT
            f.subscriber_key AS subscriber_key,
            r.billing_arrangement AS billing_arrangement,
            f.billing_cycle_date AS billing_cycle_date,
            r.cut_date AS cut_date,
            r.reconnection_date AS reconnection_date
          FROM d1_reconexiones r
          INNER JOIN d1_facturacion f
            ON f.legal_invoice_number = r.invoice_number
           AND f.billing_arrangement_key = r.billing_arrangement
          WHERE r.cut_date IS NOT NULL
            AND r.reconnection_date IS NOT NULL
            AND DATE(r.reconnection_date) > DATE(r.cut_date)
        ),
        timeline_notes AS (
          SELECT DISTINCT
            n.service_receiver_id AS subscriber_key,
            n.billing_arrangement AS billing_arrangement,
            n.charge_code AS charge_code,
            n.cancel_charge_type AS cancel_charge_type,
            n.amount AS amount,
            n.period_start_date AS period_start_date,
            n.period_end_date AS period_end_date,
            n.billing_cycle_date AS billing_cycle_date
          FROM d1_notas_credito n
          INNER JOIN reconnection_windows w
            ON w.subscriber_key = n.service_receiver_id
           AND w.billing_arrangement = n.billing_arrangement
           AND w.billing_cycle_date = n.billing_cycle_date
          WHERE n.amount < 0
            AND UPPER(COALESCE(n.cancel_charge_type, '')) = 'CRD'
            AND DATE(n.period_start_date) = DATE(w.cut_date)
            AND DATE(n.period_end_date) = DATE(w.reconnection_date, '-1 day')
        ),
        ra_notes AS (
          SELECT t.*
          FROM timeline_notes t
          INNER JOIN unambiguous_ra_codes ra
            ON ra.charge_code = t.charge_code
        ),
        verified AS (
          SELECT DISTINCT
            t.subscriber_key,
            t.billing_arrangement,
            t.charge_code,
            t.cancel_charge_type,
            t.amount,
            t.period_start_date,
            t.period_end_date,
            t.billing_cycle_date
          FROM ra_notes t
          INNER JOIN d1_facturacion f
            ON f.subscriber_key = t.subscriber_key
           AND f.charge_code_id = t.charge_code
          WHERE f.period_start_date IS NOT NULL
            AND f.period_end_date IS NOT NULL
            AND f.billing_cycle_date = (
              SELECT MAX(f_previous.billing_cycle_date)
              FROM d1_facturacion f_previous
              WHERE f_previous.subscriber_key = t.subscriber_key
                AND f_previous.billing_cycle_date < t.billing_cycle_date
            )
            AND DATE(t.period_start_date) >= DATE(f.period_start_date)
            AND DATE(t.period_end_date) <= DATE(f.period_end_date)
            AND f.charge_net_amount > 0
            AND ABS(
              ROUND(ABS(t.amount), 2) -
              ROUND(
                ABS(f.charge_net_amount) *
                (
                  julianday(t.period_end_date) -
                  julianday(t.period_start_date) + 1
                ) /
                (
                  julianday(f.period_end_date) -
                  julianday(f.period_start_date) + 1
                ),
                2
              )
            ) < 0.011
        )
        SELECT
          (
            SELECT COUNT(*)
            FROM timeline_notes
          ) AS suspensionExactTimelineNegativeNoteRows,
          (
            SELECT COUNT(*)
            FROM ra_notes
          ) AS suspensionRaCreditCandidateRows,
          (
            SELECT COUNT(*)
            FROM verified
          ) AS suspensionVerifiedCreditRows,
          (
            SELECT COUNT(DISTINCT subscriber_key)
            FROM verified
          ) AS suspensionVerifiedCreditSubscribers,
          (
            SELECT COUNT(*) FROM ra_notes
          ) - (
            SELECT COUNT(*) FROM verified
          ) AS suspensionUnreconciledRaRows
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          COUNT(*) AS adjustmentNoteRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  cancel_charge_type,
                  ''
                )
              ) = 'CRD'
              THEN 1 ELSE 0
            END
          ) AS adjustmentCrdRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  cancel_charge_type,
                  ''
                )
              ) = 'DSC'
              THEN 1 ELSE 0
            END
          ) AS adjustmentDscRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  cancel_charge_type,
                  ''
                )
              ) = 'CRD'
                AND amount < 0
              THEN 1 ELSE 0
            END
          ) AS adjustmentCrdNegativeRows,
          SUM(
            CASE
              WHEN UPPER(
                COALESCE(
                  cancel_charge_type,
                  ''
                )
              ) = 'DSC'
                AND amount > 0
              THEN 1 ELSE 0
            END
          ) AS adjustmentDscPositiveRows
        FROM d1_notas_credito
      `
    ),
    numericRow(
      repository,
      `
        SELECT
          SUM(
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM d1_facturacion f
                WHERE f.subscriber_key =
                      n.service_receiver_id
                  AND f.charge_code_id =
                      n.charge_code
              )
              THEN 1 ELSE 0
            END
          ) AS adjustmentMatchedSubscriberCodeRows,
          SUM(
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM d1_facturacion f
                WHERE f.subscriber_key =
                      n.service_receiver_id
                  AND f.charge_code_id =
                      n.charge_code
                  AND f.billing_cycle_date =
                      n.billing_cycle_date
              )
              THEN 1 ELSE 0
            END
          ) AS adjustmentMatchedSameCycleRows
        FROM d1_notas_credito n
      `
    )
  ]);

  return {
    ...packageSummary,
    ...packageOrders,
    packagePatterns,
    ...equipmentSummary,
    ...equipmentOrders,
    financingPatterns,
    ...additionalSummary,
    additionalChargePatterns:
      additionalPatterns,
    ...suspensionSummary,
    ...suspensionNearby,
    ...suspensionVerifiedCredits,
    ...noteSummary,
    ...noteMatches
  };
}

class Desafio1ScenarioMappingService {
  constructor({
    repositoryFactory = null,
    cacheTtlMs = 5 * 60 * 1000
  } = {}) {
    this.repositoryFactory =
      repositoryFactory ||
      defaultRepositoryFactory;
    this.cacheTtlMs =
      Math.max(
        0,
        Number(cacheTtlMs) || 0
      );
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
      const diagnostics =
        await collectScenarioMappingDiagnostics(
          repository
        );

      const report =
        buildScenarioMappingReport(
          diagnostics
        );

      this.cachedReport = report;
      this.cachedAt = now;

      return report;
    } finally {
      await repository.close();
    }
  }
}

function createDesafio1ScenarioMappingService(
  options = {}
) {
  return new Desafio1ScenarioMappingService(
    options
  );
}

module.exports = {
  collectScenarioMappingDiagnostics,
  Desafio1ScenarioMappingService,
  createDesafio1ScenarioMappingService
};

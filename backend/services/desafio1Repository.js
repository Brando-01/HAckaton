const fs = require('fs');
const path = require('path');
const sqlite3 =
  require('sqlite3').verbose();

const DEFAULT_DB_PATH =
  path.resolve(
    __dirname,
    '../data/desafio1.db'
  );

function getDbPath(
  explicitPath = null
) {
  if (explicitPath) {
    return path.resolve(
      explicitPath
    );
  }

  if (
    process.env
      .DESAFIO1_DB_PATH
  ) {
    return path.resolve(
      process.env
        .DESAFIO1_DB_PATH
    );
  }

  return DEFAULT_DB_PATH;
}

function normalizeKey(value) {
  const normalized =
    String(
      value ?? ''
    ).trim();

  return normalized ||
    null;
}

class Desafio1Repository {
  constructor({
    dbPath = null
  } = {}) {
    this.dbPath =
      getDbPath(dbPath);

    this.db = null;
  }

  async open() {
    if (this.db) {
      return this;
    }

    if (
      !fs.existsSync(
        this.dbPath
      )
    ) {
      const error =
        new Error(
          `No existe la base oficial del Desafío 1 en ${this.dbPath}. `
          + 'Ejecuta primero npm run data:import:desafio1.'
        );

      error.code =
        'DESAFIO1_DB_NOT_FOUND';

      throw error;
    }

    this.db =
      await new Promise(
        (
          resolve,
          reject
        ) => {
          const database =
            new sqlite3.Database(
              this.dbPath,
              sqlite3.OPEN_READONLY,
              (error) => {
                if (error) {
                  reject(error);
                  return;
                }

                resolve(
                  database
                );
              }
            );
        }
      );

    const expectedTable =
      await this.get(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'd1_facturacion'
        `
      );

    if (!expectedTable) {
      await this.close();

      const error =
        new Error(
          'La base desafio1.db existe, pero no contiene el esquema esperado de la Fase 1.'
        );

      error.code =
        'DESAFIO1_SCHEMA_INVALID';

      throw error;
    }

    return this;
  }

  async close() {
    if (!this.db) {
      return;
    }

    const database =
      this.db;

    this.db = null;

    await new Promise(
      (
        resolve,
        reject
      ) => {
        database.close(
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          }
        );
      }
    );
  }

  ensureOpen() {
    if (!this.db) {
      throw new Error(
        'El repositorio del Desafío 1 no está abierto'
      );
    }
  }

  async get(
    sql,
    params = []
  ) {
    this.ensureOpen();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        this.db.get(
          sql,
          params,
          (
            error,
            row
          ) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(
              row || null
            );
          }
        );
      }
    );
  }

  async all(
    sql,
    params = []
  ) {
    this.ensureOpen();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        this.db.all(
          sql,
          params,
          (
            error,
            rows
          ) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(
              rows || []
            );
          }
        );
      }
    );
  }

  async getSubscriber(
    subscriberKey
  ) {
    const key =
      normalizeKey(
        subscriberKey
      );

    if (!key) {
      return null;
    }

    return this.get(
      `
        SELECT
          customer_key AS customerKey,
          financial_account AS financialAccount,
          subscriber_key AS subscriberKey,
          activation_date AS activationDate,
          billing_cycle_day AS billingCycleDay,
          lob_type AS lobType,
          business_type AS businessType,
          source_row AS sourceRow
        FROM d1_clientes
        WHERE subscriber_key = ?
        LIMIT 1
      `,
      [key]
    );
  }

  async listInvoiceHeadersForSubscriber(
    subscriberKey,
    {
      limit = 6
    } = {}
  ) {
    const key =
      normalizeKey(
        subscriberKey
      );

    if (!key) {
      return [];
    }

    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) || 2,
          1
        ),
        12
      );

    return this.all(
      `
        SELECT
          legal_invoice_number AS invoiceNumber,
          billing_arrangement_key AS billingArrangement,
          customer_key AS customerKey,
          financial_account_key AS financialAccount,
          billing_cycle_date AS cycleDate,
          due_date AS dueDate
        FROM d1_facturacion
        WHERE subscriber_key = ?
        GROUP BY
          legal_invoice_number,
          billing_arrangement_key,
          customer_key,
          financial_account_key,
          billing_cycle_date,
          due_date
        ORDER BY
          billing_cycle_date DESC,
          legal_invoice_number DESC
        LIMIT ?
      `,
      [
        key,
        safeLimit
      ]
    );
  }

  async getInvoiceCharges(
    invoiceNumber,
    billingArrangement = null
  ) {
    const invoice =
      normalizeKey(
        invoiceNumber
      );

    const ba =
      normalizeKey(
        billingArrangement
      );

    if (!invoice) {
      return [];
    }

    const params =
      ba
        ? [
            invoice,
            ba
          ]
        : [invoice];

    const billingArrangementClause =
      ba
        ? 'AND billing_arrangement_key = ?'
        : '';

    return this.all(
      `
        SELECT
          id,
          financial_account_key AS financialAccount,
          customer_key AS customerKey,
          billing_arrangement_key AS billingArrangement,
          legal_invoice_number AS invoiceNumber,
          billing_cycle_key AS billingCycleKey,
          charge_net_amount AS chargeNetAmount,
          charge_total_amount AS chargeTotalAmount,
          charge_code_id AS chargeCode,
          charge_code_desc AS description,
          charge_code_classification AS classification,
          subscriber_key AS subscriberKey,
          period_start_date AS periodStartDate,
          period_end_date AS periodEndDate,
          billing_cycle_date AS cycleDate,
          charge_group AS "group",
          charge_subgroup AS subgroup,
          due_date AS dueDate,
          debt_status AS debtStatus,
          source_row AS sourceRow
        FROM d1_facturacion
        WHERE legal_invoice_number = ?
          ${billingArrangementClause}
        ORDER BY id
      `,
      params
    );
  }

  async getCatalogEntries(
    chargeCodes
  ) {
    const codes =
      Array.from(
        new Set(
          (
            chargeCodes ||
            []
          )
            .map(
              normalizeKey
            )
            .filter(Boolean)
        )
      );

    if (!codes.length) {
      return [];
    }

    const placeholders =
      codes.map(
        () => '?'
      ).join(', ');

    return this.all(
      `
        SELECT
          charge_code AS chargeCode,
          rate_final AS rateFinal,
          rent_type AS rentType,
          source_row AS sourceRow
        FROM d1_catalogo_ofertas
        WHERE charge_code IN (
          ${placeholders}
        )
        ORDER BY
          charge_code,
          rate_final,
          id
      `,
      codes
    );
  }

  async getProrationsForInvoice({
    invoiceNumber,
    billingArrangement
  }) {
    const invoice =
      normalizeKey(
        invoiceNumber
      );

    const ba =
      normalizeKey(
        billingArrangement
      );

    if (
      !invoice ||
      !ba
    ) {
      return [];
    }

    return this.all(
      `
        SELECT
          billing_arrangement AS billingArrangement,
          financial_account AS financialAccount,
          number_value AS numberValue,
          invoice_number AS invoiceNumber,
          billing_cycle_date AS cycleDate,
          period_start_date AS periodStartDate,
          period_end_date AS periodEndDate,
          prorated_amount AS proratedAmount,
          charge_count AS chargeCount,
          number_type AS numberType,
          source_row AS sourceRow
        FROM d1_prorrateos
        WHERE invoice_number = ?
          AND billing_arrangement = ?
        ORDER BY id
      `,
      [
        invoice,
        ba
      ]
    );
  }

  async getReconnectionsForInvoice({
    invoiceNumber,
    billingArrangement
  }) {
    const invoice =
      normalizeKey(
        invoiceNumber
      );

    const ba =
      normalizeKey(
        billingArrangement
      );

    if (
      !invoice ||
      !ba
    ) {
      return [];
    }

    return this.all(
      `
        SELECT
          billing_arrangement AS billingArrangement,
          financial_account AS financialAccount,
          number_value AS numberValue,
          code,
          invoice_number AS invoiceNumber,
          description,
          reconnection_date AS reconnectionDate,
          amount,
          billing_cycle_date AS cycleDate,
          cut_date AS cutDate,
          source_row AS sourceRow
        FROM d1_reconexiones
        WHERE invoice_number = ?
          AND billing_arrangement = ?
        ORDER BY id
      `,
      [
        invoice,
        ba
      ]
    );
  }

  async getDiscountsForCycle({
    billingArrangement,
    cycleDate
  }) {
    const ba =
      normalizeKey(
        billingArrangement
      );

    const cycle =
      normalizeKey(
        cycleDate
      );

    if (
      !ba ||
      !cycle
    ) {
      return [];
    }

    return this.all(
      `
        SELECT
          process_type AS processType,
          invoice_flag AS invoiceFlag,
          rent_type AS rentType,
          billing_arrangement AS billingArrangement,
          billing_cycle_date AS cycleDate,
          phone,
          start_date AS startDate,
          promotion_duration AS promotionDuration,
          promotion_percentage AS promotionPercentage,
          charge_code AS chargeCode,
          end_date AS endDate,
          overdue_days AS overdueDays,
          prepaid_days AS prepaidDays,
          cycle_start_flag AS cycleStartFlag,
          current_installment AS currentInstallment,
          translation,
          description,
          full_discount_flag AS fullDiscountFlag,
          discount_type AS discountType,
          financial_account AS financialAccount,
          discount_amount AS discountAmount,
          number_type AS numberType,
          source_row AS sourceRow
        FROM d1_descuentos_cuotas
        WHERE billing_arrangement = ?
          AND billing_cycle_date = ?
        ORDER BY id
      `,
      [
        ba,
        cycle
      ]
    );
  }

  async getCreditNotesForCycle({
    billingArrangement,
    cycleDate
  }) {
    const ba =
      normalizeKey(
        billingArrangement
      );

    const cycle =
      normalizeKey(
        cycleDate
      );

    if (
      !ba ||
      !cycle
    ) {
      return [];
    }

    return this.all(
      `
        SELECT
          receiver_customer AS receiverCustomer,
          billing_arrangement AS billingArrangement,
          service_receiver_id AS serviceReceiverId,
          charge_code AS chargeCode,
          cancel_charge_type AS cancelChargeType,
          effective_date AS effectiveDate,
          amount,
          period_start_date AS periodStartDate,
          period_end_date AS periodEndDate,
          billing_cycle_date AS cycleDate,
          source_row AS sourceRow
        FROM d1_notas_credito
        WHERE billing_arrangement = ?
          AND billing_cycle_date = ?
        ORDER BY id
      `,
      [
        ba,
        cycle
      ]
    );
  }

  async getOrdersBetweenBills({
    subscriberKeys,
    startDate,
    endDate
  }) {
    const subscribers =
      Array.from(
        new Set(
          (
            subscriberKeys ||
            []
          )
            .map(
              normalizeKey
            )
            .filter(Boolean)
        )
      );

    const start =
      normalizeKey(
        startDate
      );

    const end =
      normalizeKey(
        endDate
      );

    if (
      !subscribers.length ||
      !start ||
      !end
    ) {
      return [];
    }

    const placeholders =
      subscribers.map(
        () => '?'
      ).join(', ');

    return this.all(
      `
        SELECT
          customer_key AS customerKey,
          subscriber_key AS subscriberKey,
          completion_date AS completionDate,
          start_date AS startDate,
          reason_desc AS reason,
          reason_id AS reasonId,
          item_type_desc AS itemType,
          status_desc AS status,
          source_row AS sourceRow
        FROM d1_ordenes
        WHERE subscriber_key IN (
          ${placeholders}
        )
          AND DATE(
            COALESCE(
              completion_date,
              start_date
            )
          ) > DATE(?)
          AND DATE(
            COALESCE(
              completion_date,
              start_date
            )
          ) <= DATE(?)
        ORDER BY
          COALESCE(
            completion_date,
            start_date
          ) ASC,
          id ASC
      `,
      [
        ...subscribers,
        start,
        end
      ]
    );
  }

  async listDemoScenarioCandidateKeys(
    scenarioCode,
    {
      limit = 300
    } = {}
  ) {
    const scenario = String(
      scenarioCode ?? ''
    )
      .trim()
      .toUpperCase()
      .replace(/[ -]+/g, '_');

    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) || 300,
          1
        ),
        2000
      );

    const commonCte = `
      WITH headers AS (
        SELECT
          subscriber_key,
          legal_invoice_number,
          billing_arrangement_key,
          billing_cycle_date
        FROM d1_facturacion
        WHERE subscriber_key IS NOT NULL
          AND billing_cycle_date IS NOT NULL
        GROUP BY
          subscriber_key,
          legal_invoice_number,
          billing_arrangement_key,
          billing_cycle_date
      ),
      ranked AS (
        SELECT
          subscriber_key,
          legal_invoice_number,
          billing_arrangement_key,
          billing_cycle_date,
          ROW_NUMBER() OVER (
            PARTITION BY subscriber_key
            ORDER BY
              billing_cycle_date DESC,
              legal_invoice_number DESC
          ) AS rn
        FROM headers
      ),
      current_bill AS (
        SELECT *
        FROM ranked
        WHERE rn = 1
      ),
      previous_bill AS (
        SELECT *
        FROM ranked
        WHERE rn = 2
      )
    `;

    let sql = null;

    if (scenario === 'RECONNECTION') {
      sql = `
        ${commonCte}
        SELECT DISTINCT
          current_bill.subscriber_key AS subscriberKey
        FROM current_bill
        INNER JOIN previous_bill
          ON previous_bill.subscriber_key =
             current_bill.subscriber_key
        INNER JOIN d1_reconexiones reconnection
          ON reconnection.invoice_number =
             current_bill.legal_invoice_number
         AND reconnection.billing_arrangement =
             current_bill.billing_arrangement_key
        INNER JOIN d1_facturacion charge
          ON charge.legal_invoice_number =
             current_bill.legal_invoice_number
         AND charge.billing_arrangement_key =
             current_bill.billing_arrangement_key
         AND charge.charge_code_id =
             reconnection.code
         AND charge.charge_total_amount > 0
        ORDER BY
          current_bill.billing_cycle_date DESC,
          current_bill.subscriber_key ASC
        LIMIT ?
      `;
    } else if (
      scenario === 'DISCOUNT_ENDED'
    ) {
      sql = `
        ${commonCte}
        SELECT DISTINCT
          current_bill.subscriber_key AS subscriberKey
        FROM current_bill
        INNER JOIN previous_bill
          ON previous_bill.subscriber_key =
             current_bill.subscriber_key
        INNER JOIN d1_descuentos_cuotas discount
          ON discount.billing_arrangement =
             previous_bill.billing_arrangement_key
         AND discount.billing_cycle_date =
             previous_bill.billing_cycle_date
        INNER JOIN d1_facturacion previous_charge
          ON previous_charge.legal_invoice_number =
             previous_bill.legal_invoice_number
         AND previous_charge.billing_arrangement_key =
             previous_bill.billing_arrangement_key
         AND previous_charge.charge_total_amount < 0
         AND ABS(
               ABS(previous_charge.charge_total_amount) -
               COALESCE(discount.discount_amount, 0)
             ) < 0.011
        LEFT JOIN d1_facturacion current_same_charge
          ON current_same_charge.legal_invoice_number =
             current_bill.legal_invoice_number
         AND current_same_charge.billing_arrangement_key =
             current_bill.billing_arrangement_key
         AND current_same_charge.charge_code_id =
             previous_charge.charge_code_id
        WHERE current_same_charge.id IS NULL
          AND (
            (
              discount.current_installment IS NOT NULL
              AND discount.promotion_duration IS NOT NULL
              AND discount.promotion_duration > 0
              AND discount.current_installment >=
                  discount.promotion_duration
            )
            OR (
              discount.end_date IS NOT NULL
              AND DATE(discount.end_date) <=
                  DATE(current_bill.billing_cycle_date)
            )
          )
        ORDER BY
          current_bill.billing_cycle_date DESC,
          current_bill.subscriber_key ASC
        LIMIT ?
      `;
    } else if (
      scenario === 'PLAN_CHANGE'
    ) {
      sql = `
        ${commonCte}
        SELECT DISTINCT
          current_bill.subscriber_key AS subscriberKey
        FROM current_bill
        INNER JOIN previous_bill
          ON previous_bill.subscriber_key =
             current_bill.subscriber_key
        INNER JOIN d1_ordenes order_row
          ON order_row.subscriber_key =
             current_bill.subscriber_key
        WHERE DATE(
                COALESCE(
                  order_row.completion_date,
                  order_row.start_date
                )
              ) > DATE(previous_bill.billing_cycle_date)
          AND DATE(
                COALESCE(
                  order_row.completion_date,
                  order_row.start_date
                )
              ) <= DATE(current_bill.billing_cycle_date)
          AND (
            LOWER(COALESCE(order_row.reason_desc, ''))
              LIKE '%cambio de plan%'
            OR LOWER(COALESCE(order_row.reason_desc, ''))
              LIKE '%hacia un plan menor%'
            OR LOWER(COALESCE(order_row.reason_desc, ''))
              LIKE '%hacia un plan mayor%'
          )
        ORDER BY
          current_bill.billing_cycle_date DESC,
          current_bill.subscriber_key ASC
        LIMIT ?
      `;
    } else if (
      scenario === 'PRORATION'
    ) {
      sql = `
        ${commonCte}
        SELECT DISTINCT
          current_bill.subscriber_key AS subscriberKey
        FROM current_bill
        INNER JOIN d1_prorrateos proration
          ON proration.invoice_number =
             current_bill.legal_invoice_number
         AND proration.billing_arrangement =
             current_bill.billing_arrangement_key
        INNER JOIN d1_facturacion proportional_charge
          ON proportional_charge.legal_invoice_number =
             current_bill.legal_invoice_number
         AND proportional_charge.billing_arrangement_key =
             current_bill.billing_arrangement_key
        LEFT JOIN previous_bill
          ON previous_bill.subscriber_key =
             current_bill.subscriber_key
        WHERE (
            LOWER(
              COALESCE(
                proportional_charge.charge_group,
                ''
              )
            ) LIKE '%proporcional%'
            OR LOWER(
              COALESCE(
                proportional_charge.charge_subgroup,
                ''
              )
            ) LIKE '%proporcional%'
          )
          AND ABS(
                COALESCE(
                  proportional_charge.charge_total_amount,
                  0
                ) -
                COALESCE(
                  proration.prorated_amount,
                  0
                )
              ) < 0.011
        ORDER BY
          CASE
            WHEN previous_bill.subscriber_key IS NULL
              THEN 0
            ELSE 1
          END ASC,
          current_bill.billing_cycle_date DESC,
          current_bill.subscriber_key ASC
        LIMIT ?
      `;
    } else {
      const error = new Error(
        `Escenario de preselección no soportado: ${scenarioCode}`
      );
      error.code =
        'DEMO_SCENARIO_INVALID';
      throw error;
    }

    const rows = await this.all(
      sql,
      [safeLimit]
    );

    return rows
      .map(
        (row) =>
          normalizeKey(
            row.subscriberKey
          )
      )
      .filter(Boolean);
  }

  async countCoverageSubscribers() {
    const row = await this.get(
      `
        SELECT COUNT(DISTINCT subscriber_key) AS total
        FROM d1_clientes
        WHERE subscriber_key IS NOT NULL
          AND TRIM(subscriber_key) <> ''
      `
    );

    return Number(
      row?.total || 0
    );
  }

  async listCoverageSubscriberSeeds({
    limit = null
  } = {}) {
    const parsedLimit =
      Number.parseInt(
        limit,
        10
      );

    const safeLimit =
      Number.isInteger(parsedLimit) &&
      parsedLimit > 0
        ? parsedLimit
        : null;

    const limitClause =
      safeLimit
        ? 'LIMIT ?'
        : '';

    const params =
      safeLimit
        ? [safeLimit]
        : [];

    return this.all(
      `
        WITH invoice_headers AS (
          SELECT
            subscriber_key,
            legal_invoice_number,
            billing_arrangement_key,
            customer_key,
            financial_account_key,
            billing_cycle_date,
            due_date
          FROM d1_facturacion
          WHERE subscriber_key IS NOT NULL
            AND TRIM(subscriber_key) <> ''
            AND legal_invoice_number IS NOT NULL
          GROUP BY
            subscriber_key,
            legal_invoice_number,
            billing_arrangement_key,
            customer_key,
            financial_account_key,
            billing_cycle_date,
            due_date
        ),
        invoice_counts AS (
          SELECT
            subscriber_key,
            COUNT(*) AS invoice_count,
            MAX(billing_cycle_date) AS latest_cycle_date
          FROM invoice_headers
          GROUP BY subscriber_key
        )
        SELECT
          client.subscriber_key AS subscriberKey,
          MIN(client.customer_key) AS customerKey,
          MIN(client.lob_type) AS lobType,
          MIN(client.business_type) AS businessType,
          COALESCE(
            invoice.invoice_count,
            0
          ) AS invoiceCount,
          invoice.latest_cycle_date AS latestCycleDate
        FROM d1_clientes client
        LEFT JOIN invoice_counts invoice
          ON invoice.subscriber_key =
             client.subscriber_key
        WHERE client.subscriber_key IS NOT NULL
          AND TRIM(client.subscriber_key) <> ''
        GROUP BY client.subscriber_key
        ORDER BY client.subscriber_key ASC
        ${limitClause}
      `,
      params
    );
  }

  async getImportMetadata() {
    return this.all(
      `
        SELECT
          dataset_key AS datasetKey,
          file_name AS fileName,
          sha256,
          file_size_bytes AS fileSizeBytes,
          imported_rows AS importedRows,
          parse_warning_count AS parseWarningCount,
          imported_at AS importedAt
        FROM d1_import_metadata
        ORDER BY dataset_key
      `
    );
  }
}

function createDesafio1Repository(
  options = {}
) {
  return new Desafio1Repository(
    options
  );
}

module.exports = {
  DEFAULT_DB_PATH,
  getDbPath,
  Desafio1Repository,
  createDesafio1Repository
};

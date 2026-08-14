const { get, run } = require('./sqliteHelpers');

const CHECKS = [
  {
    key: 'facturacion_subscriber_sin_planta',
    label: 'Suscriptores de facturación sin registro en planta',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT f.subscriber_key) AS value
      FROM d1_facturacion f
      LEFT JOIN d1_clientes c ON c.subscriber_key = f.subscriber_key
      WHERE c.subscriber_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'ordenes_subscriber_sin_planta',
    label: 'Suscriptores de órdenes sin registro en planta',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT o.subscriber_key) AS value
      FROM d1_ordenes o
      LEFT JOIN d1_clientes c ON c.subscriber_key = o.subscriber_key
      WHERE c.subscriber_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'ordenes_customer_sin_planta',
    label: 'Clientes de órdenes sin coincidencia por customer_key en planta',
    severity: 'WARN',
    query: `
      SELECT COUNT(DISTINCT o.customer_key) AS value
      FROM d1_ordenes o
      LEFT JOIN d1_clientes c ON c.customer_key = o.customer_key
      WHERE c.customer_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'prorrateos_recibo_sin_facturacion',
    label: 'Recibos Brainy de prorrateo sin factura',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT p.invoice_number) AS value
      FROM d1_prorrateos p
      LEFT JOIN d1_facturacion f ON f.legal_invoice_number = p.invoice_number
      WHERE f.legal_invoice_number IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'prorrateos_ba_sin_facturacion',
    label: 'Billing arrangements de prorrateo sin facturación',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT p.billing_arrangement) AS value
      FROM d1_prorrateos p
      LEFT JOIN d1_facturacion f ON f.billing_arrangement_key = p.billing_arrangement
      WHERE f.billing_arrangement_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'reconexiones_recibo_sin_facturacion',
    label: 'Recibos Brainy de reconexión sin factura',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT r.invoice_number) AS value
      FROM d1_reconexiones r
      LEFT JOIN d1_facturacion f ON f.legal_invoice_number = r.invoice_number
      WHERE f.legal_invoice_number IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'reconexiones_ba_sin_facturacion',
    label: 'Billing arrangements de reconexión sin facturación',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT r.billing_arrangement) AS value
      FROM d1_reconexiones r
      LEFT JOIN d1_facturacion f ON f.billing_arrangement_key = r.billing_arrangement
      WHERE f.billing_arrangement_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'notas_subscriber_sin_planta',
    label: 'Suscripciones de notas de crédito/débito sin planta',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT n.service_receiver_id) AS value
      FROM d1_notas_credito n
      LEFT JOIN d1_clientes c ON c.subscriber_key = n.service_receiver_id
      WHERE c.subscriber_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'notas_ba_sin_facturacion',
    label: 'Billing arrangements de notas de crédito/débito sin facturación',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT n.billing_arrangement) AS value
      FROM d1_notas_credito n
      LEFT JOIN d1_facturacion f ON f.billing_arrangement_key = n.billing_arrangement
      WHERE f.billing_arrangement_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'descuentos_ba_sin_facturacion',
    label: 'Billing arrangements de descuentos sin facturación',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT d.billing_arrangement) AS value
      FROM d1_descuentos_cuotas d
      LEFT JOIN d1_facturacion f ON f.billing_arrangement_key = d.billing_arrangement
      WHERE f.billing_arrangement_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'descuentos_cuenta_financiera_sin_facturacion',
    label: 'Cuentas financieras de descuentos sin facturación',
    severity: 'ERROR',
    query: `
      SELECT COUNT(DISTINCT d.financial_account) AS value
      FROM d1_descuentos_cuotas d
      LEFT JOIN d1_facturacion f ON f.financial_account_key = d.financial_account
      WHERE f.financial_account_key IS NULL
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'catalogo_cobertura_codigos_pct',
    label: 'Cobertura del catálogo sobre códigos de cargo usados en facturación (%)',
    severity: 'WARN',
    query: `
      SELECT ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN c.charge_code IS NOT NULL THEN f.charge_code_id END)
        / NULLIF(COUNT(DISTINCT f.charge_code_id), 0),
        2
      ) AS value
      FROM d1_facturacion f
      LEFT JOIN d1_catalogo_ofertas c ON c.charge_code = f.charge_code_id
    `,
    pass: (value) => Number(value) >= 90
  },
  {
    key: 'catalogo_codigos_duplicados',
    label: 'Códigos del catálogo con más de una tarifa registrada',
    severity: 'INFO',
    query: `
      SELECT COUNT(*) AS value
      FROM (
        SELECT charge_code
        FROM d1_catalogo_ofertas
        GROUP BY charge_code
        HAVING COUNT(*) > 1
      ) duplicated
    `,
    pass: () => true
  },
  {
    key: 'catalogo_conflictos_tipo_renta',
    label: 'Códigos del catálogo con tipos de renta contradictorios',
    severity: 'WARN',
    query: `
      SELECT COUNT(*) AS value
      FROM (
        SELECT charge_code
        FROM d1_catalogo_ofertas
        WHERE rent_type IS NOT NULL
        GROUP BY charge_code
        HAVING COUNT(DISTINCT rent_type) > 1
      ) conflicts
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'facturacion_period_start_disponible_pct',
    label: 'Filas de facturación con PERIOD_START_DATE utilizable (%)',
    severity: 'INFO',
    query: `
      SELECT ROUND(
        100.0 * SUM(CASE WHEN period_start_date IS NOT NULL THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0),
        2
      ) AS value
      FROM d1_facturacion
    `,
    pass: () => true
  },
  {
    key: 'facturacion_period_end_disponible_pct',
    label: 'Filas de facturación con PERIOD_END_DATE utilizable (%)',
    severity: 'INFO',
    query: `
      SELECT ROUND(
        100.0 * SUM(CASE WHEN period_end_date IS NOT NULL THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0),
        2
      ) AS value
      FROM d1_facturacion
    `,
    pass: () => true
  },
  {
    key: 'facturacion_periodos_invertidos',
    label: 'Filas de facturación con periodo de fin anterior al inicio',
    severity: 'ERROR',
    query: `
      SELECT COUNT(*) AS value
      FROM d1_facturacion
      WHERE period_start_date IS NOT NULL
        AND period_end_date IS NOT NULL
        AND DATE(period_end_date) < DATE(period_start_date)
    `,
    pass: (value) => Number(value) === 0
  },
  {
    key: 'facturacion_sentinel_periodo_persistido',
    label: 'Sentinel 2222 persistido como fecha real de fin de periodo',
    severity: 'ERROR',
    query: `
      SELECT COUNT(*) AS value
      FROM d1_facturacion
      WHERE period_end_date LIKE '2222-01-01%'
    `,
    pass: (value) => Number(value) === 0
  }
];

async function ensureValidationTable(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS d1_validation_results (
      check_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      numeric_value REAL,
      detail TEXT,
      checked_at TEXT NOT NULL
    )
  `);
}

async function runValidation(db, { persist = true } = {}) {
  await ensureValidationTable(db);

  if (persist) {
    await run(db, 'DELETE FROM d1_validation_results');
  }

  const results = [];
  for (const check of CHECKS) {
    const row = await get(db, check.query);
    const value = row?.value ?? 0;
    const passed = check.pass(value);
    const status = check.severity === 'INFO'
      ? 'INFO'
      : passed
        ? 'PASS'
        : check.severity;
    const result = {
      key: check.key,
      label: check.label,
      severity: check.severity,
      status,
      value: Number(value)
    };
    results.push(result);

    if (persist) {
      await run(
        db,
        `
          INSERT OR REPLACE INTO d1_validation_results (
            check_key, label, severity, status, numeric_value, detail, checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          result.key,
          result.label,
          result.severity,
          result.status,
          result.value,
          null,
          new Date().toISOString()
        ]
      );
    }
  }

  return results;
}

function printValidationResults(results) {
  console.log('\n🔎 Validación de relaciones y calidad');
  for (const result of results) {
    const icon = result.status === 'PASS'
      ? '✅'
      : result.status === 'ERROR'
        ? '❌'
        : result.status === 'WARN'
          ? '⚠️'
          : 'ℹ️';
    console.log(`${icon} ${result.label}: ${result.value}`);
  }
}

function hasBlockingErrors(results) {
  return results.some((result) => result.status === 'ERROR');
}

module.exports = {
  CHECKS,
  runValidation,
  printValidationResults,
  hasBlockingErrors
};

const DATASETS = [
  {
    key: 'planta_clientes',
    fileName: 'PLANTA CLIENTES.csv',
    delimiter: ';',
    tableName: 'd1_clientes',
    createTableSql: `
      CREATE TABLE d1_clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_key TEXT NOT NULL,
        financial_account TEXT NOT NULL,
        subscriber_key TEXT NOT NULL UNIQUE,
        phone_hash TEXT,
        activation_date TEXT,
        billing_cycle_day INTEGER,
        lob_type TEXT,
        business_type TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'COD_CLIENTE', target: 'customer_key', type: 'text' },
      { source: 'FINANCIAL_ACCOUNT', target: 'financial_account', type: 'text' },
      { source: 'NUM_ANEXO', target: 'subscriber_key', type: 'text' },
      { source: 'telefono_hash', target: 'phone_hash', type: 'text' },
      { source: 'fecha_activacion_original', target: 'activation_date', type: 'datetime' },
      { source: 'ciclo', target: 'billing_cycle_day', type: 'integer' },
      { source: 'lob_type', target: 'lob_type', type: 'text' },
      { source: 'negocio', target: 'business_type', type: 'text' }
    ]
  },
  {
    key: 'facturacion_clientes',
    fileName: 'FACTURACION-CLIENTES.csv',
    delimiter: ',',
    tableName: 'd1_facturacion',
    createTableSql: `
      CREATE TABLE d1_facturacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_account_key TEXT NOT NULL,
        customer_key TEXT NOT NULL,
        billing_arrangement_key TEXT NOT NULL,
        legal_invoice_number TEXT NOT NULL,
        billing_cycle_key INTEGER,
        charge_net_amount REAL,
        charge_total_amount REAL,
        charge_code_id TEXT,
        charge_code_desc TEXT,
        charge_code_classification TEXT,
        subscriber_key TEXT NOT NULL,
        period_start_date TEXT,
        period_end_date TEXT,
        billing_cycle_date TEXT NOT NULL,
        charge_group TEXT,
        charge_subgroup TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'FINANCIAL_ACCOUNT_KEY', target: 'financial_account_key', type: 'text' },
      { source: 'CUSTOMER_KEY', target: 'customer_key', type: 'text' },
      { source: 'BILLING_ARRANGEMENT_KEY', target: 'billing_arrangement_key', type: 'text' },
      { source: 'LEGAL_INVOICE_NUMBER', target: 'legal_invoice_number', type: 'text' },
      { source: 'BILLING_CYCLE_KEY', target: 'billing_cycle_key', type: 'integer' },
      { source: 'CHARGE_NET_AMOUNT', target: 'charge_net_amount', type: 'number' },
      { source: 'CHARGE_TOTAL_AMOUNT', target: 'charge_total_amount', type: 'number' },
      { source: 'CHARGE_CODE_ID', target: 'charge_code_id', type: 'text' },
      { source: 'CHARGE_CODE_DESC', target: 'charge_code_desc', type: 'text' },
      { source: 'CHARGE_CODE_CLASSIFICATION', target: 'charge_code_classification', type: 'text' },
      { source: 'SUBSCRIBER_KEY', target: 'subscriber_key', type: 'text' },
      { source: 'PERIOD_START_DATE', target: 'period_start_date', type: 'datetime' },
      { source: 'PERIOD_END_DATE', target: 'period_end_date', type: 'billingPeriodEnd' },
      { source: 'ciclo', target: 'billing_cycle_date', type: 'date' },
      { source: 'GRUPO', target: 'charge_group', type: 'text' },
      { source: 'SUB_GRUPO', target: 'charge_subgroup', type: 'text' }
    ],
    ignoredHeaders: [
      'PRIMARY_RESOURCE_VALUE',
      'SUBSCRIBER_KEY_1'
    ],
    consistencyChecks: [
      {
        left: 'SUBSCRIBER_KEY',
        right: 'SUBSCRIBER_KEY_1',
        required: true,
        label: 'SUBSCRIBER_KEY duplicado'
      }
    ]
  },
  {
    key: 'ordenes',
    fileName: 'Ordenes.csv',
    aliases: ['Ordenes(1).csv'],
    delimiter: ',',
    tableName: 'd1_ordenes',
    createTableSql: `
      CREATE TABLE d1_ordenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        completion_date TEXT,
        start_date TEXT,
        customer_key TEXT NOT NULL,
        subscriber_key TEXT NOT NULL,
        reason_desc TEXT,
        reason_id TEXT,
        item_type_desc TEXT,
        status_desc TEXT,
        last_updator TEXT,
        creator TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'ORDER_ACTION_COMPLETION_DATE', target: 'completion_date', type: 'datetime' },
      { source: 'ORDER_ACTION_START_DATE', target: 'start_date', type: 'datetime' },
      { source: 'CUSTOMER_KEY', target: 'customer_key', type: 'text' },
      { source: 'SUBSCRIBER_KEY', target: 'subscriber_key', type: 'text' },
      { source: 'ORDER_ACTION_REASON_DESC', target: 'reason_desc', type: 'text' },
      { source: 'ORDER_ACTION_REASON_ID', target: 'reason_id', type: 'text' },
      { source: 'ORDER_ITEM_TYPE_DESC', target: 'item_type_desc', type: 'text' },
      { source: 'ORDER_ACTION_STATUS_DESC', target: 'status_desc', type: 'text' },
      { source: 'ORDER_ACTION_LAST_UPDATOR', target: 'last_updator', type: 'text' },
      { source: 'ORDER_ACTION_CREATOR', target: 'creator', type: 'text' }
    ]
  },
  {
    key: 'catalogo_ofertas',
    fileName: 'CATALOGO-OFERTAS.csv',
    delimiter: ';',
    tableName: 'd1_catalogo_ofertas',
    createTableSql: `
      CREATE TABLE d1_catalogo_ofertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_code TEXT NOT NULL,
        rate_final REAL,
        rent_type TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'CHARGE CODE', target: 'charge_code', type: 'text' },
      { source: 'rate_final', target: 'rate_final', type: 'number' },
      { source: 'TIPO DE RENTA', target: 'rent_type', type: 'rentType' }
    ]
  },
  {
    key: 'brainy_descuentos_cuotas',
    fileName: 'BRAINY_DESCUENTOS_CUOTAS.csv',
    delimiter: ',',
    tableName: 'd1_descuentos_cuotas',
    createTableSql: `
      CREATE TABLE d1_descuentos_cuotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_type TEXT,
        invoice_flag TEXT,
        rent_type TEXT,
        billing_arrangement TEXT NOT NULL,
        billing_cycle_date TEXT,
        phone TEXT,
        start_date TEXT,
        promotion_duration INTEGER,
        promotion_percentage REAL,
        charge_code TEXT,
        end_date TEXT,
        overdue_days INTEGER,
        prepaid_days INTEGER,
        cycle_start_flag INTEGER,
        current_installment INTEGER,
        translation TEXT,
        description TEXT,
        full_discount_flag INTEGER,
        discount_type TEXT,
        financial_account TEXT NOT NULL,
        discount_amount REAL,
        number_type TEXT,
        document_type TEXT,
        document_number TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'TipoProceso', target: 'process_type', type: 'text' },
      { source: 'FlagFactura', target: 'invoice_flag', type: 'text' },
      { source: 'TipoRenta', target: 'rent_type', type: 'rentType' },
      { source: 'BillingArrangement', target: 'billing_arrangement', type: 'text' },
      { source: 'Ciclo', target: 'billing_cycle_date', type: 'date' },
      { source: 'Telefono', target: 'phone', type: 'text' },
      { source: 'FechaInicio', target: 'start_date', type: 'datetime' },
      { source: 'PromotionDuration', target: 'promotion_duration', type: 'integer' },
      { source: 'PorcentajePromo', target: 'promotion_percentage', type: 'number' },
      { source: 'chargecode', target: 'charge_code', type: 'text' },
      { source: 'FechaFin', target: 'end_date', type: 'datetime' },
      { source: 'DiasVencidos', target: 'overdue_days', type: 'integer' },
      { source: 'DiasAdelantados', target: 'prepaid_days', type: 'integer' },
      { source: 'flag_inicio_ciclica', target: 'cycle_start_flag', type: 'integer' },
      { source: 'CuotaActual', target: 'current_installment', type: 'integer' },
      { source: 'Traduccion', target: 'translation', type: 'text' },
      { source: 'Descripcion', target: 'description', type: 'text' },
      { source: 'flag_descuento_completo', target: 'full_discount_flag', type: 'integer' },
      { source: 'tipo_descuento', target: 'discount_type', type: 'text' },
      { source: 'cuentafinanciera', target: 'financial_account', type: 'text' },
      { source: 'Monto_Descuento', target: 'discount_amount', type: 'number' },
      { source: 'tiponumero', target: 'number_type', type: 'text' },
      { source: 'tipodoc', target: 'document_type', type: 'text' },
      { source: 'numerodocumento', target: 'document_number', type: 'text' }
    ]
  },
  {
    key: 'brainy_prorrateo',
    fileName: 'BRAINY_PRORRATEO_ALTASV3.csv',
    delimiter: ';',
    tableName: 'd1_prorrateos',
    createTableSql: `
      CREATE TABLE d1_prorrateos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_arrangement TEXT NOT NULL,
        financial_account TEXT NOT NULL,
        number_value TEXT,
        invoice_number TEXT NOT NULL,
        billing_cycle_date TEXT,
        period_start_date TEXT,
        period_end_date TEXT,
        prorated_amount REAL,
        charge_count INTEGER,
        number_type TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'BA', target: 'billing_arrangement', type: 'text' },
      { source: 'CuentaFinanciera', target: 'financial_account', type: 'text' },
      { source: 'Numero', target: 'number_value', type: 'text' },
      { source: 'NumeroRecibo', target: 'invoice_number', type: 'text' },
      { source: 'Ciclica', target: 'billing_cycle_date', type: 'date' },
      { source: 'fecha_inicio_minima', target: 'period_start_date', type: 'datetime' },
      { source: 'fecha_fin_maxima', target: 'period_end_date', type: 'datetime' },
      { source: 'suma_prorrateo', target: 'prorated_amount', type: 'number' },
      { source: 'Q_cargos', target: 'charge_count', type: 'integer' },
      { source: 'tiponumero', target: 'number_type', type: 'text' }
    ]
  },
  {
    key: 'brainy_reconexiones',
    fileName: 'BRAINY_RECONEXIONESV3.csv',
    delimiter: ';',
    tableName: 'd1_reconexiones',
    createTableSql: `
      CREATE TABLE d1_reconexiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_arrangement TEXT NOT NULL,
        financial_account TEXT NOT NULL,
        number_value TEXT,
        code TEXT,
        invoice_number TEXT NOT NULL,
        description TEXT,
        reconnection_date TEXT,
        amount REAL,
        billing_cycle_date TEXT,
        cut_date TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'BA', target: 'billing_arrangement', type: 'text' },
      { source: 'CuentaFinanciera', target: 'financial_account', type: 'text' },
      { source: 'Numero', target: 'number_value', type: 'text' },
      { source: 'Codigo', target: 'code', type: 'text' },
      { source: 'NumeroRecibo', target: 'invoice_number', type: 'text' },
      { source: 'Descripcion', target: 'description', type: 'text' },
      { source: 'FechaReconexion', target: 'reconnection_date', type: 'datetime' },
      { source: 'Monto', target: 'amount', type: 'number' },
      { source: 'Ciclica', target: 'billing_cycle_date', type: 'date' },
      { source: 'FechaCorte', target: 'cut_date', type: 'datetime' }
    ]
  },
  {
    key: 'notas_credito',
    fileName: 'NOTAS_CREDITO.csv',
    delimiter: ',',
    tableName: 'd1_notas_credito',
    createTableSql: `
      CREATE TABLE d1_notas_credito (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receiver_customer TEXT NOT NULL,
        billing_arrangement TEXT NOT NULL,
        service_receiver_id TEXT NOT NULL,
        charge_code TEXT,
        cancel_charge_type TEXT,
        effective_date TEXT,
        amount REAL,
        period_start_date TEXT,
        period_end_date TEXT,
        billing_cycle_date TEXT,
        source_row INTEGER NOT NULL
      )
    `,
    columns: [
      { source: 'RECEIVER_CUSTOMER', target: 'receiver_customer', type: 'text' },
      { source: 'BA_NO', target: 'billing_arrangement', type: 'text' },
      { source: 'SERVICE_RECEIVER_ID', target: 'service_receiver_id', type: 'text' },
      { source: 'CHARGE_CODE', target: 'charge_code', type: 'text' },
      { source: 'CANCEL_CHARGE_TYPE', target: 'cancel_charge_type', type: 'text' },
      { source: 'EFFECTIVE_DATE', target: 'effective_date', type: 'datetime' },
      { source: 'AMOUNT', target: 'amount', type: 'number' },
      { source: 'PERIOD_START_DATE', target: 'period_start_date', type: 'datetime' },
      { source: 'PERIOD_END_DATE', target: 'period_end_date', type: 'datetime' },
      { source: 'CICLO', target: 'billing_cycle_date', type: 'date' }
    ]
  }
];

const INDEX_STATEMENTS = [
  'CREATE INDEX idx_d1_clientes_customer ON d1_clientes(customer_key)',
  'CREATE INDEX idx_d1_clientes_financial_account ON d1_clientes(financial_account)',
  'CREATE INDEX idx_d1_clientes_business ON d1_clientes(business_type)',

  'CREATE INDEX idx_d1_facturacion_subscriber_cycle ON d1_facturacion(subscriber_key, billing_cycle_date)',
  'CREATE INDEX idx_d1_facturacion_invoice ON d1_facturacion(legal_invoice_number)',
  'CREATE INDEX idx_d1_facturacion_ba_cycle ON d1_facturacion(billing_arrangement_key, billing_cycle_date)',
  'CREATE INDEX idx_d1_facturacion_customer ON d1_facturacion(customer_key)',
  'CREATE INDEX idx_d1_facturacion_financial_account ON d1_facturacion(financial_account_key)',
  'CREATE INDEX idx_d1_facturacion_charge_code ON d1_facturacion(charge_code_id)',
  'CREATE INDEX idx_d1_facturacion_group ON d1_facturacion(charge_group)',

  'CREATE INDEX idx_d1_ordenes_subscriber_date ON d1_ordenes(subscriber_key, completion_date)',
  'CREATE INDEX idx_d1_ordenes_customer ON d1_ordenes(customer_key)',
  'CREATE INDEX idx_d1_ordenes_reason ON d1_ordenes(reason_id)',

  'CREATE INDEX idx_d1_catalogo_charge_code ON d1_catalogo_ofertas(charge_code)',
  'CREATE INDEX idx_d1_catalogo_rent_type ON d1_catalogo_ofertas(rent_type)',

  'CREATE INDEX idx_d1_descuentos_ba_cycle ON d1_descuentos_cuotas(billing_arrangement, billing_cycle_date)',
  'CREATE INDEX idx_d1_descuentos_financial_account ON d1_descuentos_cuotas(financial_account)',
  'CREATE INDEX idx_d1_descuentos_rent_type ON d1_descuentos_cuotas(rent_type)',

  'CREATE INDEX idx_d1_prorrateos_invoice ON d1_prorrateos(invoice_number)',
  'CREATE INDEX idx_d1_prorrateos_ba ON d1_prorrateos(billing_arrangement)',
  'CREATE INDEX idx_d1_prorrateos_financial_account ON d1_prorrateos(financial_account)',

  'CREATE INDEX idx_d1_reconexiones_invoice ON d1_reconexiones(invoice_number)',
  'CREATE INDEX idx_d1_reconexiones_ba ON d1_reconexiones(billing_arrangement)',
  'CREATE INDEX idx_d1_reconexiones_financial_account ON d1_reconexiones(financial_account)',
  'CREATE INDEX idx_d1_reconexiones_code ON d1_reconexiones(code)',

  'CREATE INDEX idx_d1_notas_subscriber ON d1_notas_credito(service_receiver_id)',
  'CREATE INDEX idx_d1_notas_ba ON d1_notas_credito(billing_arrangement)',
  'CREATE INDEX idx_d1_notas_customer ON d1_notas_credito(receiver_customer)',
  'CREATE INDEX idx_d1_notas_charge_code ON d1_notas_credito(charge_code)'
];

module.exports = {
  DATASETS,
  INDEX_STATEMENTS
};

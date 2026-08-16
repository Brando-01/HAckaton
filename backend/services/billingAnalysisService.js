const fs = require('fs');
const path = require('path');
const { readRowsFromFile } = require('./dataContextService');

const DATA_DIR = path.resolve(__dirname, '../data');
const SOURCE = (name) => path.join(DATA_DIR, name);
const rowCache = new Map();

function value(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  return '';
}

function amount(raw) {
  const number = Number(String(raw || '').replace(/,/g, '.'));
  return Number.isFinite(number) ? number : 0;
}

function dateKey(row) {
  return value(row, 'ciclo', 'Ciclica', 'FECHA-VENCIMIENTO ', 'FECHA_VENCIMIENTO');
}

function load(name) {
  if (rowCache.has(name)) return rowCache.get(name);
  const file = SOURCE(name);
  const rows = fs.existsSync(file) ? readRowsFromFile(file) : [];
  rowCache.set(name, rows);
  return rows;
}

function getServices(customerId) {
  const id = String(customerId || '').trim();
  const rows = load('PLANTA CLIENTES.csv');
  let services = rows
    .filter((row) => value(row, 'COD_CLIENTE') === id)
    .map((row) => ({
      customerId: id,
      financialAccount: value(row, 'FINANCIAL_ACCOUNT'),
      subscriberId: value(row, 'NUM_ANEXO'),
      cycle: value(row, 'ciclo'),
      serviceType: value(row, 'lob_type'),
      business: value(row, 'negocio')
    }))
    .filter((service) => service.subscriberId);

  // Algunos clientes del extracto de facturación no aparecen en PLANTA.
  // Para ellos se reconstruye la relación únicamente con filas de su mismo
  // CUSTOMER_KEY; así siguen siendo consultables sin cruzar datos ajenos.
  if (!services.length) {
    services = load('FACTURACION-CLIENTES.csv')
      .filter((row) => value(row, 'CUSTOMER_KEY') === id)
      .map((row) => ({
        customerId: id,
        financialAccount: value(row, 'FINANCIAL_ACCOUNT_KEY'),
        subscriberId: value(row, 'SUBSCRIBER_KEY'),
        cycle: value(row, 'BILLING_CYCLE_KEY'),
        serviceType: 'Servicio',
        business: ''
      }))
      .filter((service) => service.subscriberId);
  }

  return services.filter((service, index) =>
    services.findIndex((item) => item.subscriberId === service.subscriberId && item.financialAccount === service.financialAccount) === index
  );
}

function getInvoicesForSubscriber(customerId, subscriberId) {
  const customer = String(customerId || '').trim();
  const subscriber = String(subscriberId || '').trim();
  const rows = load('FACTURACION-CLIENTES.csv')
    .filter((row) => value(row, 'CUSTOMER_KEY') === customer && value(row, 'SUBSCRIBER_KEY') === subscriber);

  const groups = new Map();
  rows.forEach((row) => {
    const invoiceId = value(row, 'LEGAL_INVOICE_NUMBER');
    if (!invoiceId) return;
    if (!groups.has(invoiceId)) groups.set(invoiceId, []);
    groups.get(invoiceId).push(row);
  });

  return [...groups.entries()]
    .map(([invoiceId, invoiceRows]) => {
      // FACTURACION-CLIENTES es la fuente canónica para importes. La tabla
      // Cargos_FacturadosV2 se consulta solo como cabecera complementaria:
      // vencimiento y estado, nunca para volver a sumar los cargos.
      const metadataRows = load('Cargos_FacturadosV2.csv').filter((row) =>
        value(row, 'CUSTOMER_KEY') === customer
        && value(row, 'SUBSCRIBER_KEY') === subscriber
        && value(row, 'LEGAL_INVOICE_NUMBER') === invoiceId
        && (!value(row, 'FINANCIAL_ACCOUNT_KEY')
          || value(row, 'FINANCIAL_ACCOUNT_KEY') === value(invoiceRows[0], 'FINANCIAL_ACCOUNT_KEY'))
      );
      const dueDates = [...new Set(metadataRows
        .map((row) => value(row, 'FECHA-VENCIMIENTO', 'FECHA_VENCIMIENTO'))
        .filter(Boolean))];
      const statuses = [...new Set(metadataRows.map((row) => value(row, 'DEUDA')).filter(Boolean))];
      const dataWarnings = [];
      if (dueDates.length > 1) dataWarnings.push('La fuente contiene más de una fecha de vencimiento para esta factura.');
      if (statuses.length > 1) dataWarnings.push('La fuente contiene estados de deuda contradictorios para esta factura.');
      const charges = invoiceRows.map((row) => ({
        code: value(row, 'CHARGE_CODE_ID'),
        description: value(row, 'CHARGE_CODE_DESC'),
        amount: amount(value(row, 'CHARGE_TOTAL_AMOUNT')),
        netAmount: amount(value(row, 'CHARGE_NET_AMOUNT')),
        classification: value(row, 'CHARGE_CODE_CLASSIFICATION'),
        group: value(row, 'GRUPO'),
        subgroup: value(row, 'SUB_GRUPO')
      }));
      return {
        invoiceId,
        cycle: value(invoiceRows[0], 'ciclo'),
        dueDate: dueDates.length === 1 ? dueDates[0] : '',
        status: statuses.length === 1 ? statuses[0] : '',
        financialAccount: value(invoiceRows[0], 'FINANCIAL_ACCOUNT_KEY'),
        subscriberId: subscriber,
        charges,
        total: charges.reduce((sum, charge) => sum + charge.amount, 0),
        dataWarnings
      };
    })
    .sort((a, b) => String(b.cycle).localeCompare(String(a.cycle)));
}

function relatedEvents(subscriberId, financialAccount, invoiceId) {
  const matches = (name, predicate) => load(name).filter(predicate);
  const unique = (rows) => rows.filter((row, index) =>
    rows.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(row)) === index
  );
  return {
    reconnections: unique(matches('BRAINY_RECONEXIONESV3.csv', (row) =>
      value(row, 'NumeroRecibo') === invoiceId)),
    prorrations: unique(matches('BRAINY_PRORRATEO_ALTASV3.csv', (row) =>
      value(row, 'NumeroRecibo') === invoiceId)),
    discounts: matches('BRAINY_DESCUENTOS_CUOTAS.csv', (row) =>
      value(row, 'cuentafinanciera') === financialAccount),
    orders: matches('Ordenes.csv', (row) => value(row, 'SUBSCRIBER_KEY') === subscriberId)
  };
}

function summarizeVariation(current, previous, events) {
  if (!previous) return { available: false, difference: null, causes: [] };
  const rawDifference = Number((current.total - previous.total).toFixed(2));
  const difference = Object.is(rawDifference, -0) ? 0 : rawDifference;
  const groupByCode = (charges) => charges.reduce((map, charge) => {
    const existing = map.get(charge.code);
    map.set(charge.code, existing
      ? { ...existing, amount: existing.amount + charge.amount }
      : { ...charge });
    return map;
  }, new Map());
  const previousByCode = groupByCode(previous.charges);
  const currentByCode = groupByCode(current.charges);
  const causes = [];

  new Set([...currentByCode.keys(), ...previousByCode.keys()]).forEach((code) => {
    const charge = currentByCode.get(code) || previousByCode.get(code);
    const old = previousByCode.get(code);
    const now = currentByCode.get(code);
    const delta = Number(((now ? now.amount : 0) - (old ? old.amount : 0)).toFixed(2));
    if (Math.abs(delta) < 0.01) return;
    const lower = `${charge.description} ${charge.group} ${charge.subgroup}`.toLowerCase();
    let type = 'CHARGE_CHANGE';
    if (lower.includes('reconex')) type = 'RECONNECTION';
    else if (lower.includes('propor') || events.prorrations.length) type = 'PRORRATION';
    else if (lower.includes('descuento') || lower.includes('bono') || charge.amount < 0) type = now ? 'DISCOUNT' : 'DISCOUNT_ENDED';
    const category = lower.includes('reconex')
      ? 'RECONNECTION'
      : lower.includes('plan')
        ? 'PLAN'
        : lower.includes('bono') || lower.includes('descuento') || lower.includes('promo') || lower.includes('paquete')
          ? 'BONUS_PACKAGE'
          : lower.includes('propor')
            ? 'PRORRATION'
            : 'OTHER';
    causes.push({ type, category, code: charge.code, description: charge.description, delta, evidence: old && now ? 'Cambio respecto a la factura anterior.' : now ? 'Cargo nuevo en la factura actual.' : 'Cargo que estaba en la factura anterior y ya no aparece.' });
  });

  return { available: true, difference, causes };
}

function getBillingAnalysis(customerId, requestedSubscriberId = null, requestedInvoiceId = null, invoiceOffset = 0) {
  const services = getServices(customerId);
  if (!services.length) return { found: false, customerId, services: [] };
  const subscriberId = requestedSubscriberId || (services.length === 1 ? services[0].subscriberId : null);
  if (!subscriberId) return { found: true, customerId, services, requiresSubscriberSelection: true };
  const service = services.find((item) => item.subscriberId === String(subscriberId));
  if (!service) return { found: true, customerId, services, invalidSubscriber: true };
  const invoices = getInvoicesForSubscriber(customerId, subscriberId);
  if (!invoices.length) return { found: true, customerId, services, service, invoices: [] };
  const invoiceIndex = requestedInvoiceId
    ? invoices.findIndex((invoice) => invoice.invoiceId === String(requestedInvoiceId).toUpperCase())
    : Math.max(0, Number.parseInt(invoiceOffset, 10) || 0);
  if (invoiceIndex < 0) return { found: true, customerId, services, service, invoices, invalidInvoice: true };
  const current = invoices[invoiceIndex];
  const previous = invoices[invoiceIndex + 1] || null;
  const events = relatedEvents(current.subscriberId, current.financialAccount, current.invoiceId);
  return {
    found: true,
    customerId,
    services,
    service,
    invoices,
    current,
    previous,
    events,
    variation: summarizeVariation(current, previous, events)
  };
}

module.exports = { getBillingAnalysis, getServices, getInvoicesForSubscriber };

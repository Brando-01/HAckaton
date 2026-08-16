const test = require('node:test');
const assert = require('node:assert/strict');
const { getBillingAnalysis } = require('../services/billingAnalysisService');

test('analiza una factura por subscriber sin sumar recibos históricos ni archivos duplicados', () => {
  const analysis = getBillingAnalysis('115358834');

  assert.equal(analysis.found, true);
  assert.equal(analysis.service.subscriberId, '154808356');
  assert.equal(analysis.current.invoiceId, 'S5AA-0081881237');
  assert.equal(analysis.current.total, 83.99);
  assert.equal(analysis.previous.invoiceId, 'S5AA-0081157690');
  assert.equal(analysis.variation.difference, 0);
  assert.equal(analysis.current.charges.length, 4);
});

test('rechaza un subscriber que no pertenece al cliente autenticado', () => {
  const analysis = getBillingAnalysis('115358834', 'NO_EXISTE');
  assert.equal(analysis.invalidSubscriber, true);
});

test('las causas de una variación reconcilian exactamente contra la diferencia entre facturas', () => {
  const analysis = getBillingAnalysis('101867276');
  const causesTotal = analysis.variation.causes.reduce((sum, cause) => sum + cause.delta, 0);

  assert.equal(Number(causesTotal.toFixed(2)), analysis.variation.difference);
});

test('encuentra un cargo de reconexión solo cuando coincide con la factura consultada', () => {
  const analysis = getBillingAnalysis('101867276', null, 'S8AA-0007113580');
  assert.equal(analysis.current.invoiceId, 'S8AA-0007113580');
  assert.ok(analysis.events.reconnections.length > 0);
});

test('encuentra un prorrateo solo cuando coincide con la factura consultada', () => {
  const analysis = getBillingAnalysis('135549877', null, 'S8AA-0007119413');
  assert.equal(analysis.current.invoiceId, 'S8AA-0007119413');
  assert.ok(analysis.events.prorrations.length > 0);
});

test('complementa vencimiento y estado sin duplicar los importes de facturación', () => {
  const analysis = getBillingAnalysis('100548096');

  assert.equal(analysis.current.invoiceId, 'S9AA-0083323046');
  assert.equal(analysis.current.total, 84.47999999999999);
  assert.equal(analysis.current.dueDate, '20260717');
  assert.equal(analysis.current.status, 'CON DEUDA');
  assert.equal(analysis.events.reconnections.length, 1);
});

test('no elige arbitrariamente un estado cuando la fuente es contradictoria', () => {
  const analysis = getBillingAnalysis('58670913', '154507958', 'S5AA-0081727689');

  assert.equal(analysis.current.status, '');
  assert.match(analysis.current.dataWarnings[0], /estados de deuda contradictorios/);
});

test('recupera de forma segura clientes facturados que faltan en PLANTA', () => {
  const analysis = getBillingAnalysis('42826546');

  assert.equal(analysis.found, true);
  assert.equal(analysis.current.subscriberId, analysis.service.subscriberId);
  assert.ok(analysis.invoices.length > 0);
});

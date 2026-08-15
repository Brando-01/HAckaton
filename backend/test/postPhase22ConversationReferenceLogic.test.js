const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractExplicitInvoiceReference,
  extractExplicitBillingPeriodReference,
  extractExplicitCustomerReference,
  evaluateCustomerReference,
  buildCustomerReferenceReply,
  buildInvoiceReferenceReply,
  resolveBillingPeriodReference,
  buildBillingPeriodReferenceReply,
  buildSafeInvoiceReferenceMetadata,
  buildSafeBillingPeriodReferenceMetadata
} = require(
  '../services/desafio1ConversationReferenceLogic'
);

test(
  'extrae referencias de factura con el formato observado en FACTURACION',
  () => {
    assert.equal(
      extractExplicitInvoiceReference(
        'Explícame la factura s7aa-0066221831'
      ),
      'S7AA-0066221831'
    );
  }
);

test(
  'extrae alias demo y IDs numéricos solo cuando se presentan como identidad',
  () => {
    assert.equal(
      extractExplicitCustomerReference(
        'abre CLI000002'
      ),
      'CLI000002'
    );
    assert.equal(
      extractExplicitCustomerReference(
        'cliente 155358834, dime su recibo'
      ),
      '155358834'
    );
    assert.equal(
      extractExplicitCustomerReference(
        'mi recibo fue S/ 155.35'
      ),
      null
    );
  }
);

test(
  'un ID escrito en chat no puede cambiar la identidad autenticada',
  () => {
    const decision =
      evaluateCustomerReference({
        reference: 'CLI000002',
        authenticatedCustomerId:
          'CLI000001'
      });

    assert.equal(
      decision.allowed,
      false
    );
    assert.equal(
      decision.reasonCode,
      'CUSTOMER_REFERENCE_CANNOT_SWITCH_IDENTITY'
    );
    assert.match(
      buildCustomerReferenceReply(
        decision
      ),
      /no puede cambiar la cuenta/i
    );
  }
);

test(
  'un ID sin login tampoco se convierte en autorización',
  () => {
    const decision =
      evaluateCustomerReference({
        reference: '155358834'
      });

    assert.equal(
      decision.allowed,
      false
    );
    assert.match(
      buildCustomerReferenceReply(
        decision
      ),
      /inicia sesión/i
    );
  }
);

test(
  'factura inexistente se rechaza sin sustituirla por el recibo actual',
  () => {
    const result =
      buildInvoiceReferenceReply({
        validation: {
          status: 'NOT_FOUND',
          reference:
            'S7AA-9999999999'
        },
        message:
          'Explícame S7AA-9999999999'
      });

    assert.equal(
      result.handled,
      true
    );
    assert.equal(
      result.resolutionStatus,
      'UNRESOLVED'
    );
    assert.match(
      result.reply,
      /no encuentro el recibo/i
    );
  }
);

test(
  'factura histórica confirma total pero no inventa causalidad',
  () => {
    const result =
      buildInvoiceReferenceReply({
        validation: {
          status: 'MATCHED',
          reference:
            'S7AA-0066221831',
          position: 'PREVIOUS',
          period:
            'Ciclo 15/06/2026',
          total: 62.89
        },
        message:
          'Explícame S7AA-0066221831'
      });

    assert.equal(
      result.handled,
      true
    );
    assert.equal(
      result.resolutionStatus,
      'PARTIALLY_RESOLVED'
    );
    assert.match(
      result.reply,
      /S\/ 62\.89/
    );
    assert.match(
      result.reply,
      /no voy a inventar una causa histórica/i
    );
  }
);

test(
  'metadata pública de factura no expone el código ni identificadores privados',
  () => {
    const metadata =
      buildSafeInvoiceReferenceMetadata({
        status: 'MATCHED',
        reference:
          'S7AA-0066221831',
        position: 'CURRENT',
        subscriberKey:
          'PRIVATE',
        customerKey:
          'PRIVATE2'
      });

    assert.deepEqual(
      metadata,
      {
        provided: true,
        matched: true,
        scope:
          'AUTHENTICATED_ACCOUNT_HISTORY',
        position: 'CURRENT'
      }
    );
  }
);


test(
  'extrae mes y año explícitos sin convertir marzo en recibo anterior',
  () => {
    assert.deepEqual(
      extractExplicitBillingPeriodReference(
        'Dime cuál fue mi recibo de marzo 2026'
      ),
      {
        month: 3,
        monthLabel: 'marzo',
        year: 2026,
        precision: 'MONTH_YEAR'
      }
    );

    assert.deepEqual(
      extractExplicitBillingPeriodReference(
        '¿Cuál fue mi factura en marzo?'
      ),
      {
        month: 3,
        monthLabel: 'marzo',
        year: null,
        precision: 'MONTH_ONLY'
      }
    );
  }
);

test(
  'resuelve un mes contra el historial autenticado y devuelve el monto de ese ciclo',
  () => {
    const validation =
      resolveBillingPeriodReference({
        experience: {
          billingHistory: {
            bills: [
              {
                cycleDate: '2026-07-15',
                period: 'Ciclo 15/07/2026',
                total: 67.47
              },
              {
                cycleDate: '2026-06-15',
                period: 'Ciclo 15/06/2026',
                total: 62.89
              },
              {
                cycleDate: '2026-03-15',
                period: 'Ciclo 15/03/2026',
                total: 58.2
              }
            ]
          }
        },
        reference: {
          month: 3,
          monthLabel: 'marzo',
          year: 2026,
          precision: 'MONTH_YEAR'
        }
      });

    assert.equal(
      validation.status,
      'MATCHED'
    );
    assert.equal(
      validation.position,
      'HISTORY'
    );
    assert.equal(
      validation.total,
      58.2
    );

    const reply =
      buildBillingPeriodReferenceReply({
        validation,
        message:
          '¿Cuál fue mi recibo de marzo 2026?'
      });

    assert.equal(reply.handled, true);
    assert.match(reply.reply, /marzo de 2026/i);
    assert.match(reply.reply, /S\/ 58\.20/);
  }
);

test(
  'si el mes no existe no sustituye la solicitud por el recibo anterior',
  () => {
    const validation =
      resolveBillingPeriodReference({
        experience: {
          billingHistory: {
            bills: [
              {
                cycleDate: '2026-07-15',
                period: 'Ciclo 15/07/2026',
                total: 67.47
              },
              {
                cycleDate: '2026-06-15',
                period: 'Ciclo 15/06/2026',
                total: 62.89
              }
            ]
          }
        },
        reference: {
          month: 3,
          monthLabel: 'marzo',
          year: 2026,
          precision: 'MONTH_YEAR'
        }
      });

    const reply =
      buildBillingPeriodReferenceReply({
        validation,
        message:
          'Dime cuál fue mi recibo de marzo 2026'
      });

    assert.equal(
      validation.status,
      'NOT_FOUND'
    );
    assert.equal(
      reply.resolutionStatus,
      'UNRESOLVED'
    );
    assert.match(
      reply.reply,
      /No encuentro un recibo de marzo de 2026/i
    );
    assert.match(
      reply.reply,
      /No voy a sustituirlo por otro mes/i
    );
    assert.doesNotMatch(
      reply.reply,
      /62\.89/
    );
  }
);

test(
  'un mes sin año pide precisión si existen dos ciclos del mismo mes',
  () => {
    const validation =
      resolveBillingPeriodReference({
        experience: {
          billingHistory: {
            bills: [
              {
                cycleDate: '2026-03-15',
                period: 'Ciclo 15/03/2026',
                total: 60
              },
              {
                cycleDate: '2025-03-15',
                period: 'Ciclo 15/03/2025',
                total: 55
              }
            ]
          }
        },
        reference: {
          month: 3,
          monthLabel: 'marzo',
          year: null,
          precision: 'MONTH_ONLY'
        }
      });

    const reply =
      buildBillingPeriodReferenceReply({
        validation,
        message:
          '¿Cuál fue mi recibo en marzo?'
      });

    assert.equal(
      validation.status,
      'AMBIGUOUS'
    );
    assert.match(
      reply.reply,
      /Indícame el año/i
    );
  }
);

test(
  'metadata temporal pública conserva solo mes año y posición segura',
  () => {
    assert.deepEqual(
      buildSafeBillingPeriodReferenceMetadata({
        status: 'MATCHED',
        reference: {
          month: 3,
          monthLabel: 'marzo',
          year: 2026,
          precision: 'MONTH_YEAR'
        },
        position: 'HISTORY',
        subscriberKey: 'PRIVATE'
      }),
      {
        provided: true,
        matched: true,
        scope:
          'AUTHENTICATED_ACCOUNT_HISTORY',
        precision: 'MONTH_YEAR',
        month: 3,
        year: 2026,
        position: 'HISTORY'
      }
    );
  }
);

test(
  'el COD_CLIENTE real de la cuenta autenticada también se acepta como referencia propia',
  () => {
    const decision =
      evaluateCustomerReference({
        reference: '115358834',
        authenticatedCustomerId:
          'D1A-OPAQUE',
        authenticatedCustomerReferences: [
          '115358834'
        ]
      });

    assert.equal(
      decision.allowed,
      true
    );
    assert.equal(
      decision.reasonCode,
      'MATCHES_AUTHENTICATED_ACCOUNT'
    );
  }
);

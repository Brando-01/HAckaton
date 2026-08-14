const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeInternalTerms,
  buildCustomerCauseDescription,
  buildCustomerFindingDescription,
  getImpactPresentation,
  buildVerification,
  buildCustomerFacing
} = require(
  '../services/desafio1CustomerPresentation'
);

test(
  'oculta nombres internos Brainy en texto dirigido al cliente',
  () => {
    const text =
      sanitizeInternalTerms(
        'Brainy Reconexiones y Brainy Prorrateo respaldan el dato.'
      );

    assert.doesNotMatch(
      text,
      /Brainy/i
    );
    assert.match(
      text,
      /registros de reconexión/i
    );
  }
);

test(
  'reconexión usa lenguaje de cliente y aclara que el cargo ya está incluido',
  () => {
    const text =
      buildCustomerCauseDescription({
        code: 'RECONNECTION',
        impactAmount: 4.58,
        evidenceLevel: 'HIGH',
        evidence: {
          brainyReconnections: [
            {
              reconnectionDate:
                '2026-06-17 00:00:00'
            }
          ]
        }
      });

    assert.match(text, /S\/ 4\.58/);
    assert.match(text, /17\/06\/2026/);
    assert.match(text, /incluido en el total/i);
    assert.doesNotMatch(text, /Brainy/i);
  }
);

test(
  'prorrateo explica el periodo parcial y no sugiere sumarlo otra vez',
  () => {
    const text =
      buildCustomerFindingDescription({
        code: 'PRORATION',
        amount: 21.92,
        periodStartDate: '2026-06-09',
        periodEndDate: '2026-06-30',
        evidenceLevel: 'HIGH'
      });

    assert.match(text, /periodo parcial/i);
    assert.match(text, /09\/06\/2026/);
    assert.match(text, /30\/06\/2026/);
    assert.match(text, /ya está incluido/i);
  }
);

test(
  'fin de descuento presenta fecha de término sin exponer la fuente interna',
  () => {
    const text =
      buildCustomerCauseDescription({
        code: 'DISCOUNT_ENDED',
        impactAmount: 16.58,
        chargeChange: {
          description:
            'Descuento 20% por 3 meses'
        },
        evidence: {
          previousDiscount: {
            endDate: '2026-07-05'
          }
        }
      });

    assert.match(text, /terminó el descuento/i);
    assert.match(text, /05\/07\/2026/);
    assert.doesNotMatch(text, /Brainy/i);
  }
);

test(
  'cambio de plan mantiene el impacto financiero en lenguaje sencillo',
  () => {
    const text =
      buildCustomerCauseDescription({
        code: 'PLAN_CHANGE',
        impactAmount: -14
      });

    assert.match(text, /redujo tu recibo/i);
    assert.match(text, /S\/ 14\.00/);
  }
);

test(
  'descuento vigente se presenta como aplicado al recibo',
  () => {
    const text =
      buildCustomerFindingDescription({
        code: 'ACTIVE_DISCOUNT',
        discountAmount: 19.77,
        description:
          'Descuento de fidelización'
      });

    assert.match(text, /descuento de S\/ 19\.77/i);
    assert.match(text, /aplicado en este recibo/i);
  }
);

test(
  'semántica visual diferencia variación de monto incluido y descuento aplicado',
  () => {
    assert.equal(
      getImpactPresentation({
        code: 'RECONNECTION'
      }),
      'VARIATION'
    );
    assert.equal(
      getImpactPresentation({
        code: 'PRORATION'
      }),
      'INCLUDED_IN_TOTAL'
    );
    assert.equal(
      getImpactPresentation({
        code: 'ACTIVE_DISCOUNT'
      }),
      'APPLIED_TO_TOTAL'
    );
  }
);

test(
  'resumen de verificación usa fuentes legibles y no nombres internos',
  () => {
    const verification =
      buildVerification({
        code: 'RECONNECTION',
        evidenceLevel: 'HIGH'
      });

    assert.equal(
      verification.label,
      'Evidencia alta'
    );
    assert.deepEqual(
      verification.sources,
      [
        'Facturación',
        'Registro de reconexión',
        'Órdenes del servicio'
      ]
    );
    assert.doesNotMatch(
      JSON.stringify(verification),
      /Brainy/i
    );
  }
);

test(
  'customerFacing elimina la nota técnica del ciclo y usa la descripción amigable',
  () => {
    const causes = [
      {
        code: 'RECONNECTION',
        description:
          'Se agregó S/ 4.58 por la reconexión de tu servicio.'
      }
    ];

    const result =
      buildCustomerFacing({
        explanation: {
          interpretation: {
            status: 'FULLY_EXPLAINED'
          },
          customerFacing: {
            headline:
              'Tu recibo aumentó S/ 4.58',
            summary:
              'Brainy Reconexiones confirma el monto.',
            limitations: [
              'El campo de ciclo se usa para ordenar y comparar recibos; no se interpreta automáticamente como fecha de emisión.'
            ]
          }
        },
        causes,
        findings: []
      });

    assert.equal(
      result.summary,
      causes[0].description
    );
    assert.deepEqual(
      result.limitations,
      []
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /Brainy/i
    );
  }
);

test(
  'primer recibo usa el prorrateo amigable como resumen principal',
  () => {
    const finding = {
      code: 'PRORATION',
      description:
        'Tu recibo incluye S/ 21.92 de prorrateo. Este importe ya está incluido en el total.'
    };

    const result =
      buildCustomerFacing({
        explanation: {
          interpretation: {
            status:
              'NO_PREVIOUS_BILL'
          },
          customerFacing: {
            headline:
              'Tu recibo incluye un prorrateo de S/ 21.92',
            summary:
              'Brainy Prorrateo confirma el monto.',
            limitations: []
          }
        },
        causes: [],
        findings: [finding]
      });

    assert.equal(
      result.summary,
      finding.description
    );
    assert.doesNotMatch(
      result.summary,
      /Brainy/i
    );
  }
);

test(
  'paquete adicional se explica con monto y nombre del concepto sin lenguaje técnico',
  () => {
    const text =
      buildCustomerCauseDescription({
        code: 'PACKAGES',
        impactAmount: 9.99,
        packageEvent: 'ADDED',
        chargeChange: {
          description:
            'Paquete 3GB de Internet 10dias x S/10'
        }
      });

    assert.match(
      text,
      /cargo de S\/ 9\.99/i
    );
    assert.match(
      text,
      /Paquete 3GB de Internet/i
    );
    assert.doesNotMatch(
      text,
      /GRUPO|CLASIFICACION|SUBSCRIBER/i
    );
  }
);

test(
  'verificación de paquete solo menciona órdenes cuando realmente existen',
  () => {
    const withoutOrder =
      buildVerification({
        code: 'PACKAGES',
        evidenceLevel: 'HIGH',
        evidence: {
          orders: []
        }
      });

    assert.deepEqual(
      withoutOrder.sources,
      ['Facturación']
    );

    const withOrder =
      buildVerification({
        code: 'PACKAGES',
        evidenceLevel: 'HIGH',
        evidence: {
          orders: [
            {
              reason:
                'Activacion de Paquetes Datos OneShot'
            }
          ]
        }
      });

    assert.deepEqual(
      withOrder.sources,
      [
        'Facturación',
        'Órdenes del servicio'
      ]
    );
  }
);

test(
  'Checkpoint 14B presenta el crédito por suspensión como hallazgo verificado y no como variación',
  () => {
    const finding = {
      code: 'SUSPENSION_ADJUSTMENT',
      amount: 7.21,
      suspendedDays: 3,
      periodStartDate: '2026-05-05',
      periodEndDate: '2026-05-07',
      evidenceLevel: 'HIGH'
    };

    const text =
      buildCustomerFindingDescription(
        finding
      );

    assert.match(text, /S\/ 7\.21/i);
    assert.match(text, /3 días sin servicio/i);
    assert.match(text, /a tu favor/i);
    assert.match(text, /día anterior a la reconexión/i);
    assert.doesNotMatch(text, /Brainy|SUBSCRIBER|CRD/i);

    assert.equal(
      getImpactPresentation(finding),
      'VERIFIED_CREDIT_CONTEXT'
    );

    assert.deepEqual(
      buildVerification(finding).sources,
      [
        'Facturación',
        'Registro de notas',
        'Registro de reconexión'
      ]
    );
  }
);

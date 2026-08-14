const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CROSS_SELL_STATUS,
  BENEFIT_STATUS,
  COMMERCIAL_FOLLOW_UP_PROMPT,
  buildEffervescentReminder,
  evaluateCrossSell,
  buildCommercialExperience,
  isCommercialFollowUp,
  buildCommercialOfferReply
} = require(
  '../services/desafio1CommercialPolicyLogic'
);

function experience({
  businessType = 'MOVIL',
  causes = [],
  findings = [],
  financialGuard = true
} = {}) {
  return {
    customer: {
      businessType
    },
    comparison: {
      causes
    },
    findings,
    financialExplanation: {
      safeguards: {
        llmUsedForFinancialReasoning:
          !financialGuard
      }
    }
  };
}

function resolved() {
  return { status: 'RESOLVED' };
}

function catalog() {
  return [
    {
      offerId: 'OF001',
      name: 'Plan Movil Basico 10GB',
      offerType: 'plan_movil',
      monthlyPrice: 39.9,
      includedGb: 10,
      isMovistarTotal: false
    },
    {
      offerId: 'OF002',
      name: 'Plan Movil Plus 25GB',
      offerType: 'plan_movil',
      monthlyPrice: 59.9,
      includedGb: 25,
      isMovistarTotal: false
    },
    {
      offerId: 'OF003',
      name: 'Plan Movil Max 50GB',
      offerType: 'plan_movil',
      monthlyPrice: 79.9,
      includedGb: 50,
      isMovistarTotal: false
    },
    {
      offerId: 'OF020',
      name: 'Movistar Total Basico',
      offerType: 'movistar_total',
      monthlyPrice: 149.9,
      includedGb: 30,
      savingsPct: 20,
      isMovistarTotal: true
    }
  ];
}

function snapshot(overrides = {}) {
  return {
    scope: 'SIMULATED_COMMERCIAL_LAYER',
    profile: {
      customerId: 'CLI000006',
      hasMobile: true,
      hasHome: false,
      isMovistarTotal: false,
      eligibleMovistarTotal: false,
      currentOfferId: 'OF001',
      averageDataGb: 9.7,
      ...overrides.profile
    },
    campaigns:
      overrides.campaigns || [],
    catalog:
      overrides.catalog || catalog()
  };
}

test('cross-selling se bloquea si la consulta no quedó RESOLVED', () => {
  const result = evaluateCrossSell({
    resolution: {
      status: 'PARTIALLY_RESOLVED'
    },
    experience: experience(),
    commercialSnapshot: snapshot()
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'QUERY_NOT_RESOLVED'
  );
});

test('reconexión resuelta sigue siendo un momento comercial sensible', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience({
      causes: [
        {
          code: 'RECONNECTION',
          evidenceLevel: 'HIGH'
        }
      ]
    }),
    commercialSnapshot: snapshot()
  });

  assert.equal(result.offered, false);
  assert.match(
    result.reasonCode,
    /^SENSITIVE_BILLING_MOMENT_RECONNECTION$/
  );
});

test('la política comercial exige confirmar que el LLM no razonó finanzas', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience({
      financialGuard: false
    }),
    commercialSnapshot: snapshot()
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'FINANCIAL_GUARD_NOT_CONFIRMED'
  );
});

test('regla móvil explícita ofrece el siguiente plan solo al superar 90% de los GB', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot()
  });

  assert.equal(
    result.status,
    CROSS_SELL_STATUS.OFFERED
  );
  assert.equal(result.offered, true);
  assert.equal(
    result.ruleId,
    'MOBILE_USAGE_NEAR_ALLOWANCE'
  );
  assert.equal(result.offer.name, 'Plan Movil Plus 25GB');
  assert.equal(Object.hasOwn(result.offer, 'offerId'), false);
  assert.equal(
    result.guards.fallbackOfferInvented,
    false
  );
});

test('consumo por debajo del umbral no cae en una oferta genérica', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot({
      profile: {
        averageDataGb: 5
      }
    })
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.status,
    CROSS_SELL_STATUS.NOT_ELIGIBLE
  );
  assert.equal(result.offer, null);
});

test('la regla móvil exige compatibilidad con negocio MOVIL oficial', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience({
      businessType: 'FIJA'
    }),
    commercialSnapshot: snapshot()
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'NO_EXPLICIT_COMPATIBLE_RULE'
  );
});

test('Movistar Total solo se ofrece con elegibilidad explícita y ambos servicios', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot({
      profile: {
        eligibleMovistarTotal: true,
        hasMobile: true,
        hasHome: true,
        currentOfferId: 'OF002',
        averageDataGb: 1
      }
    })
  });

  assert.equal(result.offered, true);
  assert.equal(
    result.ruleId,
    'MT_EXPLICIT_ELIGIBILITY'
  );
  assert.equal(result.offer.name, 'Movistar Total Basico');
  assert.equal(Object.hasOwn(result.offer, 'offerId'), false);
});

test('una misma oferta ya rechazada en el historial no se repite', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot({
      campaigns: [
        {
          offerId: 'OF002',
          result: 'rechazada',
          date: '2026-06-10'
        }
      ]
    })
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'SAME_OFFER_ALREADY_RECHAZADA'
  );
});

test('una misma oferta ya aceptada tampoco se vuelve a vender', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot({
      campaigns: [
        {
          offerId: 'OF002',
          result: 'aceptada',
          date: '2026-05-10'
        }
      ]
    })
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'SAME_OFFER_ALREADY_ACEPTADA'
  );
});

test('Efecto Efervescente solo reutiliza ACTIVE_DISCOUNT HIGH ya existente', () => {
  const benefit = buildEffervescentReminder(
    experience({
      findings: [
        {
          code: 'ACTIVE_DISCOUNT',
          evidenceLevel: 'HIGH',
          description:
            'Ya tienes un descuento vigente aplicado en este recibo.',
          impact: -12.5
        }
      ]
    })
  );

  assert.equal(
    benefit.status,
    BENEFIT_STATUS.AVAILABLE
  );
  assert.equal(benefit.available, true);
  assert.equal(benefit.existingBenefit, true);
  assert.equal(benefit.newAddition, false);
  assert.equal(benefit.amount, 12.5);
});

test('evidencia MEDIUM no se convierte en beneficio comercial vigente', () => {
  const benefit = buildEffervescentReminder(
    experience({
      findings: [
        {
          code: 'ACTIVE_DISCOUNT',
          evidenceLevel: 'MEDIUM',
          description: 'Descuento dudoso'
        }
      ]
    })
  );

  assert.equal(benefit.available, false);
  assert.equal(
    benefit.reasonCode,
    'NO_VERIFIED_EXISTING_BENEFIT'
  );
});

test('un beneficio existente tiene prioridad y evita vender en el mismo turno', () => {
  const result = buildCommercialExperience({
    resolution: resolved(),
    experience: experience({
      findings: [
        {
          code: 'ACTIVE_DISCOUNT',
          evidenceLevel: 'HIGH',
          description:
            'Tu descuento vigente ya está aplicado.'
        }
      ]
    }),
    commercialSnapshot: snapshot()
  });

  assert.equal(
    result.existingBenefit.available,
    true
  );
  assert.equal(result.crossSell.offered, false);
  assert.equal(
    result.crossSell.reasonCode,
    'EXISTING_BENEFIT_PRIORITY'
  );
});

test('la misma sesión no muestra una segunda oferta comercial', () => {
  const result = evaluateCrossSell({
    resolution: resolved(),
    experience: experience(),
    commercialSnapshot: snapshot(),
    alreadyShown: true
  });

  assert.equal(result.offered, false);
  assert.equal(
    result.reasonCode,
    'ALREADY_SHOWN_THIS_SESSION'
  );
});

test('Mi Movistar puede recordar un beneficio pero no evalúa cross-sell sin turno resuelto', () => {
  const result = buildCommercialExperience({
    experience: experience({
      findings: [
        {
          code: 'ACTIVE_DISCOUNT',
          evidenceLevel: 'HIGH',
          description:
            'Beneficio ya aplicado.'
        }
      ]
    }),
    evaluateCrossSellNow: false,
    allowBenefitWithoutResolvedTurn: true
  });

  assert.equal(
    result.existingBenefit.available,
    true
  );
  assert.equal(
    result.crossSell.status,
    CROSS_SELL_STATUS.NOT_EVALUATED
  );
});

test('seguimiento comercial y su respuesta son deterministas y no contratan nada', () => {
  assert.equal(
    isCommercialFollowUp(
      COMMERCIAL_FOLLOW_UP_PROMPT
    ),
    true
  );

  const reply = buildCommercialOfferReply({
    offerId: 'OF002',
    name: 'Plan Movil Plus 25GB',
    offerType: 'plan_movil',
    monthlyPrice: 59.9,
    includedGb: 25
  });

  assert.match(reply, /S\/ 59\.90/);
  assert.match(reply, /25 GB/);
  assert.match(reply, /no cambia tu servicio ni tu recibo/i);
  assert.match(reply, /confirmarse por un canal comercial/i);
});

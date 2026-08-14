const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Desafio1CommercialPolicyService
} = require(
  '../services/desafio1CommercialPolicyService'
);

function experience({
  findings = [],
  causes = [],
  businessType = 'MOVIL'
} = {}) {
  return {
    customer: {
      businessType
    },
    findings,
    comparison: { causes },
    financialExplanation: {
      safeguards: {
        llmUsedForFinancialReasoning:
          false
      }
    }
  };
}

function snapshot() {
  return {
    profile: {
      customerId: 'CLI000006',
      hasMobile: true,
      hasHome: false,
      isMovistarTotal: false,
      eligibleMovistarTotal: false,
      currentOfferId: 'OF001',
      averageDataGb: 9.7
    },
    campaigns: [],
    catalog: [
      {
        offerId: 'OF001',
        name: 'Plan 10GB',
        offerType: 'plan_movil',
        monthlyPrice: 39.9,
        includedGb: 10
      },
      {
        offerId: 'OF002',
        name: 'Plan 25GB',
        offerType: 'plan_movil',
        monthlyPrice: 59.9,
        includedGb: 25
      }
    ]
  };
}

test('turno no resuelto no consulta la capa comercial simulada', async () => {
  let calls = 0;
  const service =
    new Desafio1CommercialPolicyService({
      dataService: {
        async getCommercialSnapshot() {
          calls += 1;
          return snapshot();
        }
      }
    });

  const result = await service.evaluateTurn({
    user: {
      customerId: 'CLI000006',
      mode: 'DEMO'
    },
    experience: experience(),
    resolution: {
      status: 'UNRESOLVED'
    }
  });

  assert.equal(calls, 0);
  assert.equal(
    result.publicExperience
      .crossSell.offered,
    false
  );
  assert.equal(
    result.publicExperience
      .existingBenefit.available,
    false
  );
});

test('beneficio HIGH existente tiene prioridad sin abrir datos comerciales', async () => {
  let calls = 0;
  const service =
    new Desafio1CommercialPolicyService({
      dataService: {
        async getCommercialSnapshot() {
          calls += 1;
          return snapshot();
        }
      }
    });

  const result = await service.evaluateTurn({
    user: {
      customerId: 'CLI000006',
      mode: 'DEMO'
    },
    experience: experience({
      findings: [
        {
          code: 'ACTIVE_DISCOUNT',
          evidenceLevel: 'HIGH',
          description:
            'Descuento vigente verificado.'
        }
      ]
    }),
    resolution: {
      status: 'RESOLVED'
    }
  });

  assert.equal(calls, 0);
  assert.equal(
    result.publicExperience
      .existingBenefit.available,
    true
  );
  assert.equal(
    result.contextPatch
      .effervescentBenefitShown,
    true
  );
});

test('oferta elegible se devuelve pública y se guarda una sola vez en contexto seguro', async () => {
  const service =
    new Desafio1CommercialPolicyService({
      dataService: {
        async getCommercialSnapshot() {
          return snapshot();
        }
      }
    });

  const result = await service.evaluateTurn({
    user: {
      customerId: 'CLI000006',
      mode: 'DEMO'
    },
    experience: experience(),
    resolution: {
      status: 'RESOLVED'
    },
    sessionContext: {}
  });

  assert.equal(
    result.publicExperience
      .crossSell.offered,
    true
  );
  assert.equal(
    result.internalOffer.name,
    'Plan 25GB'
  );
  assert.equal(
    Object.hasOwn(
      result.internalOffer,
      'offerId'
    ),
    false
  );
  assert.equal(
    result.contextPatch
      .commercialOfferShown,
    true
  );
  assert.deepEqual(
    result.contextPatch
      .lastCommercialOffer,
    result.internalOffer
  );
  assert.equal(
    Object.hasOwn(
      result.internalOffer,
      'customerId'
    ),
    false
  );
});

test('fallo de la capa comercial no rompe la respuesta financiera ni inventa fallback', async () => {
  const service =
    new Desafio1CommercialPolicyService({
      dataService: {
        async getCommercialSnapshot() {
          throw new Error(
            'C:/ruta/privada/app.db'
          );
        }
      }
    });

  const result = await service.evaluateTurn({
    user: {
      customerId: 'CLI000006',
      mode: 'DEMO'
    },
    experience: experience(),
    resolution: {
      status: 'RESOLVED'
    }
  });

  assert.equal(
    result.publicExperience
      .crossSell.status,
    'DATA_UNAVAILABLE'
  );
  assert.equal(
    result.publicExperience
      .crossSell.offer,
    null
  );
  assert.equal(
    JSON.stringify(result)
      .includes('C:/ruta/privada'),
    false
  );
});

test('explorador y Mi Movistar no disparan cross-sell sin resolución conversacional', async () => {
  let calls = 0;
  const service =
    new Desafio1CommercialPolicyService({
      dataService: {
        async getCommercialSnapshot() {
          calls += 1;
          return snapshot();
        }
      }
    });

  const explorer = await service.evaluateTurn({
    user: {
      customerId: 'DEMO000001',
      mode: 'EXPLORER'
    },
    experience: experience(),
    resolution: {
      status: 'RESOLVED'
    }
  });

  const app = service.buildAppExperience({
    experience: experience()
  });

  assert.equal(calls, 0);
  assert.equal(
    explorer.publicExperience
      .crossSell.status,
    'NOT_EVALUATED'
  );
  assert.equal(
    app.crossSell.status,
    'NOT_EVALUATED'
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PresenterCaseError,
  createPresenterCaseService,
  normalizeCaseReference,
  caseNumberFromDemoId,
  formatCaseLabel,
  normalizeQuality
} = require(
  '../services/desafio1PresenterCaseService'
);

function profile(overrides = {}) {
  return {
    demoId: 'DEMO000074',
    subscriberKey: '200000074',
    customerKey: '100000074',
    primaryScenario: 'RECONNECTION',
    qualityTier: 'DEMO_PREMIUM',
    evidenceLevel: 'HIGH',
    demoPremium: true,
    comparable: true,
    invoiceCount: 6,
    rentType: 'RV',
    businessType: 'MOVIL',
    lobType: 'WRLS',
    coveragePercent: 100,
    ...overrides
  };
}

function repository({
  match = true,
  hasBilling = true,
  calls = []
} = {}) {
  return {
    async open() {
      calls.push('open');
    },
    async getSubscriberByCustomerAndService(
      customerCode,
      serviceNumber
    ) {
      calls.push([
        'pair',
        customerCode,
        serviceNumber
      ]);

      if (!match) {
        return null;
      }

      return {
        customerKey: customerCode,
        subscriberKey: serviceNumber
      };
    },
    async subscriberHasBilling(
      serviceNumber
    ) {
      calls.push([
        'billing',
        serviceNumber
      ]);
      return hasBilling;
    },
    async close() {
      calls.push('close');
    }
  };
}

test(
  'normaliza número visible y alias técnico al mismo caso estable',
  () => {
    assert.equal(
      normalizeCaseReference('74'),
      'DEMO000074'
    );
    assert.equal(
      normalizeCaseReference('#000074'),
      'DEMO000074'
    );
    assert.equal(
      normalizeCaseReference('Caso #000074'),
      'DEMO000074'
    );
    assert.equal(
      normalizeCaseReference('DEMO000074'),
      'DEMO000074'
    );
    assert.equal(
      caseNumberFromDemoId(
        'DEMO000074'
      ),
      '000074'
    );
    assert.equal(
      formatCaseLabel(
        'DEMO000074'
      ),
      'Caso #000074'
    );
  }
);

test(
  'rechaza referencias que no corresponden a un caso de cobertura',
  async () => {
    const service =
      createPresenterCaseService({
        readPrivateProfile:
          async () => {
            throw new Error(
              'no debe consultarse'
            );
          }
      });

    await assert.rejects(
      () =>
        service.resolveLogin({
          caseRef: 'cliente 123'
        }),
      (error) =>
        error instanceof PresenterCaseError &&
        error.code ===
          'PRESENTER_CASE_REFERENCE_INVALID'
    );
  }
);

test(
  'resuelve un caso exacto y revalida COD_CLIENTE + NUM_ANEXO antes de revelarlos',
  async () => {
    const calls = [];
    const service =
      createPresenterCaseService({
        readPrivateProfile:
          async (demoId) => {
            assert.equal(
              demoId,
              'DEMO000074'
            );
            return profile();
          },
        repositoryFactory:
          () => repository({ calls })
      });

    const result =
      await service.resolveLogin({
        caseRef: 74
      });

    assert.equal(
      result.presenterOnly,
      true
    );
    assert.equal(
      result.case.label,
      'Caso #000074'
    );
    assert.equal(
      result.case.demoPremium,
      true
    );
    assert.deepEqual(
      result.login,
      {
        customerCode: '100000074',
        serviceNumber: '200000074'
      }
    );
    assert.equal(
      result.verification.exactPlantPair,
      true
    );
    assert.deepEqual(
      calls,
      [
        'open',
        [
          'pair',
          '100000074',
          '200000074'
        ],
        [
          'billing',
          '200000074'
        ],
        'close'
      ]
    );
  }
);

test(
  'si el índice y PLANTA dejan de coincidir no entrega credenciales',
  async () => {
    const service =
      createPresenterCaseService({
        readPrivateProfile:
          async () => profile(),
        repositoryFactory:
          () =>
            repository({
              match: false
            })
      });

    await assert.rejects(
      () =>
        service.resolveLogin({
          caseRef: 74
        }),
      (error) =>
        error.code ===
          'PRESENTER_CASE_PAIR_MISMATCH'
    );
  }
);

test(
  'un caso sin facturación no se ofrece como credencial para la demo',
  async () => {
    const service =
      createPresenterCaseService({
        readPrivateProfile:
          async () => profile(),
        repositoryFactory:
          () =>
            repository({
              hasBilling: false
            })
      });

    await assert.rejects(
      () =>
        service.resolveLogin({
          caseRef: 74
        }),
      (error) =>
        error.code ===
          'PRESENTER_CASE_WITHOUT_BILLING'
    );
  }
);

test(
  'busca el mejor Premium de un escenario usando la proyección segura antes del mapping privado',
  async () => {
    const queries = [];
    const privateReads = [];
    const service =
      createPresenterCaseService({
        searchProfiles:
          async (query) => {
            queries.push(query);
            return {
              items: [
                {
                  demoId:
                    'DEMO000074'
                }
              ]
            };
          },
        readPrivateProfile:
          async (demoId) => {
            privateReads.push(demoId);
            return profile();
          },
        repositoryFactory:
          () => repository()
      });

    const result =
      await service.resolveLogin({
        scenario: 'reconnection',
        quality: 'premium'
      });

    assert.equal(
      result.case.scenario,
      'RECONNECTION'
    );
    assert.equal(
      queries[0].capability,
      'PREMIUM'
    );
    assert.equal(
      queries[0].scenario,
      'RECONNECTION'
    );
    assert.equal(
      queries[0].sort,
      'PREMIUM_FIRST'
    );
    assert.deepEqual(
      privateReads,
      ['DEMO000074']
    );
  }
);

test(
  'la selección por calidad admite HIGH sin degradarla silenciosamente a PREMIUM',
  () => {
    assert.equal(
      normalizeQuality('HIGH'),
      'HIGH'
    );
    assert.equal(
      normalizeQuality('premium'),
      'PREMIUM'
    );
    assert.equal(
      normalizeQuality('cualquiera'),
      null
    );
  }
);

test(
  'si no existe candidato para escenario y calidad devuelve error explícito',
  async () => {
    const service =
      createPresenterCaseService({
        searchProfiles:
          async () => ({
            items: []
          })
      });

    await assert.rejects(
      () =>
        service.resolveLogin({
          scenario: 'PRORATION',
          quality: 'PREMIUM'
        }),
      (error) =>
        error.code ===
          'PRESENTER_CASE_NOT_FOUND'
    );
  }
);

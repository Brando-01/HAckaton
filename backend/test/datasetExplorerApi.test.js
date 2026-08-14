process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  clearAuthSessions
} = require('../services/authService');

function explorerExperience(user) {
  return {
    schemaVersion:
      'desafio1-explorer-experience-v1',
    dataSource:
      'DESAFIO1_COVERAGE_EXPLORER_LOCAL',
    customer: {
      customerId:
        user.customerId,
      name: user.name,
      plan: 'Plan explorado',
      demoScenario:
        'RECONNECTION',
      demoScenarioLabel:
        'Reconexión'
    },
    currentBill: {
      period: 'Ciclo 15/07/2026',
      total: 67.47,
      status: 'Sin deuda',
      dueDate: null,
      items: []
    },
    previousBill: {
      period: 'Ciclo 15/06/2026',
      total: 62.89,
      status: 'Sin deuda',
      dueDate: null,
      items: []
    },
    comparison: {
      difference: 4.58,
      percentage: 7.3,
      direction: 'UP',
      causes: []
    },
    findings: [],
    financialExplanation: {
      status: 'FULLY_EXPLAINED',
      coveragePercent: 100,
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV',
          label: 'Renta vencida',
          definition: 'Demo'
        }
      },
      customerFacing: {
        headline:
          'Tu recibo aumentó S/ 4.58',
        summary:
          'Se agregó un cargo por reconexión.',
        limitations: []
      }
    },
    explorer: {
      demoId: 'DEMO000123',
      temporarySession: true
    },
    nextActions: []
  };
}

function createFakeExplorer() {
  return {
    async getSummary() {
      return {
        schemaVersion:
          'desafio1-dataset-explorer-v1',
        fullDataset: true,
        scope: {
          totalAvailable: 20000,
          scanned: 20000
        },
        counts: {
          consultable: 18450
        },
        safeguards: {
          officialIdentifiersExposed:
            false
        }
      };
    },
    async searchProfiles() {
      return {
        query: {},
        items: [
          {
            demoId: 'DEMO000123',
            primaryScenario:
              'RECONNECTION',
            primaryScenarioLabel:
              'Reconexión',
            comparable: true,
            explainable: true,
            highConfidence: true,
            demoPremium: true
          }
        ],
        pagination: {
          page: 1,
          pageSize: 24,
          total: 1,
          totalPages: 1
        }
      };
    },
    async getSafeProfile() {
      return {
        demoId: 'DEMO000123',
        highConfidence: true
      };
    },
    async createAuthUserForDemoId(
      demoId
    ) {
      assert.equal(
        demoId,
        'DEMO000123'
      );
      return {
        userId:
          'EXP_DEMO000123',
        customerId:
          'EXP_DEMO000123',
        name:
          'Cliente DEMO000123',
        email: null,
        mode: 'EXPLORER',
        explorerDemoId:
          'DEMO000123'
      };
    },
    async getExperienceForUser(user) {
      return explorerExperience(user);
    }
  };
}

function getCookie(response) {
  const setCookie =
    response.headers.get(
      'set-cookie'
    );

  return setCookie
    ? setCookie.split(';')[0]
    : null;
}

function startServer() {
  const app =
    createApp({
      datasetExplorerService:
        createFakeExplorer(),
      customerProfileService: {
        async getProfileForUser(user) {
          assert.equal(
            user.explorerDemoId,
            'DEMO000123'
          );

          return {
            visibleId:
              'DEMO000123',
            customerCode:
              'TEST-CUSTOMER-001',
            activationDate:
              '2020-08-01 15:22:00',
            billingCycleDay: 9,
            lobType: 'WRLS',
            businessType: 'MOVIL'
          };
        }
      }
    });

  return new Promise(
    (resolve) => {
      const server =
        app.listen(
          0,
          '127.0.0.1',
          () => resolve(server)
        );
    }
  );
}

test(
  'API del explorador lista aliases seguros y abre una sesión temporal reutilizable por Mi Movistar y Lucía',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const listResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/explorer/profiles`
        );
      const listData =
        await listResponse.json();

      assert.equal(
        listResponse.status,
        200
      );
      assert.equal(
        listData.items[0].demoId,
        'DEMO000123'
      );
      assert.doesNotMatch(
        JSON.stringify(listData),
        /subscriberKey|customerKey/
      );

      const unauthProfileResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              message:
                '¿Qué datos tienes de mí?',
              sessionId:
                'phase10-profile-public'
            })
          }
        );
      const unauthProfileData =
        await unauthProfileResponse
          .json();

      assert.equal(
        unauthProfileResponse.status,
        200
      );
      assert.equal(
        unauthProfileData.requiresAuth,
        true
      );
      assert.equal(
        unauthProfileData
          .requestedCapability,
        'CUSTOMER_PROFILE'
      );

      const openResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/explorer/open`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              demoId: 'DEMO000123'
            })
          }
        );
      const openData =
        await openResponse.json();
      const cookie =
        getCookie(openResponse);

      assert.equal(
        openResponse.status,
        200
      );
      assert.ok(cookie);
      assert.equal(
        openData.user.mode,
        'EXPLORER'
      );
      assert.equal(
        openData.user.explorerDemoId,
        'DEMO000123'
      );
      assert.doesNotMatch(
        JSON.stringify(openData),
        /subscriberKey|customerKey/
      );

      const appResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/app/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );
      const appData =
        await appResponse.json();

      assert.equal(
        appResponse.status,
        200
      );
      assert.equal(
        appData.customer.customerId,
        'EXP_DEMO000123'
      );
      assert.equal(
        appData.explorer.demoId,
        'DEMO000123'
      );

      const bindResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/session/phase10-explorer/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                'EXP_DEMO000123'
            })
          }
        );

      const bindData =
        await bindResponse.json();

      assert.equal(
        bindResponse.status,
        200
      );
      assert.equal(
        bindData.customerId,
        'EXP_DEMO000123'
      );

      const chatResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Cuál es el total de mi recibo?',
              sessionId:
                bindData.sessionId
            })
          }
        );
      const chatData =
        await chatResponse.json();

      assert.equal(
        chatResponse.status,
        200
      );
      assert.equal(
        chatData.foundData,
        true
      );
      assert.equal(
        chatData.authenticated,
        true
      );
      assert.match(
        chatData.reply,
        /S\/ 67\.47/
      );
      assert.doesNotMatch(
        chatData.reply,
        /mismo total/i
      );

      const profileResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Qué datos tienes de mí?',
              sessionId:
                chatData.sessionId
            })
          }
        );
      const profileData =
        await profileResponse.json();

      assert.equal(
        profileResponse.status,
        200
      );
      assert.equal(
        profileData.source,
        'DESAFIO1_PROFILE_DETERMINISTIC'
      );
      assert.equal(
        profileData.intent,
        'PROFILE_SUMMARY'
      );
      assert.match(
        profileData.reply,
        /TEST-CUSTOMER-001/
      );
      assert.match(
        profileData.reply,
        /01\/08\/2020/
      );
      assert.match(
        profileData.reply,
        /Móvil \(WRLS\)/
      );
      assert.doesNotMatch(
        JSON.stringify(profileData),
        /subscriberKey|financialAccount|phoneHash/
      );

      const idResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Cuál es mi ID?',
              sessionId:
                profileData.sessionId
            })
          }
        );
      const idData =
        await idResponse.json();

      assert.equal(
        idData.intent,
        'CUSTOMER_ID'
      );
      assert.match(
        idData.reply,
        /DEMO000123/
      );
      assert.match(
        idData.reply,
        /TEST-CUSTOMER-001/
      );
      assert.doesNotMatch(
        idData.reply,
        /PLANTA CLIENTES\.csv/
      );
      assert.equal(
        idData.dataOrigin
          .generatedByLlm,
        false
      );


      const multiResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                '¿Desde cuándo tengo el servicio? ¿Cuál es mi ciclo? ¿Qué tipo de servicio tengo? ¿Cuál es mi plan? ¿Tengo deuda?',
              sessionId:
                idData.sessionId
            })
          }
        );
      const multiData =
        await multiResponse.json();

      assert.equal(
        multiResponse.status,
        200
      );
      assert.equal(
        multiData.source,
        'DESAFIO1_CONTEXT_DETERMINISTIC'
      );
      assert.equal(
        multiData.conversation.multiIntent,
        true
      );
      assert.equal(
        multiData.conversation.domain,
        'PROFILE'
      );
      assert.match(
        multiData.reply,
        /01\/08\/2020/
      );
      assert.match(
        multiData.reply,
        /día 9/
      );
      assert.match(
        multiData.reply,
        /Móvil \(WRLS\)/
      );
      assert.match(
        multiData.reply,
        /Plan explorado/
      );
      assert.match(
        multiData.reply,
        /sin deuda/i
      );
      assert.doesNotMatch(
        multiData.reply,
        /Según PLANTA|FACTURACION-CLIENTES/i
      );

      const repairResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                'No entendí, ¿me lo explicas más fácil?',
              sessionId:
                multiData.sessionId
            })
          }
        );
      const repairData =
        await repairResponse.json();

      assert.equal(
        repairResponse.status,
        200
      );
      assert.equal(
        repairData.conversation.repair,
        true
      );
      assert.match(
        repairData.reply,
        /En simple/i
      );
      assert.match(
        repairData.reply,
        /Plan explorado/
      );
      assert.doesNotMatch(
        repairData.reply,
        /•/
      );
      assert.equal(
        repairData.conversation.domain,
        'PROFILE'
      );
      assert.doesNotMatch(
        repairData.reply,
        /recibo aument|reconexi[oó]n|descuento|prorrateo/i
      );

      const handoffResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              message:
                'Quiero hablar con un asesor sobre mi plan',
              sessionId:
                repairData.sessionId
            })
          }
        );
      const handoffData =
        await handoffResponse.json();

      assert.equal(
        handoffResponse.status,
        200
      );
      assert.ok(
        handoffData.handoff?.caseId
      );
      assert.doesNotMatch(
        handoffData.reply,
        /plan\/cargo principal/i
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);

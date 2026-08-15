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
    billingHistory: {
      schemaVersion:
        'desafio1-billing-history-v1',
      maxBills: 6,
      maxPreviousBills: 5,
      availableBills: 3,
      previousBills: 2,
      completeWindow: false,
      bills: [
        {
          cycleDate: '2026-07-15',
          period: 'Ciclo 15/07/2026',
          total: 67.47,
          items: []
        },
        {
          cycleDate: '2026-06-15',
          period: 'Ciclo 15/06/2026',
          total: 62.89,
          items: []
        },
        {
          cycleDate: '2026-05-15',
          period: 'Ciclo 15/05/2026',
          total: 71.2,
          items: []
        }
      ],
      summary: {
        averageTotal: 67.19,
        highestBill: {
          cycleDate: '2026-05-15',
          period: 'Ciclo 15/05/2026',
          total: 71.2
        },
        lowestBill: {
          cycleDate: '2026-06-15',
          period: 'Ciclo 15/06/2026',
          total: 62.89
        },
        oldestBill: {
          cycleDate: '2026-05-15',
          period: 'Ciclo 15/05/2026',
          total: 71.2
        },
        newestBill: {
          cycleDate: '2026-07-15',
          period: 'Ciclo 15/07/2026',
          total: 67.47
        },
        netChange: -3.73,
        netDirection: 'DOWN',
        mostRecentIncrease: {
          from: {
            cycleDate: '2026-06-15',
            period: 'Ciclo 15/06/2026',
            total: 62.89
          },
          to: {
            cycleDate: '2026-07-15',
            period: 'Ciclo 15/07/2026',
            total: 67.47
          },
          difference: 4.58,
          isCurrentChange: true
        }
      }
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
  'API del explorador mantiene metadata segura pero bloquea abrir cualquier alias como cuenta',
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
        /subscriberKey|customerKey|financialAccount/
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

      assert.equal(
        openResponse.status,
        403
      );
      assert.equal(
        openData.code,
        'EXPLORER_READ_ONLY'
      );
      assert.equal(
        openData.requiresAuth,
        true
      );
      assert.equal(
        openData.redirect,
        '/login'
      );
      assert.equal(
        openResponse.headers.get(
          'set-cookie'
        ),
        null
      );

      const forgedDemoLogin =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/demo-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerId:
                'EXP_DEMO000123'
            })
          }
        );

      assert.equal(
        forgedDemoLogin.status,
        400
      );
      assert.equal(
        forgedDemoLogin.headers.get(
          'set-cookie'
        ),
        null
      );

      const appResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/app/me`
        );

      assert.equal(
        appResponse.status,
        401
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);

test(
  'una llamada manual al open bloqueado no reemplaza una identidad ya autenticada',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const loginResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/demo-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerId: 'CLI000001'
            })
          }
        );
      const cookie =
        getCookie(loginResponse);

      assert.equal(
        loginResponse.status,
        200
      );
      assert.ok(cookie);

      const blockedResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/explorer/open`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              demoId: 'DEMO000123'
            })
          }
        );

      assert.equal(
        blockedResponse.status,
        403
      );
      assert.equal(
        blockedResponse.headers.get(
          'set-cookie'
        ),
        null
      );

      const meResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );
      const meData =
        await meResponse.json();

      assert.equal(
        meResponse.status,
        200
      );
      assert.equal(
        meData.user.customerId,
        'CLI000001'
      );
      assert.notEqual(
        meData.user.mode,
        'EXPLORER'
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);

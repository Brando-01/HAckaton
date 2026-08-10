process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  resetMetrics,
  registerMessage
} = require(
  '../services/metricsService'
);


test(
  'finaliza, califica y refleja una interacción en el dashboard',
  async (t) => {
    const sessionId =
      'metrics-api-test';

    resetMetrics();


    // Simulamos una interacción
    // que ya tuvo un intercambio.
    registerMessage(
      sessionId,
      'user'
    );

    registerMessage(
      sessionId,
      'assistant'
    );


    const app =
      createApp();

    const server =
      app.listen(0);


    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );


    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );


    const port =
      server.address().port;

    const baseUrl =
      `http://127.0.0.1:${port}`;


    // 1. Finalizamos.
    const endResponse =
      await fetch(
        `${baseUrl}/api/metrics/${sessionId}/end`,
        {
          method: 'POST'
        }
      );


    assert.equal(
      endResponse.status,
      200
    );


    const endData =
      await endResponse.json();


    assert.equal(
      endData.interaction.status,
      'ENDED'
    );

    assert.equal(
      endData.interaction.endReason,
      'USER_ENDED'
    );


    // 2. Registramos satisfacción.
    const ratingResponse =
      await fetch(
        `${baseUrl}/api/metrics/${sessionId}/satisfaction`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            rating: 5,

            comment:
              'La explicación fue clara'
          })
        }
      );


    assert.equal(
      ratingResponse.status,
      200
    );


    const ratingData =
      await ratingResponse.json();


    assert.equal(
      ratingData.satisfaction.rating,
      5
    );


    // 3. Consultamos dashboard.
    const dashboardResponse =
      await fetch(
        `${baseUrl}/api/metrics/dashboard`
      );


    assert.equal(
      dashboardResponse.status,
      200
    );


    const dashboard =
      await dashboardResponse.json();


    assert.equal(
      dashboard.totalInteractions,
      1
    );

    assert.equal(
      dashboard.activeInteractions,
      0
    );

    assert.equal(
      dashboard.endedInteractions,
      1
    );

    assert.equal(
      dashboard.ratedInteractions,
      1
    );

    assert.equal(
      dashboard.averageSatisfaction,
      5
    );

    assert.equal(
      dashboard.completionRate,
      100
    );

    assert.equal(
      dashboard.digitalResolutionRate,
      100
    );

    assert.equal(
      dashboard.satisfactionResponseRate,
      100
    );

    assert.equal(
      dashboard.positiveSatisfactionRate,
      100
    );

    assert.equal(
      dashboard.totalUserMessages,
      1
    );

    assert.equal(
      dashboard.totalAssistantMessages,
      1
    );


    // 4. Verificamos detalle.
    const interactionsResponse =
      await fetch(
        `${baseUrl}/api/metrics/interactions`
      );


    assert.equal(
      interactionsResponse.status,
      200
    );


    const interactions =
      await interactionsResponse.json();


    assert.equal(
      interactions.interactions.length,
      1
    );


    const interaction =
      interactions.interactions[0];


    assert.equal(
      interaction.status,
      'ENDED'
    );

    assert.equal(
      interaction.satisfaction.rating,
      5
    );

    assert.equal(
      interaction.satisfaction.comment,
      'La explicación fue clara'
    );
  }
);
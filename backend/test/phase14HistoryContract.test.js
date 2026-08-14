const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot =
  path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      relativePath
    ),
    'utf8'
  );
}

test(
  'Fase 14 limita explícitamente la ventana a actual más cinco recibos previos',
  () => {
    const logic =
      read(
        'backend/services/desafio1BillingHistoryLogic.js'
      );
    const analysis =
      read(
        'backend/services/billingAnalysisService.js'
      );

    assert.match(
      logic,
      /MAX_HISTORY_BILLS = 6/
    );
    assert.match(
      logic,
      /MAX_PREVIOUS_BILLS = 5/
    );
    assert.match(
      analysis,
      /Math\.min[\s\S]*6/
    );
  }
);

test(
  'histórico se carga bajo demanda para chat pero siempre se incluye en Mi Movistar',
  () => {
    const server =
      read('backend/server.js');

    assert.match(
      server,
      /needsBillingHistoryForIntents/
    );
    assert.match(
      server,
      /includeHistory:[\s\S]*true/
    );
    assert.match(
      server,
      /includeHistory:[\s\S]*needsBillingHistoryForIntents/
    );
  }
);

test(
  'Mi Movistar muestra el histórico y permite continuar la consulta con Lucía',
  () => {
    const html =
      read('frontend/app.html');
    const js =
      read('frontend/app.js');

    assert.match(
      html,
      /Historial de recibos/
    );
    assert.match(
      html,
      /billHistoryList/
    );
    assert.match(
      js,
      /renderBillHistory/
    );
    assert.match(
      js,
      /Cómo ha cambiado mi recibo en los últimos meses/
    );
  }
);

test(
  'capa conversacional ofrece tendencia, máximo, aumento reciente y recurrencia sin LLM financiero',
  () => {
    const logic =
      read(
        'backend/services/desafio1ConversationLogic.js'
      );

    for (
      const intent of [
        'BILL_HISTORY',
        'HIGHEST_BILL',
        'LATEST_INCREASE',
        'CHARGE_RECURRENCE'
      ]
    ) {
      assert.match(
        logic,
        new RegExp(intent)
      );
    }

    assert.match(
      logic,
      /financialReasoningByLlm:[\s\S]*false/
    );
  }
);

test(
  'Fase 14 mantiene histórico consolidado y no altera el pendiente de equipo financiado',
  () => {
    const logic =
      read(
        'backend/services/desafio1FunctionalCoverageLogic.js'
      );

    assert.match(
      logic,
      /id: 'BILLING_HISTORY'/
    );
    assert.match(
      logic,
      /hasta cinco recibos previos/i
    );
    assert.match(
      logic,
      /FINANCED_EQUIPMENT[\s\S]*PENDING_MAPPING/
    );
    assert.match(
      logic,
      /id: 'SUSPENSION_ADJUSTMENT'/
    );
  }
);

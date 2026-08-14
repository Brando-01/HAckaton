const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(projectRoot, relativePath),
    'utf8'
  );
}

test(
  'Checkpoint 14B exige línea de tiempo exacta, renta RA y prorrateo neto para suspensión',
  () => {
    const explanation = read(
      'backend/services/desafio1ExplanationLogic.js'
    );

    assert.match(
      explanation,
      /SUSPENSION_RA_NOTE_EXACT_PERIOD_NET_PRORATION/
    );
    assert.match(
      explanation,
      /cancelChargeType[\s\S]*CRD/
    );
    assert.match(
      explanation,
      /candidate\.rentType === 'RA'/
    );
    assert.match(
      explanation,
      /previousDate[\s\S]*reconnectionDate/
    );
    assert.match(
      explanation,
      /suspensionCreditsRequireExactTimelineAndNetProration:[\s\S]*true/
    );
  }
);

test(
  'Checkpoint 14B mantiene el crédito fuera de las causas de variación',
  () => {
    const explanation = read(
      'backend/services/desafio1ExplanationLogic.js'
    );
    const coverage = read(
      'backend/services/desafio1FunctionalCoverageLogic.js'
    );

    assert.match(explanation, /causalImpact: false/);
    assert.match(
      explanation,
      /suspensionCreditsAddedAsVariationCauses:[\s\S]*false/
    );
    assert.match(
      coverage,
      /SUSPENSION_RA_CREDIT_RECONCILIATION/
    );
    assert.match(
      coverage,
      /hallazgo verificable[\s\S]*nunca se suma automáticamente como causa/i
    );
  }
);

test(
  'Checkpoint 14B expone suspensión en conversación y explorador sin resolver todas las notas',
  () => {
    const conversation = read(
      'backend/services/desafio1ConversationLogic.js'
    );
    const explorer = read(
      'frontend/explorer.html'
    );
    const mapping = read(
      'backend/services/desafio1ScenarioMappingLogic.js'
    );

    assert.match(conversation, /SUSPENSION_ADJUSTMENT/);
    assert.match(
      conversation,
      /No encontré un ajuste por días de suspensión verificado/i
    );
    assert.match(
      explorer,
      /value="SUSPENSION_ADJUSTMENT"/
    );
    assert.match(
      mapping,
      /ADJUSTMENT_NOTES[\s\S]*SEMANTICS_PENDING/
    );
    assert.match(mapping, /canPromoteToCause: false/);
  }
);

test(
  'Checkpoint 14B documenta la frontera entre subconjunto verificado y notas generales',
  () => {
    const doc = read(
      'backend/docs/desafio1-checkpoint14b-suspension-notes.md'
    );

    assert.match(doc, /678/);
    assert.match(doc, /523/);
    assert.match(doc, /53/);
    assert.match(doc, /nota de crédito != suspensión/i);
    assert.match(doc, /causalImpact: false/);
  }
);

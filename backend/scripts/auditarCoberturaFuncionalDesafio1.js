const {
  createDesafio1FunctionalCoverageService
} = require(
  '../services/desafio1FunctionalCoverageService'
);

const STATUS_LABELS = {
  READY: 'CONSOLIDADO',
  CONTEXT_ONLY: 'SOLO CONTEXTO',
  PARTIAL: 'PARCIAL',
  PENDING_MAPPING: 'PENDIENTE MAPEO',
  SOURCE_MISSING: 'FUENTE FALTANTE'
};

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString('es-PE');
}

async function main() {
  const service =
    createDesafio1FunctionalCoverageService();

  const report =
    await service.buildReport();

  console.log(
    '\nFASE 11 · COBERTURA FUNCIONAL DE DATOS\n'
  );

  console.log(
    `Fuentes importadas: ${report.summary.importedSources}/${report.summary.expectedSources}`
  );
  console.log(
    `Escenarios consolidados: ${report.summary.readyScenarios}`
  );
  console.log(
    `Solo contexto: ${report.summary.contextOnlyScenarios} · Parciales: ${report.summary.partialScenarios} · Pendientes de mapeo: ${report.summary.pendingMappingScenarios}`
  );

  console.log('\nFuentes:');
  report.sources.forEach(
    (source) => {
      const state =
        source.imported
          ? 'OK'
          : 'FALTA';

      console.log(
        `- ${source.label}: ${state} · ${formatNumber(source.importedRows)} filas · ${source.role}`
      );
    }
  );

  console.log('\nEscenarios/capacidades:');
  report.scenarios.forEach(
    (scenario) => {
      console.log(
        `- ${scenario.label}: ${STATUS_LABELS[scenario.status] || scenario.status}`
      );
      console.log(
        `  ${scenario.detail}`
      );
    }
  );

  console.log('\nReglas de datos confirmadas:');
  report.confirmedRules.forEach(
    (rule) => {
      console.log(
        `- ${rule.label}: ${rule.detail}`
      );
    }
  );

  console.log('\nDiagnóstico seguro:');
  console.log(
    `- Suscriptores con facturación: ${formatNumber(report.diagnostics.facturationSubscribers)}`
  );
  console.log(
    `- Clientes con más de una suscripción en PLANTA: ${formatNumber(report.diagnostics.customersWithMultipleSubscriptions)}`
  );
  console.log(
    `- Cobertura de códigos por catálogo: ${report.diagnostics.catalogChargeCoveragePct}%`
  );
  console.log(
    `- PERIOD_START_DATE utilizable: ${report.diagnostics.periodStartAvailabilityPct}%`
  );
  console.log(
    `- PERIOD_END_DATE utilizable: ${report.diagnostics.periodEndAvailabilityPct}%`
  );

  console.log(
    '\n🔒 El reporte muestra conteos agregados; no imprime SUBSCRIBER_KEY, NUM_ANEXO, customer keys ni hashes.\n'
  );
}

main().catch(
  (error) => {
    console.error(
      'No se pudo auditar la cobertura funcional:',
      error?.message || error
    );
    process.exitCode = 1;
  }
);

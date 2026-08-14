const {
  createDesafio1ScenarioMappingService
} = require(
  '../services/desafio1ScenarioMappingService'
);

const STATUS_LABELS = {
  MAPPED: 'MAPEADO',
  PARTIAL: 'PARCIAL',
  AMBIGUOUS: 'AMBIGUO',
  SEMANTICS_PENDING:
    'SEMÁNTICA PENDIENTE',
  NOT_MAPPABLE:
    'NO MAPEABLE CON LA ENTREGA ACTUAL'
};

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString('es-PE');
}

function formatEvidence(
  evidence = {}
) {
  return Object.entries(evidence)
    .map(
      ([key, value]) =>
        `${key}=${
          typeof value === 'number'
            ? formatNumber(value)
            : value
        }`
    )
    .join(' · ');
}

async function main() {
  const service =
    createDesafio1ScenarioMappingService();

  const report =
    await service.buildReport({
      force: true
    });

  console.log(
    '\nFASE 12 · MAPEO DE ESCENARIOS FINANCIEROS PENDIENTES\n'
  );

  console.log(
    `Objetivos auditados: ${report.summary.targets}`
  );
  console.log(
    `Mapeados: ${report.summary.mapped} · Parciales: ${report.summary.partial} · Ambiguos: ${report.summary.ambiguous} · Semántica pendiente: ${report.summary.semanticsPending}`
  );
  console.log(
    `Listos para convertirse en causa en Fase 13: ${report.summary.promotableNow}`
  );

  for (const mapping of report.mappings) {
    console.log(
      `\n- ${mapping.label}: ${STATUS_LABELS[mapping.status] || mapping.status} · confianza ${mapping.confidence}`
    );
    console.log(
      `  ${mapping.rationale}`
    );
    console.log(
      `  Señales: ${formatEvidence(mapping.evidence)}`
    );

    if (mapping.patterns?.length) {
      console.log(
        '  Patrones agregados más frecuentes:'
      );

      mapping.patterns
        .slice(0, 5)
        .forEach(
          (pattern) => {
            console.log(
              `    · ${pattern.chargeCode || 'sin código'} | ${pattern.description || 'sin descripción'} | ${formatNumber(pattern.rows)} filas`
            );
          }
        );
    }
  }

  console.log(
    '\nConclusión de seguridad:'
  );
  report.safeguards.forEach(
    (item) =>
      console.log(`- ${item}`)
  );

  console.log(
    '\n🔒 Esta auditoría no imprime identificadores de suscriptores ni cuentas financieras.\n'
  );
}

main().catch(
  (error) => {
    console.error(
      'No se pudo auditar el mapeo de escenarios:',
      error?.message || error
    );
    process.exitCode = 1;
  }
);

(function () {
  const elements = {
    totalInteractions:
      document.getElementById('totalInteractions'),
    endedInteractions:
      document.getElementById('endedInteractions'),
    activeInteractions:
      document.getElementById('activeInteractions'),
    completionRate:
      document.getElementById('completionRate'),
    verifiedResolutionRate:
      document.getElementById('verifiedResolutionRate'),
    verifiedResolutionDetail:
      document.getElementById('verifiedResolutionDetail'),
    handoffAccuracy:
      document.getElementById('handoffAccuracy'),
    handoffAccuracyDetail:
      document.getElementById('handoffAccuracyDetail'),
    averageSatisfaction:
      document.getElementById('averageSatisfaction'),
    ratedInteractions:
      document.getElementById('ratedInteractions'),
    positiveSatisfaction:
      document.getElementById('positiveSatisfaction'),
    satisfactionResponseRate:
      document.getElementById('satisfactionResponseRate'),
    surveyResponseDetail:
      document.getElementById('surveyResponseDetail'),
    postExplanationSilenceRate:
      document.getElementById('postExplanationSilenceRate'),
    postExplanationSilenceDetail:
      document.getElementById('postExplanationSilenceDetail'),
    repairInteractionRate:
      document.getElementById('repairInteractionRate'),
    repairInteractionDetail:
      document.getElementById('repairInteractionDetail'),
    repeatContactRate:
      document.getElementById('repeatContactRate'),
    repeatContactDetail:
      document.getElementById('repeatContactDetail'),
    handoffRate:
      document.getElementById('handoffRate'),
    handoffInteractions:
      document.getElementById('handoffInteractions'),
    averageDuration:
      document.getElementById('averageDuration'),
    averageUserMessages:
      document.getElementById('averageUserMessages'),
    totalUserMessages:
      document.getElementById('totalUserMessages'),
    totalAssistantMessages:
      document.getElementById('totalAssistantMessages'),
    runtimeP50:
      document.getElementById('runtimeP50'),
    runtimeP95:
      document.getElementById('runtimeP95'),
    runtimeSuccessRate:
      document.getElementById('runtimeSuccessRate'),
    runtimeFailureDetail:
      document.getElementById('runtimeFailureDetail'),
    runtimeSampleCount:
      document.getElementById('runtimeSampleCount'),
    endReasonBreakdown:
      document.getElementById('endReasonBreakdown'),
    handoffReasonBreakdown:
      document.getElementById('handoffReasonBreakdown'),
    interactionsTable:
      document.getElementById('interactionsTable'),
    lastUpdate:
      document.getElementById('lastUpdate'),
    connectionDot:
      document.getElementById('connectionDot'),
    refreshDashboard:
      document.getElementById('refreshDashboard'),
    releaseReadinessStatus:
      document.getElementById('releaseReadinessStatus'),
    readinessProfilesState:
      document.getElementById('readinessProfilesState'),
    readinessProfilesDetail:
      document.getElementById('readinessProfilesDetail'),
    readinessGroundingState:
      document.getElementById('readinessGroundingState'),
    readinessGroundingDetail:
      document.getElementById('readinessGroundingDetail'),
    readinessPrivacyState:
      document.getElementById('readinessPrivacyState'),
    readinessPrivacyDetail:
      document.getElementById('readinessPrivacyDetail'),
    readinessLineageState:
      document.getElementById('readinessLineageState'),
    readinessLineageDetail:
      document.getElementById('readinessLineageDetail'),
    releaseScenarioSummary:
      document.getElementById('releaseScenarioSummary'),
    releaseScenarioChips:
      document.getElementById('releaseScenarioChips'),
    dataCoverageStatus:
      document.getElementById('dataCoverageStatus'),
    coverageSourcesSummary:
      document.getElementById('coverageSourcesSummary'),
    coverageReadyScenarios:
      document.getElementById('coverageReadyScenarios'),
    coverageSubscribers:
      document.getElementById('coverageSubscribers'),
    coverageCatalogPct:
      document.getElementById('coverageCatalogPct'),
    datasetSourceGrid:
      document.getElementById('datasetSourceGrid'),
    scenarioCoverageList:
      document.getElementById('scenarioCoverageList'),
    confirmedRulesList:
      document.getElementById('confirmedRulesList'),
    scenarioMappingStatus:
      document.getElementById('scenarioMappingStatus'),
    mappingTargets:
      document.getElementById('mappingTargets'),
    mappingMapped:
      document.getElementById('mappingMapped'),
    mappingReview:
      document.getElementById('mappingReview'),
    mappingPromotable:
      document.getElementById('mappingPromotable'),
    scenarioMappingGrid:
      document.getElementById('scenarioMappingGrid'),
    scenarioMappingSafeguards:
      document.getElementById('scenarioMappingSafeguards')
  };

  let isLoading = false;
  let lastSuccessfulUpdate = null;

  function formatDuration(seconds) {
    if (
      seconds === null ||
      seconds === undefined
    ) {
      return '—';
    }

    const total =
      Math.max(0, Math.round(seconds));

    const minutes =
      Math.floor(total / 60);

    const remainingSeconds =
      total % 60;

    if (minutes === 0) {
      return `${remainingSeconds} s`;
    }

    return `${minutes} min ${remainingSeconds} s`;
  }

  function formatDate(value) {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleString(
      'es-PE',
      {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    );
  }

  function shortenSessionId(sessionId) {
    if (!sessionId) {
      return '—';
    }

    if (sessionId.length <= 18) {
      return sessionId;
    }

    return `${sessionId.slice(0, 9)}…${sessionId.slice(-5)}`;
  }

  function createCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;

    if (className) {
      td.className = className;
    }

    return td;
  }

  function createBadge(text, type) {
    const badge = document.createElement('span');
    badge.className = `status-badge ${type}`;
    badge.textContent = text;
    return badge;
  }

  function createOutcomeCell(interaction) {
    const td = document.createElement('td');

    if (interaction.status === 'ACTIVE') {
      td.appendChild(
        createBadge('En curso', 'active')
      );
      return td;
    }

    if (interaction.handoff) {
      td.appendChild(
        createBadge('Derivada', 'handoff')
      );
      return td;
    }

    if (
      interaction.closure?.resolutionStatusAtClose ===
      'RESOLVED'
    ) {
      td.appendChild(
        createBadge('Resuelta', 'resolved')
      );
      return td;
    }

    if (
      [
        'PARTIALLY_RESOLVED',
        'UNRESOLVED'
      ].includes(
        interaction.closure
          ?.resolutionStatusAtClose
      )
    ) {
      td.appendChild(
        createBadge('Cierre no resuelto', 'warning')
      );
      return td;
    }

    if (interaction.endReason === 'NEW_CHAT') {
      td.appendChild(
        createBadge('Nueva consulta', 'neutral')
      );
      return td;
    }

    if (interaction.endReason === 'TIMEOUT') {
      td.appendChild(
        createBadge('Timeout', 'warning')
      );
      return td;
    }

    td.appendChild(
      createBadge('Finalizada', 'ended')
    );

    return td;
  }

  function createHandoffCell(interaction) {
    const td = document.createElement('td');

    if (!interaction.handoff) {
      td.textContent = 'No';
      td.className = 'muted-cell';
      return td;
    }

    const link = document.createElement('a');
    link.className = 'case-link';
    link.href = interaction.handoffCaseId
      ? `/advisor?caseId=${encodeURIComponent(interaction.handoffCaseId)}`
      : '/advisor';
    link.textContent = interaction.handoffCaseId || 'Ver caso';
    link.title = 'Abrir caso en la vista del asesor';

    td.appendChild(link);
    return td;
  }

  function renderInteractions(interactions) {
    elements.interactionsTable.innerHTML = '';

    if (
      !Array.isArray(interactions) ||
      interactions.length === 0
    ) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'empty-row';
      cell.textContent = 'No hay interacciones registradas.';
      row.appendChild(cell);
      elements.interactionsTable.appendChild(row);
      return;
    }

    interactions.forEach((interaction) => {
      const row = document.createElement('tr');

      const customerLabel =
        interaction.customerName ||
        interaction.customerIdentifier ||
        'No identificado';

      const customerCell =
        createCell(customerLabel, 'customer-cell');

      if (interaction.customerIdentifier) {
        customerCell.title = interaction.customerIdentifier;
      }

      row.appendChild(customerCell);

      const sessionCell =
        createCell(
          shortenSessionId(interaction.sessionId),
          'session-cell'
        );
      sessionCell.title = interaction.sessionId || '';
      row.appendChild(sessionCell);

      row.appendChild(
        createOutcomeCell(interaction)
      );

      row.appendChild(
        createCell(
          formatDuration(interaction.durationSeconds)
        )
      );

      row.appendChild(
        createCell(
          `${interaction.userMessages || 0} / ${interaction.assistantMessages || 0}`
        )
      );

      row.appendChild(
        createHandoffCell(interaction)
      );

      row.appendChild(
        createCell(
          interaction.satisfaction
            ? `${interaction.satisfaction.rating}/5`
            : 'Sin respuesta',
          interaction.satisfaction
            ? ''
            : 'muted-cell'
        )
      );

      row.appendChild(
        createCell(
          formatDate(interaction.startedAt)
        )
      );

      elements.interactionsTable.appendChild(row);
    });
  }

  function renderBreakdown(container, items, emptyText) {
    container.innerHTML = '';

    const meaningfulItems =
      Array.isArray(items)
        ? items.filter((item) => item.count > 0)
        : [];

    if (!meaningfulItems.length) {
      const empty = document.createElement('div');
      empty.className = 'breakdown-empty';
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    meaningfulItems.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'breakdown-item';

      const top = document.createElement('div');
      top.className = 'breakdown-top';

      const label = document.createElement('span');
      label.textContent = item.label;

      const value = document.createElement('strong');
      value.textContent = `${item.count} · ${item.rate}%`;

      top.appendChild(label);
      top.appendChild(value);

      const track = document.createElement('div');
      track.className = 'progress-track';

      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      bar.style.width = `${Math.min(100, Math.max(0, item.rate || 0))}%`;

      track.appendChild(bar);
      wrapper.appendChild(top);
      wrapper.appendChild(track);
      container.appendChild(wrapper);
    });
  }

  function renderSummary(data) {
    const total = data.totalInteractions ?? 0;
    const ended = data.endedInteractions ?? 0;
    const rated = data.ratedInteractions ?? 0;
    const ratedEnded = data.ratedEndedInteractions ?? rated;

    elements.totalInteractions.textContent = total;
    elements.endedInteractions.textContent = ended;
    elements.activeInteractions.textContent = data.activeInteractions ?? 0;
    elements.completionRate.textContent = `${data.completionRate ?? 0}% de cierre`;

    elements.verifiedResolutionRate.textContent = `${data.verifiedResolutionRate ?? 0}%`;
    elements.verifiedResolutionDetail.textContent =
      `${data.verifiedResolutionInteractions ?? 0} de ${data.measurableResolutionInteractions ?? 0} cierres medibles`;

    const handoffBenchmark = data.handoffAccuracyBenchmark || {};
    elements.handoffAccuracy.textContent =
      `${handoffBenchmark.decisionAccuracy ?? 0}%`;
    elements.handoffAccuracyDetail.textContent =
      `${handoffBenchmark.correctCases ?? 0} de ${handoffBenchmark.totalCases ?? 0} casos etiquetados`;

    elements.handoffRate.textContent = `${data.handoffRate ?? 0}%`;
    elements.handoffInteractions.textContent =
      `${data.handoffInteractions ?? 0} derivaciones de ${total} interacciones`;

    elements.averageSatisfaction.textContent =
      data.averageSatisfaction === null
        ? '—'
        : `${data.averageSatisfaction}/5`;

    elements.ratedInteractions.textContent = `${rated} respuestas`;

    elements.positiveSatisfaction.textContent = rated
      ? `${data.positiveSatisfactionRate ?? 0}% de las valoraciones fueron 4 o 5.`
      : 'Sin calificaciones todavía.';

    elements.satisfactionResponseRate.textContent =
      `${data.satisfactionResponseRate ?? 0}%`;
    elements.surveyResponseDetail.textContent =
      `${ratedEnded} de ${ended} finalizadas con valoración`;

    elements.postExplanationSilenceRate.textContent =
      `${data.postExplanationSilenceRate ?? 0}%`;
    elements.postExplanationSilenceDetail.textContent =
      `${data.postExplanationSilenceInteractions ?? 0} cierres directos tras RESOLVED`;

    elements.repairInteractionRate.textContent =
      `${data.repairInteractionRate ?? 0}%`;
    elements.repairInteractionDetail.textContent =
      `${data.repairInteractions ?? 0} interacciones · ${data.repeatedRepairInteractions ?? 0} alcanzaron 2 reformulaciones`;

    elements.repeatContactRate.textContent = `${data.repeatContactRate ?? 0}%`;
    elements.repeatContactDetail.textContent =
      `${data.repeatContactInteractions ?? 0} repetidos · ${data.uniqueCustomers ?? 0} clientes identificados`;

    elements.averageDuration.textContent =
      formatDuration(data.averageDurationSeconds);

    elements.averageUserMessages.textContent =
      `${data.averageUserMessages ?? 0} por interacción`;

    elements.totalUserMessages.textContent = data.totalUserMessages ?? 0;
    elements.totalAssistantMessages.textContent = data.totalAssistantMessages ?? 0;

    const performance = data.performance || {};
    const runtimeSampleCount = performance.sampleCount ?? 0;
    const formatLatency = (value) =>
      Number.isFinite(Number(value))
        ? `${Number(value).toFixed(0)} ms`
        : '—';

    elements.runtimeP50.textContent =
      formatLatency(performance.p50Ms);
    elements.runtimeP95.textContent =
      formatLatency(performance.p95Ms);
    elements.runtimeSuccessRate.textContent =
      runtimeSampleCount
        ? `${performance.successRate ?? 0}%`
        : '—';
    elements.runtimeFailureDetail.textContent =
      runtimeSampleCount
        ? `${performance.failureCount ?? 0} fallos en ventana local`
        : 'Sin muestras';
    elements.runtimeSampleCount.textContent =
      runtimeSampleCount;

    renderBreakdown(
      elements.endReasonBreakdown,
      data.endReasonBreakdown,
      'Todavía no hay conversaciones finalizadas.'
    );

    renderBreakdown(
      elements.handoffReasonBreakdown,
      data.handoffReasonBreakdown,
      'Todavía no hay casos derivados.'
    );

    renderInteractions(data.recentInteractions || []);
  }

  function getReadinessCheck(
    report,
    id
  ) {
    return (
      report?.checks || []
    ).find(
      (check) =>
        check.id === id
    ) || null;
  }

  function setReadinessCard(
    stateElement,
    detailElement,
    check,
    successLabel = 'OK'
  ) {
    const ok =
      check?.ok === true;

    stateElement.textContent =
      ok
        ? successLabel
        : 'Revisar';

    stateElement.className =
      `readiness-check-state ${ok ? 'ready' : 'review'}`;

    detailElement.textContent =
      check?.detail ||
      'No se pudo verificar este control.';
  }

  function renderReleaseReadiness(
    report
  ) {
    const ready =
      report?.ready === true;

    elements.releaseReadinessStatus.textContent =
      ready
        ? 'Release listo'
        : 'Revisar';

    elements.releaseReadinessStatus.className =
      `release-readiness-pill ${ready ? 'ready' : 'review'}`;

    setReadinessCard(
      elements.readinessProfilesState,
      elements.readinessProfilesDetail,
      getReadinessCheck(
        report,
        'PROFILE_COVERAGE'
      ),
      `${report?.summary?.readyProfiles ?? 0}/${report?.summary?.expectedProfiles ?? 0}`
    );

    setReadinessCard(
      elements.readinessGroundingState,
      elements.readinessGroundingDetail,
      getReadinessCheck(
        report,
        'FINANCIAL_GROUNDING'
      ),
      'Verificado'
    );

    const privacyCheck =
      getReadinessCheck(
        report,
        'PUBLIC_PAYLOAD_PRIVACY'
      );

    const copyCheck =
      getReadinessCheck(
        report,
        'CUSTOMER_COPY_SAFE'
      );

    const privacyOk =
      privacyCheck?.ok === true &&
      copyCheck?.ok === true;

    elements.readinessPrivacyState.textContent =
      privacyOk
        ? 'Protegido'
        : 'Revisar';
    elements.readinessPrivacyState.className =
      `readiness-check-state ${privacyOk ? 'ready' : 'review'}`;
    elements.readinessPrivacyDetail.textContent =
      privacyOk
        ? 'Sin identificadores oficiales ni nombres internos en la experiencia pública.'
        : [
            privacyCheck?.detail,
            copyCheck?.detail
          ]
            .filter(Boolean)
            .join(' ');

    setReadinessCard(
      elements.readinessLineageState,
      elements.readinessLineageDetail,
      getReadinessCheck(
        report,
        'DATA_LINEAGE'
      ),
      `${report?.summary?.lineageSources ?? 0}/${report?.summary?.expectedLineageSources ?? 0}`
    );

    const scenarios =
      report?.profiles || [];

    elements.releaseScenarioChips.innerHTML = '';

    scenarios.forEach(
      (profile) => {
        const chip =
          document.createElement(
            'span'
          );

        chip.className =
          `release-scenario-chip ${profile.ready ? 'ready' : 'review'}`;

        chip.textContent =
          `${profile.name || profile.customerId} · ${profile.scenarioLabel || profile.scenario || 'sin escenario'}`;

        elements.releaseScenarioChips.appendChild(
          chip
        );
      }
    );

    elements.releaseScenarioSummary.textContent =
      ready
        ? `${report.summary?.distinctScenarios ?? 0} escenarios críticos listos para la demostración`
        : 'El preflight detectó controles que deben revisarse antes del pitch';
  }

  function renderReleaseReadinessError() {
    elements.releaseReadinessStatus.textContent =
      'Sin verificar';
    elements.releaseReadinessStatus.className =
      'release-readiness-pill review';

    [
      [
        elements.readinessProfilesState,
        elements.readinessProfilesDetail
      ],
      [
        elements.readinessGroundingState,
        elements.readinessGroundingDetail
      ],
      [
        elements.readinessPrivacyState,
        elements.readinessPrivacyDetail
      ],
      [
        elements.readinessLineageState,
        elements.readinessLineageDetail
      ]
    ].forEach(
      ([state, detail]) => {
        state.textContent = 'Revisar';
        state.className =
          'readiness-check-state review';
        detail.textContent =
          'No se pudo consultar el preflight del Release 1.';
      }
    );

    elements.releaseScenarioSummary.textContent =
      'Verifica la configuración local antes de iniciar la demo.';
    elements.releaseScenarioChips.innerHTML = '';
  }

  async function loadReleaseReadiness(
    signal
  ) {
    try {
      const response =
        await fetch(
          '/api/demo/release/readiness',
          {
            cache: 'no-store',
            signal
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const report =
        await response.json();

      renderReleaseReadiness(
        report
      );
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(
          '[DASHBOARD] Preflight:',
          error
        );
      }

      renderReleaseReadinessError();
    }
  }

  function formatCompactNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '—';
    }

    return Math.round(number)
      .toLocaleString('es-PE');
  }

  function coverageStatusLabel(status) {
    const labels = {
      READY: 'Consolidado',
      CONTEXT_ONLY: 'Solo contexto',
      PARTIAL: 'Parcial',
      PENDING_MAPPING: 'Pendiente mapeo',
      SOURCE_MISSING: 'Fuente faltante'
    };

    return labels[status] || status || 'Revisar';
  }

  function coverageStatusClass(status) {
    if (status === 'READY') {
      return 'ready';
    }

    if (status === 'CONTEXT_ONLY') {
      return 'context';
    }

    if (
      status === 'PARTIAL' ||
      status === 'PENDING_MAPPING'
    ) {
      return 'review';
    }

    return 'danger';
  }

  function renderDataCoverage(report) {
    const summary = report?.summary || {};
    const diagnostics = report?.diagnostics || {};
    const allSources =
      summary.allSourcesImported === true;

    elements.dataCoverageStatus.textContent =
      allSources
        ? '8 fuentes integradas'
        : 'Revisar fuentes';
    elements.dataCoverageStatus.className =
      `release-readiness-pill ${allSources ? 'ready' : 'review'}`;

    elements.coverageSourcesSummary.textContent =
      `${summary.importedSources ?? 0}/${summary.expectedSources ?? 0}`;
    elements.coverageReadyScenarios.textContent =
      summary.readyScenarios ?? 0;
    elements.coverageSubscribers.textContent =
      formatCompactNumber(
        diagnostics.facturationSubscribers
      );
    elements.coverageCatalogPct.textContent =
      `${diagnostics.catalogChargeCoveragePct ?? 0}%`;

    elements.datasetSourceGrid.innerHTML = '';

    (report?.sources || []).forEach(
      (source) => {
        const card = document.createElement('div');
        card.className = 'dataset-source-card';

        const top = document.createElement('div');
        top.className = 'dataset-source-top';

        const name = document.createElement('strong');
        name.textContent = source.label;

        const badge = document.createElement('span');
        badge.className =
          `coverage-status-badge ${source.imported ? 'ready' : 'danger'}`;
        badge.textContent =
          source.imported ? 'Importado' : 'Falta';

        top.appendChild(name);
        top.appendChild(badge);

        const role = document.createElement('p');
        role.textContent = source.role;

        const meta = document.createElement('small');
        meta.textContent =
          `${formatCompactNumber(source.importedRows)} filas · ${source.usage}`;

        card.appendChild(top);
        card.appendChild(role);
        card.appendChild(meta);
        elements.datasetSourceGrid.appendChild(card);
      }
    );

    elements.scenarioCoverageList.innerHTML = '';

    (report?.scenarios || []).forEach(
      (scenario) => {
        const item = document.createElement('div');
        item.className = 'scenario-coverage-item';

        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = scenario.label;
        const detail = document.createElement('p');
        detail.textContent = scenario.detail;
        copy.appendChild(title);
        copy.appendChild(detail);

        const badge = document.createElement('span');
        badge.className =
          `coverage-status-badge ${coverageStatusClass(scenario.status)}`;
        badge.textContent =
          coverageStatusLabel(scenario.status);

        item.appendChild(copy);
        item.appendChild(badge);
        elements.scenarioCoverageList.appendChild(item);
      }
    );

    elements.confirmedRulesList.innerHTML = '';

    (report?.confirmedRules || []).forEach(
      (rule) => {
        const chip = document.createElement('span');
        chip.className = 'confirmed-rule-chip';
        chip.textContent = `${rule.label}: ${rule.detail}`;
        elements.confirmedRulesList.appendChild(chip);
      }
    );
  }

  function renderDataCoverageError() {
    elements.dataCoverageStatus.textContent = 'Sin verificar';
    elements.dataCoverageStatus.className =
      'release-readiness-pill review';
    elements.coverageSourcesSummary.textContent = '—';
    elements.coverageReadyScenarios.textContent = '—';
    elements.coverageSubscribers.textContent = '—';
    elements.coverageCatalogPct.textContent = '—';
    elements.datasetSourceGrid.innerHTML =
      '<div class="coverage-empty">No se pudo consultar la auditoría funcional.</div>';
    elements.scenarioCoverageList.innerHTML = '';
    elements.confirmedRulesList.innerHTML = '';
  }

  async function loadDataCoverage(signal) {
    try {
      const response = await fetch(
        '/api/demo/data-coverage',
        {
          cache: 'no-store',
          signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      renderDataCoverage(
        await response.json()
      );
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(
          '[DASHBOARD] Cobertura funcional:',
          error
        );
      }

      renderDataCoverageError();
    }
  }

  function mappingStatusLabel(status) {
    const labels = {
      MAPPED: 'Mapeado',
      PARTIAL: 'Parcial',
      AMBIGUOUS: 'Ambiguo',
      SEMANTICS_PENDING: 'Semántica pendiente',
      NOT_MAPPABLE: 'No mapeable'
    };

    return labels[status] || status || 'Revisar';
  }

  function mappingStatusClass(status) {
    if (status === 'MAPPED') {
      return 'ready';
    }

    if (status === 'SEMANTICS_PENDING') {
      return 'context';
    }

    if (
      status === 'PARTIAL' ||
      status === 'AMBIGUOUS'
    ) {
      return 'review';
    }

    return 'danger';
  }

  function evidenceLabel(key) {
    const labels = {
      billingRows: 'filas de facturación',
      billingCodes: 'códigos',
      billingSubscribers: 'suscriptores',
      oneShotRows: 'paquetes únicos',
      recurringRows: 'paquetes recurrentes',
      packageOrderRows: 'órdenes de paquetes',
      explicitEquipmentChargeRows: 'cargos explícitos equipo/cuota',
      financingKeywordRows: 'señales de financiamiento',
      financingDebtRows: 'financiamiento de deuda',
      equipmentSubgroupRows: 'subgrupo EQUIPOS',
      equipmentOrderRows: 'órdenes relacionadas con equipo',
      trafficRows: 'tráfico adicional',
      trafficSubscribers: 'suscriptores con tráfico',
      roamingRows: 'roaming',
      roamingSubscribers: 'suscriptores con roaming',
      recurringServiceRows: 'servicios recurrentes adicionales',
      otherUniqueRows: 'otros cargos únicos',
      suspensionOrderRows: 'órdenes de suspensión/corte',
      suspensionSubscribers: 'suscriptores con suspensión/corte',
      explicitSuspensionChargeRows: 'cargos explícitos por suspensión',
      nearbyProportionalInvoices: 'recibos proporcionales cercanos',
      totalRows: 'notas',
      crdRows: 'tipo CRD',
      dscRows: 'tipo DSC',
      crdNegativePct: 'CRD con monto negativo',
      dscPositivePct: 'DSC con monto positivo',
      matchedSubscriberCodeRows: 'notas cruzables por suscripción+código',
      matchedSameCycleRows: 'notas cruzables en el mismo ciclo',
      matchedSameCyclePct: 'cruce mismo ciclo'
    };

    return labels[key] || key;
  }

  function formatEvidenceValue(key, value) {
    if (
      key.endsWith('Pct') ||
      key.toLowerCase().includes('percent')
    ) {
      return `${Number(value || 0)}%`;
    }

    return formatCompactNumber(value);
  }

  function renderScenarioMapping(report) {
    const summary = report?.summary || {};
    const reviewCount =
      Number(summary.partial || 0) +
      Number(summary.ambiguous || 0) +
      Number(summary.semanticsPending || 0) +
      Number(summary.notMappable || 0);

    elements.scenarioMappingStatus.textContent =
      `${summary.targets ?? 0} escenarios auditados`;
    elements.scenarioMappingStatus.className =
      'release-readiness-pill ready';
    elements.mappingTargets.textContent =
      summary.targets ?? 0;
    elements.mappingMapped.textContent =
      summary.mapped ?? 0;
    elements.mappingReview.textContent =
      reviewCount;
    elements.mappingPromotable.textContent =
      summary.promotableNow ?? 0;

    elements.scenarioMappingGrid.innerHTML = '';

    (report?.mappings || []).forEach(
      (mapping) => {
        const card = document.createElement('article');
        card.className = 'scenario-mapping-card';

        const top = document.createElement('div');
        top.className = 'scenario-mapping-card-top';

        const title = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = mapping.label;
        const confidence = document.createElement('small');
        confidence.textContent =
          `Confianza del mapeo: ${mapping.confidence || '—'}`;
        title.appendChild(name);
        title.appendChild(confidence);

        const badge = document.createElement('span');
        badge.className =
          `coverage-status-badge ${mappingStatusClass(mapping.status)}`;
        badge.textContent =
          mappingStatusLabel(mapping.status);

        top.appendChild(title);
        top.appendChild(badge);

        const rationale = document.createElement('p');
        rationale.textContent = mapping.rationale;

        const evidence = document.createElement('div');
        evidence.className = 'mapping-evidence-grid';

        Object.entries(mapping.evidence || {})
          .slice(0, 6)
          .forEach(([key, value]) => {
            const item = document.createElement('div');
            const label = document.createElement('span');
            const metric = document.createElement('strong');
            label.textContent = evidenceLabel(key);
            metric.textContent =
              formatEvidenceValue(key, value);
            item.appendChild(label);
            item.appendChild(metric);
            evidence.appendChild(item);
          });

        card.appendChild(top);
        card.appendChild(rationale);
        card.appendChild(evidence);

        if (mapping.patterns?.length) {
          const patterns = document.createElement('div');
          patterns.className = 'mapping-patterns';

          mapping.patterns
            .slice(0, 3)
            .forEach((pattern) => {
              const chip = document.createElement('span');
              chip.textContent =
                `${pattern.description || pattern.chargeCode || 'Concepto'} · ${formatCompactNumber(pattern.rows)} filas`;
              patterns.appendChild(chip);
            });

          card.appendChild(patterns);
        }

        elements.scenarioMappingGrid.appendChild(card);
      }
    );

    elements.scenarioMappingSafeguards.innerHTML = '';
    (report?.safeguards || []).forEach(
      (item) => {
        const chip = document.createElement('span');
        chip.className = 'mapping-safeguard-chip';
        chip.textContent = item;
        elements.scenarioMappingSafeguards.appendChild(chip);
      }
    );
  }

  function renderScenarioMappingError() {
    elements.scenarioMappingStatus.textContent = 'Sin verificar';
    elements.scenarioMappingStatus.className =
      'release-readiness-pill review';
    elements.mappingTargets.textContent = '—';
    elements.mappingMapped.textContent = '—';
    elements.mappingReview.textContent = '—';
    elements.mappingPromotable.textContent = '—';
    elements.scenarioMappingGrid.innerHTML =
      '<div class="coverage-empty">No se pudo consultar el mapeo de escenarios.</div>';
    elements.scenarioMappingSafeguards.innerHTML = '';
  }

  async function loadScenarioMapping(signal) {
    try {
      const response = await fetch(
        '/api/demo/scenario-mapping',
        {
          cache: 'no-store',
          signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      renderScenarioMapping(
        await response.json()
      );
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(
          '[DASHBOARD] Mapeo de escenarios:',
          error
        );
      }

      renderScenarioMappingError();
    }
  }

  function setConnectionState(state, message) {
    elements.connectionDot.className = `connection-dot ${state}`;
    elements.lastUpdate.textContent = message;
  }

  async function loadDashboard() {
    if (isLoading) {
      return;
    }

    isLoading = true;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      5000
    );

    try {
      elements.refreshDashboard.disabled = true;
      elements.refreshDashboard.textContent = 'Actualizando...';
      setConnectionState('loading', 'Actualizando métricas...');

      const readinessPromise =
        loadReleaseReadiness(
          controller.signal
        );

      const dataCoveragePromise =
        loadDataCoverage(
          controller.signal
        );

      const scenarioMappingPromise =
        loadScenarioMapping(
          controller.signal
        );

      const response = await fetch(
        '/api/metrics/dashboard',
        {
          cache: 'no-store',
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      renderSummary(data);
      await Promise.all([
        readinessPromise,
        dataCoveragePromise,
        scenarioMappingPromise
      ]);

      lastSuccessfulUpdate = new Date();
      setConnectionState(
        'online',
        `Actualizado: ${lastSuccessfulUpdate.toLocaleTimeString('es-PE')}`
      );

      elements.refreshDashboard.textContent = 'Actualizar';
    } catch (error) {
      console.error('[DASHBOARD] Error:', error);

      const lastGood = lastSuccessfulUpdate
        ? `Último dato: ${lastSuccessfulUpdate.toLocaleTimeString('es-PE')}`
        : 'Sin datos confirmados';

      setConnectionState(
        'offline',
        `No se pudo actualizar · ${lastGood}`
      );

      elements.refreshDashboard.textContent = 'Reintentar';
    } finally {
      clearTimeout(timeout);
      elements.refreshDashboard.disabled = false;
      isLoading = false;
    }
  }

  elements.refreshDashboard.addEventListener(
    'click',
    loadDashboard
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
      }
    }
  );

  loadDashboard();

  setInterval(
    () => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
      }
    },
    10000
  );
})();

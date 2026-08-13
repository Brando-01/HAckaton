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
    digitalResolutionRate:
      document.getElementById('digitalResolutionRate'),
    digitalResolutionDetail:
      document.getElementById('digitalResolutionDetail'),
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
    unratedEndedRate:
      document.getElementById('unratedEndedRate'),
    unratedEndedDetail:
      document.getElementById('unratedEndedDetail'),
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
      document.getElementById('releaseScenarioChips')
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

    if (interaction.endReason === 'USER_ENDED') {
      td.appendChild(
        createBadge('Resolución digital*', 'resolved')
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

    elements.digitalResolutionRate.textContent = `${data.digitalResolutionRate ?? 0}%`;
    elements.digitalResolutionDetail.textContent =
      `${data.digitalResolutionInteractions ?? 0} de ${ended} finalizadas sin derivación`;

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

    elements.unratedEndedRate.textContent = `${data.unratedEndedRate ?? 0}%`;
    elements.unratedEndedDetail.textContent =
      `${data.unratedEndedInteractions ?? 0} finalizadas sin valoración`;

    elements.repeatContactRate.textContent = `${data.repeatContactRate ?? 0}%`;
    elements.repeatContactDetail.textContent =
      `${data.repeatContactInteractions ?? 0} repetidos · ${data.uniqueCustomers ?? 0} clientes identificados`;

    elements.averageDuration.textContent =
      formatDuration(data.averageDurationSeconds);

    elements.averageUserMessages.textContent =
      `${data.averageUserMessages ?? 0} por interacción`;

    elements.totalUserMessages.textContent = data.totalUserMessages ?? 0;
    elements.totalAssistantMessages.textContent = data.totalAssistantMessages ?? 0;

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
      await readinessPromise;

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

(function () {
  const elements = {
    totalInteractions:
      document.getElementById(
        'totalInteractions'
      ),

    endedInteractions:
      document.getElementById(
        'endedInteractions'
      ),

    activeInteractions:
      document.getElementById(
        'activeInteractions'
      ),

    averageSatisfaction:
      document.getElementById(
        'averageSatisfaction'
      ),

    ratedInteractions:
      document.getElementById(
        'ratedInteractions'
      ),

    handoffRate:
      document.getElementById(
        'handoffRate'
      ),

    handoffInteractions:
      document.getElementById(
        'handoffInteractions'
      ),

    averageDuration:
      document.getElementById(
        'averageDuration'
      ),

    totalUserMessages:
      document.getElementById(
        'totalUserMessages'
      ),

    totalAssistantMessages:
      document.getElementById(
        'totalAssistantMessages'
      ),

    interactionsTable:
      document.getElementById(
        'interactionsTable'
      ),

    lastUpdate:
      document.getElementById(
        'lastUpdate'
      ),

    refreshDashboard:
      document.getElementById(
        'refreshDashboard'
      )
  };


  function formatDuration(seconds) {
    if (
      seconds === null ||
      seconds === undefined
    ) {
      return '—';
    }

    const total =
      Math.max(
        0,
        Math.round(seconds)
      );

    const minutes =
      Math.floor(total / 60);

    const remainingSeconds =
      total % 60;

    if (minutes === 0) {
      return `${remainingSeconds} s`;
    }

    return (
      `${minutes} min ` +
      `${remainingSeconds} s`
    );
  }


  function formatDate(value) {
    if (!value) {
      return '—';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—';
    }

    return date.toLocaleString(
      'es-PE',
      {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    );
  }


  function shortenSessionId(
    sessionId
  ) {
    if (!sessionId) {
      return '—';
    }

    if (
      sessionId.length <= 18
    ) {
      return sessionId;
    }

    return (
      `${sessionId.slice(0, 10)}…` +
      `${sessionId.slice(-6)}`
    );
  }


  function createCell(text) {
    const td =
      document.createElement('td');

    td.textContent =
      text;

    return td;
  }


  function createStatusCell(
    interaction
  ) {
    const td =
      document.createElement('td');

    const badge =
      document.createElement('span');

    badge.className =
      interaction.status === 'ENDED'
        ? 'status-badge ended'
        : 'status-badge active';

    badge.textContent =
      interaction.status === 'ENDED'
        ? 'Finalizada'
        : 'En curso';

    td.appendChild(badge);

    return td;
  }


  function renderInteractions(
    interactions
  ) {
    elements.interactionsTable
      .innerHTML = '';

    if (
      !Array.isArray(interactions) ||
      interactions.length === 0
    ) {
      const row =
        document.createElement('tr');

      const cell =
        document.createElement('td');

      cell.colSpan = 7;

      cell.className =
        'empty-row';

      cell.textContent =
        'No hay interacciones registradas.';

      row.appendChild(cell);

      elements.interactionsTable
        .appendChild(row);

      return;
    }


    interactions.forEach(
      (interaction) => {
        const row =
          document.createElement('tr');


        const sessionCell =
          createCell(
            shortenSessionId(
              interaction.sessionId
            )
          );

        sessionCell.title =
          interaction.sessionId ||
          '';

        row.appendChild(
          sessionCell
        );


        row.appendChild(
          createStatusCell(
            interaction
          )
        );


        row.appendChild(
          createCell(
            formatDuration(
              interaction.durationSeconds
            )
          )
        );


        row.appendChild(
          createCell(
            `${
              interaction.userMessages || 0
            } / ${
              interaction.assistantMessages || 0
            }`
          )
        );


        row.appendChild(
          createCell(
            interaction.handoff
              ? (
                  interaction
                    .handoffCaseId ||
                  'Sí'
                )
              : 'No'
          )
        );


        row.appendChild(
          createCell(
            interaction.satisfaction
              ? `${interaction.satisfaction.rating}/5`
              : 'Sin respuesta'
          )
        );


        row.appendChild(
          createCell(
            formatDate(
              interaction.startedAt
            )
          )
        );


        elements.interactionsTable
          .appendChild(row);
      }
    );
  }


  function renderSummary(data) {
    elements.totalInteractions
      .textContent =
      data.totalInteractions ?? 0;

    elements.endedInteractions
      .textContent =
      data.endedInteractions ?? 0;

    elements.activeInteractions
      .textContent =
      data.activeInteractions ?? 0;


    elements.averageSatisfaction
      .textContent =
      data.averageSatisfaction === null
        ? '—'
        : `${data.averageSatisfaction}/5`;


    elements.ratedInteractions
      .textContent =
      `${data.ratedInteractions ?? 0} respuestas`;


    elements.handoffRate
      .textContent =
      `${data.handoffRate ?? 0}%`;


    elements.handoffInteractions
      .textContent =
      `${
        data.handoffInteractions ?? 0
      } derivaciones`;


    elements.averageDuration
      .textContent =
      formatDuration(
        data.averageDurationSeconds
      );


    elements.totalUserMessages
      .textContent =
      data.totalUserMessages ?? 0;


    elements.totalAssistantMessages
      .textContent =
      data.totalAssistantMessages ?? 0;


    renderInteractions(
      data.recentInteractions || []
    );


    elements.lastUpdate
      .textContent =
      `Actualizado: ${
        new Date().toLocaleTimeString(
          'es-PE'
        )
      }`;
  }


  async function loadDashboard() {
    try {
      if (
        elements.refreshDashboard
      ) {
        elements.refreshDashboard
          .disabled = true;

        elements.refreshDashboard
          .textContent =
          'Actualizando...';
      }


      const response =
        await fetch(
          '/api/metrics/dashboard',
          {
            cache: 'no-store'
          }
        );


      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }


      const data =
        await response.json();


      renderSummary(data);

    } catch (error) {
      console.error(
        '[DASHBOARD] Error:',
        error
      );

      elements.lastUpdate
        .textContent =
        'No se pudo actualizar';

    } finally {
      if (
        elements.refreshDashboard
      ) {
        elements.refreshDashboard
          .disabled = false;

        elements.refreshDashboard
          .textContent =
          'Actualizar';
      }
    }
  }


  if (
    elements.refreshDashboard
  ) {
    elements.refreshDashboard
      .addEventListener(
        'click',
        loadDashboard
      );
  }


  loadDashboard();


  // Actualización automática.
  setInterval(
    loadDashboard,
    5000
  );
})();
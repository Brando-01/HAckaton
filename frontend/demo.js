(function () {
  const card =
    document.getElementById(
      'releaseStatusCard'
    );

  const title =
    document.getElementById(
      'releaseStatusTitle'
    );

  const detail =
    document.getElementById(
      'releaseStatusDetail'
    );

  const pill =
    document.getElementById(
      'releaseStatePill'
    );

  const chips =
    document.getElementById(
      'releaseProfileChips'
    );

  function renderProfiles(
    profiles = []
  ) {
    chips.innerHTML = '';

    profiles.forEach(
      (profile) => {
        const chip =
          document.createElement(
            'span'
          );

        chip.className =
          `release-profile-chip ${profile.ready ? 'ready' : 'review'}`;

        chip.textContent =
          `${profile.name || profile.customerId} · ${profile.scenarioLabel || profile.scenario || 'sin escenario'}`;

        chips.appendChild(chip);
      }
    );
  }

  function render(report) {
    const ready =
      report?.ready === true;

    card.className =
      `release-status-card ${ready ? 'ready' : 'review'}`;

    pill.textContent =
      ready
        ? 'Demo lista'
        : 'Revisar';

    title.textContent =
      ready
        ? 'Release 1 listo para ensayo de pitch'
        : 'El Release 1 necesita una revisión local';

    if (ready) {
      const profiles =
        report.summary?.readyProfiles || 0;
      const expected =
        report.summary?.expectedProfiles || 0;
      const scenarios =
        report.summary?.distinctScenarios || 0;
      const sources =
        report.summary?.lineageSources || 0;

      detail.textContent =
        `${profiles}/${expected} perfiles validados · ${scenarios} escenarios críticos · ${sources} fuentes con trazabilidad. Grounding financiero y privacidad listos para la demostración.`;
    } else {
      const failed =
        (report?.checks || [])
          .filter(
            (check) =>
              check.critical !== false &&
              !check.ok
          );

      detail.textContent =
        failed.length
          ? failed
              .slice(0, 2)
              .map(
                (check) =>
                  check.detail
              )
              .join(' ')
          : 'Ejecuta npm run demo:preflight:desafio1 en backend para ver qué control requiere atención.';
    }

    renderProfiles(
      report?.profiles || []
    );
  }

  async function load() {
    try {
      const response =
        await fetch(
          '/api/demo/release/readiness',
          {
            cache: 'no-store'
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const report =
        await response.json();

      render(report);
    } catch (error) {
      card.className =
        'release-status-card review';
      pill.textContent =
        'Sin verificar';
      title.textContent =
        'No se pudo ejecutar el preflight';
      detail.textContent =
        'No se pudo validar la preparación. Revisa el backend antes de iniciar la demostración.';
      chips.innerHTML = '';
    }
  }

  load();
})();

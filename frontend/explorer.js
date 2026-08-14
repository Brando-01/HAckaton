(function () {
  const state = {
    page: 1,
    pageSize: 24,
    totalPages: 1,
    loading: false,
    timer: null
  };

  const byId =
    (id) =>
      document.getElementById(id);

  const elements = {
    badge: byId('coverageBadge'),
    scanned: byId('statScanned'),
    scannedDetail: byId('statScannedDetail'),
    consultable: byId('statConsultable'),
    consultableDetail: byId('statConsultableDetail'),
    explainable: byId('statExplainable'),
    explainableDetail: byId('statExplainableDetail'),
    high: byId('statHigh'),
    highDetail: byId('statHighDetail'),
    premium: byId('statPremium'),
    premiumDetail: byId('statPremiumDetail'),
    search: byId('searchInput'),
    capability: byId('capabilitySelect'),
    scenario: byId('scenarioSelect'),
    rentType: byId('rentTypeSelect'),
    sort: byId('sortSelect'),
    form: byId('filtersForm'),
    reset: byId('resetFilters'),
    grid: byId('profilesGrid'),
    loading: byId('loadingState'),
    error: byId('errorState'),
    summary: byId('resultsSummary'),
    pagination: byId('pagination'),
    previous: byId('previousPage'),
    next: byId('nextPage'),
    pageIndicator: byId('pageIndicator')
  };

  const numberFormat =
    new Intl.NumberFormat('es-PE');

  function formatNumber(value) {
    return numberFormat.format(
      Number(value || 0)
    );
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  function scenarioLabel(code) {
    const labels = {
      RECONNECTION: 'Reconexión',
      ACTIVE_DISCOUNT: 'Descuento vigente',
      PRORATION: 'Prorrateo',
      DISCOUNT_ENDED: 'Fin de descuento/promoción',
      DISCOUNT_REMOVED: 'Descuento retirado',
      PLAN_CHANGE: 'Cambio de plan',
      PACKAGES: 'Paquetes adicionales'
    };

    return labels[code] ||
      'Sin causa reconocida';
  }

  function tierLabel(tier) {
    const labels = {
      CONSULTABLE: 'Consultable',
      COMPARABLE: 'Comparable',
      EXPLAINABLE: 'Explicable',
      HIGH_CONFIDENCE: 'Evidencia HIGH',
      DEMO_PREMIUM: 'Premium'
    };

    return labels[tier] ||
      tier || 'Consultable';
  }

  function directionLabel(direction) {
    if (direction === 'UP') {
      return 'Recibo subió';
    }
    if (direction === 'DOWN') {
      return 'Recibo bajó';
    }
    if (direction === 'SAME') {
      return 'Sin variación neta';
    }
    return 'Sin comparación monetaria';
  }

  function createElement(tag, className, text) {
    const element =
      document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function addBadge(container, text, className = '') {
    const badge =
      createElement(
        'span',
        `badge ${className}`.trim(),
        text
      );
    container.appendChild(badge);
  }

  function createMetaBox(label, value) {
    const box =
      createElement('div', 'meta-box');
    box.appendChild(
      createElement('span', '', label)
    );
    box.appendChild(
      createElement('strong', '', value)
    );
    return box;
  }

  function renderProfile(profile) {
    const card =
      createElement(
        'article',
        'profile-card'
      );

    if (profile.demoPremium) {
      card.classList.add('premium');
    } else if (profile.highConfidence) {
      card.classList.add('high');
    }

    const top =
      createElement('div', 'profile-top');
    const title =
      createElement('div');
    title.appendChild(
      createElement(
        'div',
        'demo-id',
        profile.demoId
      )
    );
    title.appendChild(
      createElement(
        'div',
        'profile-scenario',
        profile.primaryScenarioLabel
      )
    );

    const badges =
      createElement('div', 'badges');

    if (profile.demoPremium) {
      addBadge(
        badges,
        'Premium',
        'premium'
      );
    }
    if (profile.highConfidence) {
      addBadge(
        badges,
        'HIGH',
        'high'
      );
    }
    if (profile.comparable) {
      addBadge(
        badges,
        'Comparable'
      );
    }
    if (!profile.explainable) {
      addBadge(
        badges,
        'Sin causa',
        'warning'
      );
    }

    top.appendChild(title);
    top.appendChild(badges);
    card.appendChild(top);

    const meta =
      createElement('div', 'profile-meta');
    meta.appendChild(
      createMetaBox(
        'Nivel',
        tierLabel(profile.qualityTier)
      )
    );
    meta.appendChild(
      createMetaBox(
        'Recibos',
        String(profile.invoiceCount)
      )
    );
    meta.appendChild(
      createMetaBox(
        'Renta',
        profile.rentType || 'No resuelta'
      )
    );
    meta.appendChild(
      createMetaBox(
        'Servicio',
        [
          profile.businessType,
          profile.lobType
        ].filter(Boolean).join(' · ') || '—'
      )
    );
    card.appendChild(meta);

    const statusParts = [
      directionLabel(
        profile.differenceDirection
      )
    ];

    if (
      profile.coveragePercent !== null &&
      profile.coveragePercent !== undefined
    ) {
      statusParts.push(
        `${Number(profile.coveragePercent).toFixed(0)}% de movimientos conciliados`
      );
    }

    if (!profile.explainable) {
      statusParts.push(
        'El recibo es consultable, pero las reglas actuales todavía no reconocen una causa financiera.'
      );
    } else if (profile.evidenceLevel) {
      statusParts.push(
        `Evidencia ${profile.evidenceLevel}`
      );
    }

    card.appendChild(
      createElement(
        'div',
        'profile-status',
        statusParts.join(' · ')
      )
    );

    const openButton =
      createElement(
        'button',
        'open-profile',
        'Abrir caso en Mi Movistar'
      );
    openButton.type = 'button';
    openButton.addEventListener(
      'click',
      () => openProfile(
        profile.demoId,
        openButton
      )
    );
    card.appendChild(openButton);

    return card;
  }

  function buildQuery() {
    const params =
      new URLSearchParams({
        page: String(state.page),
        pageSize:
          String(state.pageSize),
        search:
          elements.search.value.trim(),
        capability:
          elements.capability.value,
        scenario:
          elements.scenario.value,
        rentType:
          elements.rentType.value,
        sort:
          elements.sort.value
      });

    return params.toString();
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.error.textContent = message;
    elements.grid.innerHTML = '';
    elements.pagination.hidden = true;
  }

  async function loadSummary() {
    const response =
      await fetch(
        '/api/explorer/summary',
        { cache: 'no-store' }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.action
          ? `${data.error} Ejecuta: ${data.action}`
          : data.error ||
            'No se pudo cargar la cobertura.'
      );
    }

    elements.scanned.textContent =
      formatNumber(data.scope.scanned);
    elements.scannedDetail.textContent =
      data.fullDataset
        ? 'Barrido completo'
        : 'Muestra limitada';

    elements.consultable.textContent =
      formatNumber(data.counts.consultable);
    elements.consultableDetail.textContent =
      `${formatPercent(data.percentages.consultableOfScanned)} del escaneo`;

    elements.explainable.textContent =
      formatNumber(data.counts.explainable);
    elements.explainableDetail.textContent =
      `${formatPercent(data.percentages.explainableOfConsultable)} de consultables`;

    elements.high.textContent =
      formatNumber(data.counts.highConfidence);
    elements.highDetail.textContent =
      `${formatPercent(data.percentages.highConfidenceOfConsultable)} de consultables`;

    elements.premium.textContent =
      formatNumber(data.counts.demoPremium);
    elements.premiumDetail.textContent =
      `${formatPercent(data.percentages.premiumOfConsultable)} de consultables`;

    elements.badge.textContent =
      data.fullDataset
        ? `${formatNumber(data.counts.consultable)} perfiles consultables`
        : 'Índice generado desde una muestra';
  }

  async function loadProfiles() {
    if (state.loading) {
      return;
    }

    state.loading = true;
    elements.loading.hidden = false;
    elements.error.hidden = true;

    try {
      const response =
        await fetch(
          `/api/explorer/profiles?${buildQuery()}`,
          { cache: 'no-store' }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.action
            ? `${data.error} Ejecuta: ${data.action}`
            : data.error ||
              'No se pudo consultar el índice.'
        );
      }

      elements.grid.innerHTML = '';
      elements.loading.hidden = true;

      state.page =
        data.pagination.page;
      state.totalPages =
        data.pagination.totalPages;

      if (!data.items.length) {
        elements.loading.hidden = false;
        elements.loading.textContent =
          'No encontramos perfiles con estos filtros.';
      } else {
        data.items.forEach(
          (profile) => {
            elements.grid.appendChild(
              renderProfile(profile)
            );
          }
        );
      }

      elements.summary.textContent =
        `${formatNumber(data.pagination.total)} perfiles · página ${data.pagination.page} de ${data.pagination.totalPages}`;

      elements.pageIndicator.textContent =
        `Página ${data.pagination.page} de ${data.pagination.totalPages}`;
      elements.previous.disabled =
        data.pagination.page <= 1;
      elements.next.disabled =
        data.pagination.page >=
        data.pagination.totalPages;
      elements.pagination.hidden =
        data.pagination.total <= 0;
    } catch (error) {
      showError(error.message);
    } finally {
      state.loading = false;
    }
  }

  async function openProfile(
    demoId,
    button
  ) {
    const original =
      button.textContent;
    button.disabled = true;
    button.textContent =
      'Abriendo caso…';

    try {
      const response =
        await fetch(
          '/api/explorer/open',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body:
              JSON.stringify({
                demoId
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'No se pudo abrir el caso.'
        );
      }

      sessionStorage.removeItem(
        'chatSessionId'
      );
      sessionStorage.removeItem(
        'pendingAuthBillingPrompt'
      );

      window.location.href =
        data.redirect ||
        '/app?source=explorer';
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      window.alert(error.message);
    }
  }

  function scheduleReload() {
    clearTimeout(state.timer);
    state.timer =
      setTimeout(
        () => {
          state.page = 1;
          loadProfiles();
        },
        250
      );
  }

  elements.search.addEventListener(
    'input',
    scheduleReload
  );

  [
    elements.capability,
    elements.scenario,
    elements.rentType,
    elements.sort
  ].forEach(
    (element) => {
      element.addEventListener(
        'change',
        () => {
          state.page = 1;
          loadProfiles();
        }
      );
    }
  );

  elements.form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      state.page = 1;
      loadProfiles();
    }
  );

  elements.reset.addEventListener(
    'click',
    () => {
      elements.form.reset();
      state.page = 1;
      loadProfiles();
    }
  );

  elements.previous.addEventListener(
    'click',
    () => {
      if (state.page > 1) {
        state.page -= 1;
        loadProfiles();
        window.scrollTo({
          top: 520,
          behavior: 'smooth'
        });
      }
    }
  );

  elements.next.addEventListener(
    'click',
    () => {
      if (
        state.page <
        state.totalPages
      ) {
        state.page += 1;
        loadProfiles();
        window.scrollTo({
          top: 520,
          behavior: 'smooth'
        });
      }
    }
  );

  document.addEventListener(
    'DOMContentLoaded',
    async () => {
      try {
        await loadSummary();
        await loadProfiles();
      } catch (error) {
        showError(error.message);
        elements.badge.textContent =
          'Índice no disponible';
      }
    }
  );
})();

(function () {
  const customerExperience =
    document.getElementById(
      'customerExperience'
    );

  const authLoading =
    document.getElementById(
      'authLoading'
    );

  const authenticatedUserName =
    document.getElementById(
      'authenticatedUserName'
    );

  const authenticatedUserEmail =
    document.getElementById(
      'authenticatedUserEmail'
    );

  const authModeBadge =
    document.getElementById(
      'authModeBadge'
    );

  const logoutButton =
    document.getElementById(
      'logoutButton'
    );

  const openAssistantLink =
    document.getElementById(
      'openAssistantLink'
    );

  const returnExplorerLink =
    document.getElementById(
      'returnExplorerLink'
    );

  const customerName =
    document.getElementById(
      'customerName'
    );

  const customerPlan =
    document.getElementById(
      'customerPlan'
    );

  const currentPeriod =
    document.getElementById(
      'currentPeriod'
    );

  const currentTotal =
    document.getElementById(
      'currentTotal'
    );

  const currentStatus =
    document.getElementById(
      'currentStatus'
    );

  const dueDate =
    document.getElementById(
      'dueDate'
    );

  const variationAmount =
    document.getElementById(
      'variationAmount'
    );

  const variationPercentage =
    document.getElementById(
      'variationPercentage'
    );

  const previousPeriod =
    document.getElementById(
      'previousPeriod'
    );

  const previousTotal =
    document.getElementById(
      'previousTotal'
    );

  const comparisonCurrentPeriod =
    document.getElementById(
      'comparisonCurrentPeriod'
    );

  const comparisonCurrentTotal =
    document.getElementById(
      'comparisonCurrentTotal'
    );

  const previousItems =
    document.getElementById(
      'previousItems'
    );

  const currentItems =
    document.getElementById(
      'currentItems'
    );

  const billHistoryList =
    document.getElementById(
      'billHistoryList'
    );

  const historyDescription =
    document.getElementById(
      'historyDescription'
    );

  const historySummary =
    document.getElementById(
      'historySummary'
    );

  const askHistoryButton =
    document.getElementById(
      'askHistoryButton'
    );

  const causesList =
    document.getElementById(
      'causesList'
    );

  const nextActions =
    document.getElementById(
      'nextActions'
    );

  let activeCustomerId = null;
  let activeAuthMode = null;

  function formatMoney(value) {
    const number =
      Number(value) || 0;

    const sign =
      number < 0
        ? '-'
        : '';

    return (
      `${sign}S/ ${Math.abs(number)
        .toFixed(2)
        .replace('.00', '')}`
    );
  }

  function createElement(
    tag,
    className,
    text
  ) {
    const element =
      document.createElement(tag);

    if (className) {
      element.className =
        className;
    }

    if (text !== undefined) {
      element.textContent =
        text;
    }

    return element;
  }

  function renderItems(
    container,
    items
  ) {
    container.innerHTML = '';

    (items || []).forEach(
      (item) => {
        const row =
          createElement(
            'div',
            'bill-item'
          );

        row.appendChild(
          createElement(
            'span',
            null,
            item.label
          )
        );

        row.appendChild(
          createElement(
            'strong',
            null,
            formatMoney(
              item.amount
            )
          )
        );

        container.appendChild(row);
      }
    );
  }

  function renderBillHistory(history) {
    if (!billHistoryList) {
      return;
    }

    billHistoryList.innerHTML = '';

    const bills =
      history?.bills || [];

    if (!bills.length) {
      billHistoryList.appendChild(
        createElement(
          'p',
          'empty-state',
          'No hay recibos históricos disponibles para este servicio.'
        )
      );

      if (historySummary) {
        historySummary.textContent = '';
      }
      return;
    }

    if (historyDescription) {
      historyDescription.textContent =
        history.completeWindow
          ? `Se muestran el recibo actual y ${history.previousBills} recibos anteriores.`
          : `Hay ${history.availableBills} recibo${history.availableBills === 1 ? '' : 's'} disponible${history.availableBills === 1 ? '' : 's'} para este servicio.`;
    }

    bills.forEach(
      (bill, index) => {
        const card =
          createElement(
            'article',
            index === 0
              ? 'history-bill-card current'
              : 'history-bill-card'
          );

        card.appendChild(
          createElement(
            'span',
            null,
            index === 0
              ? 'Recibo actual'
              : `Recibo anterior ${index}`
          )
        );

        card.appendChild(
          createElement(
            'strong',
            null,
            formatMoney(bill.total)
          )
        );

        card.appendChild(
          createElement(
            'small',
            null,
            bill.period ||
              'Ciclo no disponible'
          )
        );

        billHistoryList.appendChild(card);
      }
    );

    if (!historySummary) {
      return;
    }

    const oldest =
      history.summary?.oldestBill;
    const newest =
      history.summary?.newestBill;
    const netChange =
      Number(history.summary?.netChange);

    if (
      !oldest ||
      !newest ||
      !Number.isFinite(netChange) ||
      history.availableBills < 2
    ) {
      historySummary.textContent =
        'Se necesita al menos un recibo anterior para calcular una tendencia.';
      return;
    }

    if (Math.abs(netChange) < 0.005) {
      historySummary.textContent =
        `Entre ${oldest.period} y ${newest.period}, el total terminó en el mismo nivel: ${formatMoney(newest.total)}.`;
      return;
    }

    historySummary.textContent =
      `Entre ${oldest.period} y ${newest.period}, el total ${netChange > 0 ? 'subió' : 'bajó'} ${formatMoney(Math.abs(netChange))}, de ${formatMoney(oldest.total)} a ${formatMoney(newest.total)}.`;
  }

  function renderCauses(causes) {
    causesList.innerHTML = '';

    const safeCauses =
      causes || [];

    if (!safeCauses.length) {
      causesList.appendChild(
        createElement(
          'p',
          'empty-state',
          'No hay una causa adicional que mostrar para este recibo.'
        )
      );
      return;
    }

    safeCauses.forEach(
      (cause) => {
        const card =
          createElement(
            'article',
            'cause-card'
          );

        const content =
          createElement('div');

        content.appendChild(
          createElement(
            'h3',
            null,
            cause.title
          )
        );

        content.appendChild(
          createElement(
            'p',
            null,
            cause.description
          )
        );

        const causeImpact =
          Number(cause.impact) || 0;

        let impactText =
          causeImpact > 0
            ? `+${formatMoney(causeImpact)}`
            : formatMoney(causeImpact);

        let impactClass =
          'cause-impact';

        if (
          cause.impactPresentation ===
            'INCLUDED_IN_TOTAL'
        ) {
          impactText =
            `Incluido: ${formatMoney(Math.abs(causeImpact))}`;
          impactClass +=
            ' included-in-total';
        } else if (
          cause.impactPresentation ===
            'APPLIED_TO_TOTAL'
        ) {
          impactText =
            `Aplicado: ${formatMoney(causeImpact)}`;
          impactClass +=
            ' applied-to-total';
        }

        const impact =
          createElement(
            'strong',
            impactClass,
            impactText
          );

        card.appendChild(content);
        card.appendChild(impact);
        causesList.appendChild(card);
      }
    );
  }

  function openChat(prompt) {
    const params =
      new URLSearchParams();

    params.set(
      'source',
      'app'
    );

    if (prompt) {
      params.set(
        'prompt',
        prompt
      );
    }

    window.location.href =
      `/chat?${params.toString()}`;
  }

  function renderActions(actions) {
    nextActions.innerHTML = '';

    (actions || []).forEach(
      (action) => {
        const button =
          createElement(
            'button',
            'action-button',
            action.label
          );

        button.type = 'button';

        button.addEventListener(
          'click',
          () => {
            if (
              action.type === 'CHAT'
            ) {
              openChat(
                action.prompt
              );
            }
          }
        );

        nextActions.appendChild(
          button
        );
      }
    );
  }

  function renderExperience(data) {
    customerName.textContent =
      data.customer.name;

    customerPlan.textContent =
      data.customer.plan;

    currentPeriod.textContent =
      data.currentBill.period;

    currentTotal.textContent =
      formatMoney(
        data.currentBill.total
      );

    currentStatus.textContent =
      data.currentBill.status;

    dueDate.textContent =
      data.currentBill.dueDate
        ? `Vence: ${data.currentBill.dueDate}`
        : '';

    const difference =
      data.comparison
        ? data.comparison.difference
        : null;

    if (
      difference === null ||
      difference === undefined
    ) {
      variationAmount.textContent =
        'Sin comparación';
      variationPercentage.textContent =
        'Primer recibo disponible en el caso demo';
    } else {
      variationAmount.textContent =
        difference > 0
          ? `+${formatMoney(difference)}`
          : formatMoney(difference);

      variationPercentage.textContent =
        difference > 0
          ? `${data.comparison.percentage}% más que el recibo anterior`
          : difference < 0
            ? `${Math.abs(data.comparison.percentage)}% menos que el recibo anterior`
            : 'Mismo total que el recibo anterior';
    }

    if (data.previousBill) {
      previousPeriod.textContent =
        data.previousBill.period;

      previousTotal.textContent =
        formatMoney(
          data.previousBill.total
        );

      renderItems(
        previousItems,
        data.previousBill.items
      );
    } else {
      previousPeriod.textContent =
        'Sin recibo anterior';
      previousTotal.textContent =
        '—';
      previousItems.innerHTML = '';
      previousItems.appendChild(
        createElement(
          'span',
          'empty-state',
          'No hay un recibo anterior comparable en los datos disponibles.'
        )
      );
    }

    comparisonCurrentPeriod.textContent =
      data.currentBill.period;

    comparisonCurrentTotal.textContent =
      formatMoney(
        data.currentBill.total
      );

    renderItems(
      currentItems,
      data.currentBill.items
    );

    renderBillHistory(
      data.billingHistory
    );

    renderCauses([
      ...(
        data.comparison?.causes || []
      ),
      ...(data.findings || [])
    ]);

    renderActions(
      data.nextActions
    );
  }

  async function loadAuth() {
    const response =
      await fetch(
        '/api/auth/me'
      );

    if (response.status === 401) {
      window.location.href =
        '/login';
      return null;
    }

    if (!response.ok) {
      throw new Error(
        'No se pudo validar la sesión'
      );
    }

    return response.json();
  }

  async function loadExperience() {
    const response =
      await fetch(
        '/api/app/me'
      );

    if (response.status === 401) {
      window.location.href =
        '/login';
      return null;
    }

    if (!response.ok) {
      throw new Error(
        'No se pudo cargar la información del cliente'
      );
    }

    return response.json();
  }

  function renderAuthenticatedUser(user) {
    activeCustomerId =
      user.customerId;
    activeAuthMode =
      user.mode || null;

    authenticatedUserName.textContent =
      user.name;

    const isExplorer =
      user.mode === 'EXPLORER';

    authenticatedUserEmail.textContent =
      isExplorer
        ? user.explorerDemoId || ''
        : user.email || '';

    authModeBadge.textContent =
      isExplorer
        ? 'Explorador dataset'
        : user.mode === 'DEMO'
          ? 'Perfil demo'
          : 'Sesión autenticada';

    if (returnExplorerLink) {
      returnExplorerLink.hidden =
        !isExplorer;
    }

    openAssistantLink.href =
      '/chat?source=app';
  }

  async function logout() {
    logoutButton.disabled = true;
    logoutButton.textContent =
      'Cerrando...';

    try {
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST'
        }
      );
    } finally {
      sessionStorage.removeItem(
        'movistarDemoCustomerId'
      );
      sessionStorage.removeItem(
        'chatSessionId'
      );
      sessionStorage.removeItem(
        'pendingAuthBillingPrompt'
      );
      window.location.href =
        activeAuthMode === 'EXPLORER'
          ? '/explorer'
          : '/login';
    }
  }

  if (askHistoryButton) {
    askHistoryButton.addEventListener(
      'click',
      () => {
        openChat(
          '¿Cómo ha cambiado mi recibo en los últimos meses?'
        );
      }
    );
  }

  logoutButton.addEventListener(
    'click',
    logout
  );

  async function init() {
    try {
      const auth =
        await loadAuth();

      if (!auth) {
        return;
      }

      renderAuthenticatedUser(
        auth.user
      );

      const experience =
        await loadExperience();

      if (!experience) {
        return;
      }

      if (
        activeCustomerId !==
        experience.customer.customerId
      ) {
        throw new Error(
          'El cliente de la sesión no coincide con la información cargada'
        );
      }

      renderExperience(experience);
      authLoading.hidden = true;
      customerExperience.hidden = false;
    } catch (error) {
      console.error(
        '[APP] Error:',
        error
      );

      authLoading.innerHTML =
        '<div class="auth-loading-card auth-error"><strong>No pudimos cargar Mi Movistar.</strong><span>Vuelve al inicio de sesión e inténtalo nuevamente.</span><a href="/login">Ir al login</a></div>';
    }
  }

  init();
})();

(function () {
  const customerSelector =
    document.getElementById(
      'customerSelector'
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

  const causesList =
    document.getElementById(
      'causesList'
    );

  const nextActions =
    document.getElementById(
      'nextActions'
    );


  let activeCustomerId =
    new URLSearchParams(
      window.location.search
    ).get('customerId') ||
    'CLI000001';


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

    if (
      text !== undefined
    ) {
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

        container.appendChild(
          row
        );
      }
    );
  }


  function renderCauses(
    causes
  ) {
    causesList.innerHTML = '';

    (causes || []).forEach(
      (cause) => {
        const card =
          createElement(
            'article',
            'cause-card'
          );

        const content =
          createElement(
            'div'
          );

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

        const impact =
          createElement(
            'strong',
            'cause-impact',
            `+${formatMoney(
              cause.impact
            )}`
          );

        card.appendChild(
          content
        );

        card.appendChild(
          impact
        );

        causesList.appendChild(
          card
        );
      }
    );
  }


  function openChat(prompt) {
    const params =
      new URLSearchParams();

    params.set(
      'customerId',
      activeCustomerId
    );

    params.set(
      'prompt',
      prompt
    );

    params.set(
      'source',
      'app'
    );

    window.location.href =
      `/?${params.toString()}`;
  }


  function renderActions(
    actions
  ) {
    nextActions.innerHTML = '';

    (actions || []).forEach(
      (action) => {
        const button =
          createElement(
            'button',
            'action-button',
            action.label
          );

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
      data.comparison.difference;

    variationAmount.textContent =
      difference > 0
        ? `+${formatMoney(difference)}`
        : formatMoney(difference);

    variationPercentage.textContent =
      difference > 0
        ? `${data.comparison.percentage}% más que el mes anterior`
        : `${Math.abs(
            data.comparison.percentage
          )}% menos que el mes anterior`;

    previousPeriod.textContent =
      data.previousBill.period;

    previousTotal.textContent =
      formatMoney(
        data.previousBill.total
      );

    comparisonCurrentPeriod
      .textContent =
      data.currentBill.period;

    comparisonCurrentTotal
      .textContent =
      formatMoney(
        data.currentBill.total
      );

    renderItems(
      previousItems,
      data.previousBill.items
    );

    renderItems(
      currentItems,
      data.currentBill.items
    );

    renderCauses(
      data.comparison.causes
    );

    renderActions(
      data.nextActions
    );
  }


  async function loadCustomers() {
    const response =
      await fetch(
        '/api/app/customers'
      );

    if (!response.ok) {
      throw new Error(
        'No se pudieron cargar los perfiles'
      );
    }

    const data =
      await response.json();

    customerSelector.innerHTML =
      '';

    data.customers.forEach(
      (customer) => {
        const option =
          document.createElement(
            'option'
          );

        option.value =
          customer.customerId;

        option.textContent =
          `${customer.name} — ${customer.plan}`;

        if (
          customer.customerId ===
          activeCustomerId
        ) {
          option.selected =
            true;
        }

        customerSelector.appendChild(
          option
        );
      }
    );
  }


  async function loadExperience(
    customerId
  ) {
    const response =
      await fetch(
        `/api/app/customers/${encodeURIComponent(
          customerId
        )}`
      );

    if (!response.ok) {
      throw new Error(
        'No se pudo cargar la información del cliente'
      );
    }

    const data =
      await response.json();

    renderExperience(data);
  }


  customerSelector.addEventListener(
    'change',
    async () => {
      activeCustomerId =
        customerSelector.value;

      const url =
        new URL(
          window.location.href
        );

      url.searchParams.set(
        'customerId',
        activeCustomerId
      );

      history.replaceState(
        {},
        '',
        url
      );

      try {
        await loadExperience(
          activeCustomerId
        );
      } catch (error) {
        console.error(
          '[APP] Error:',
          error
        );
      }
    }
  );


  async function init() {
    try {
      await loadCustomers();

      await loadExperience(
        activeCustomerId
      );

    } catch (error) {
      console.error(
        '[APP] Error:',
        error
      );

      customerName.textContent =
        'No se pudo cargar tu información';
    }
  }


  init();
})();
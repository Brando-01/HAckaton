(function () {
  const casesList =
    document.getElementById(
      'casesList'
    );

  const caseDetail =
    document.getElementById(
      'caseDetail'
    );

  const refreshButton =
    document.getElementById(
      'refreshButton'
    );

  let selectedCaseId = null;

  function crearElemento(
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

  function traducirMotivo(reason) {
    const motivos = {
      CLIENT_REQUEST:
        'Cliente solicita asesor',

      CUSTOMER_DISAGREES:
        'Cliente no está de acuerdo',

      NOT_RESOLVED:
        'Consulta no resuelta',

      OUT_OF_BILLING_SCOPE:
        'Fuera del alcance de facturación',

      REPEATED_UNDERSTANDING_FAILURE:
        'Umbral de incomprensión alcanzado'
    };

    return (
      motivos[reason] ||
      reason ||
      'No especificado'
    );
  }

  function traducirEstado(status) {
    if (status === 'ATTENDED') {
      return 'Atendido';
    }

    return 'Pendiente';
  }

  function formatearFecha(value) {
    if (!value) {
      return 'No disponible';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    ).format(date);
  }

  function formatearMonto(value, options = {}) {
    if (!Number.isFinite(value)) {
      return '—';
    }

    const sign =
      options.signed
        ? value > 0
          ? '+'
          : value < 0
            ? '-'
            : ''
        : value < 0
          ? '-'
          : '';

    return `${sign}S/ ${Math.abs(value)}`;
  }


  function formatearImpacto(item) {
    if (!Number.isFinite(item?.impact)) {
      return '—';
    }

    if (
      item.impactPresentation ===
        'INCLUDED_IN_TOTAL'
    ) {
      return (
        `Incluido: ${formatearMonto(Math.abs(item.impact))}`
      );
    }

    if (
      item.impactPresentation ===
        'APPLIED_TO_TOTAL'
    ) {
      return (
        `Aplicado: ${formatearMonto(item.impact)}`
      );
    }

    return formatearMonto(
      item.impact,
      { signed: true }
    );
  }

  function crearVerificacion(item) {
    const verification =
      item?.verification;

    const evidenceLevel =
      item?.evidenceLevel ||
      verification?.evidenceLevel ||
      null;

    if (!verification && !evidenceLevel) {
      return null;
    }

    const row =
      crearElemento(
        'div',
        'evidence-row'
      );

    const level =
      String(evidenceLevel || '')
        .toLowerCase();

    row.appendChild(
      crearElemento(
        'span',
        `evidence-badge ${level}`,
        verification?.label ||
          (
            evidenceLevel === 'HIGH'
              ? 'Evidencia alta'
              : evidenceLevel === 'MEDIUM'
                ? 'Evidencia media'
                : evidenceLevel === 'LOW'
                  ? 'Evidencia baja'
                  : 'Evidencia disponible'
          )
      )
    );

    if (
      Array.isArray(
        verification?.sources
      ) &&
      verification.sources.length
    ) {
      row.appendChild(
        crearElemento(
          'span',
          'evidence-sources',
          verification.sources.join(
            ' · '
          )
        )
      );
    }

    return row;
  }

  async function cargarCasos() {
    try {
      const response =
        await fetch(
          '/api/advisor/cases'
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      const casos =
        data.cases || [];

      renderizarCasos(casos);

      if (
        !selectedCaseId &&
        casos.length
      ) {
        await cargarCaso(
          casos[0].caseId,
          false
        );
      }
    } catch (error) {
      console.error(
        '[ADVISOR] Error:',
        error
      );

      casesList.textContent =
        'No se pudieron cargar los casos.';
    }
  }

  function renderizarCasos(casos) {
    casesList.innerHTML = '';

    if (!casos.length) {
      const empty =
        crearElemento(
          'div',
          'cases-empty'
        );

      empty.appendChild(
        crearElemento(
          'strong',
          null,
          'No hay casos derivados'
        )
      );

      empty.appendChild(
        crearElemento(
          'span',
          null,
          'Cuando Lucía derive una conversación, aparecerá aquí.'
        )
      );

      casesList.appendChild(empty);
      return;
    }

    casos.forEach((caso) => {
      const button =
        crearElemento(
          'button',
          'case-card'
        );

      if (
        caso.caseId ===
        selectedCaseId
      ) {
        button.classList.add(
          'selected'
        );
      }

      const top =
        crearElemento(
          'div',
          'case-card-top'
        );

      const id =
        crearElemento(
          'strong',
          'case-id',
          caso.caseId
        );

      const status =
        crearElemento(
          'span',
          `case-status ${String(caso.status).toLowerCase()}`,
          traducirEstado(
            caso.status
          )
        );

      top.appendChild(id);
      top.appendChild(status);

      const customerName =
        caso.customer &&
        caso.customer.name
          ? caso.customer.name
          : caso.customerIdentifier ||
            'Cliente no identificado';

      const customer =
        crearElemento(
          'span',
          'case-customer',
          customerName
        );

      const reason =
        crearElemento(
          'span',
          'case-reason',
          traducirMotivo(
            caso.reason
          )
        );

      const time =
        crearElemento(
          'span',
          'case-time',
          formatearFecha(
            caso.createdAt
          )
        );

      button.appendChild(top);
      button.appendChild(customer);
      button.appendChild(reason);
      button.appendChild(time);

      button.addEventListener(
        'click',
        () => {
          cargarCaso(
            caso.caseId
          );
        }
      );

      casesList.appendChild(
        button
      );
    });
  }

  async function cargarCaso(
    caseId,
    refreshList = true
  ) {
    try {
      const response =
        await fetch(
          `/api/advisor/cases/${encodeURIComponent(caseId)}`
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const caso =
        await response.json();

      selectedCaseId =
        caso.caseId;

      renderizarDetalle(caso);

      if (refreshList) {
        const listResponse =
          await fetch(
            '/api/advisor/cases'
          );

        if (listResponse.ok) {
          const list =
            await listResponse.json();

          renderizarCasos(
            list.cases || []
          );
        }
      }
    } catch (error) {
      console.error(
        '[ADVISOR] Error cargando caso:',
        error
      );
    }
  }

  function crearSeccion(
    title,
    className
  ) {
    const section =
      crearElemento(
        'section',
        `advisor-section ${className || ''}`.trim()
      );

    section.appendChild(
      crearElemento(
        'h3',
        null,
        title
      )
    );

    return section;
  }

  function agregarDato(
    container,
    label,
    value
  ) {
    const row =
      crearElemento(
        'div',
        'detail-row'
      );

    const labelElement =
      crearElemento(
        'span',
        'detail-label',
        label
      );

    const valueElement =
      crearElemento(
        'strong',
        'detail-value',
        value || 'No disponible'
      );

    row.appendChild(
      labelElement
    );

    row.appendChild(
      valueElement
    );

    container.appendChild(row);
  }

  function crearMetricCard(
    label,
    value,
    detail,
    extraClass = ''
  ) {
    const card =
      crearElemento(
        'div',
        `billing-metric ${extraClass}`.trim()
      );

    card.appendChild(
      crearElemento(
        'span',
        'billing-metric-label',
        label
      )
    );

    card.appendChild(
      crearElemento(
        'strong',
        'billing-metric-value',
        value
      )
    );

    if (detail) {
      card.appendChild(
        crearElemento(
          'span',
          'billing-metric-detail',
          detail
        )
      );
    }

    return card;
  }

  function renderizarResumen(
    container,
    caso
  ) {
    const summary =
      caso.advisorSummary;

    if (!summary) {
      return;
    }

    const section =
      crearSeccion(
        'Resumen para el asesor',
        'summary-section'
      );

    const headline =
      crearElemento(
        'strong',
        'summary-headline',
        summary.headline ||
          'Consulta derivada'
      );

    const overview =
      crearElemento(
        'p',
        'summary-overview',
        summary.overview ||
          'Revisa el contexto transferido por Lucía.'
      );

    section.appendChild(headline);
    section.appendChild(overview);

    if (
      Array.isArray(summary.findings) &&
      summary.findings.length
    ) {
      const findings =
        crearElemento(
          'div',
          'summary-findings'
        );

      summary.findings.forEach(
        (finding) => {
          const item =
            crearElemento(
              'div',
              'summary-finding'
            );

          const text =
            crearElemento(
              'div',
              'summary-finding-text'
            );

          text.appendChild(
            crearElemento(
              'strong',
              null,
              finding.title ||
                'Variación detectada'
            )
          );

          if (finding.detail) {
            text.appendChild(
              crearElemento(
                'span',
                null,
                finding.detail
              )
            );
          }

          const verification =
            crearVerificacion(
              finding
            );

          if (verification) {
            text.appendChild(
              verification
            );
          }

          item.appendChild(text);

          if (
            Number.isFinite(
              finding.impact
            )
          ) {
            item.appendChild(
              crearElemento(
                'strong',
                'summary-impact',
                formatearImpacto(
                  finding
                )
              )
            );
          }

          findings.appendChild(item);
        }
      );

      section.appendChild(findings);
    }

    if (summary.outcome) {
      const outcome =
        crearElemento(
          'div',
          'summary-outcome'
        );

      outcome.appendChild(
        crearElemento(
          'strong',
          null,
          'Resultado del bot'
        )
      );

      outcome.appendChild(
        crearElemento(
          'span',
          null,
          summary.outcome
        )
      );

      section.appendChild(outcome);
    }

    container.appendChild(section);
  }

  function renderizarCliente(
    container,
    caso
  ) {
    const section =
      crearSeccion(
        'Cliente y servicio',
        'customer-section'
      );

    const grid =
      crearElemento(
        'div',
        'detail-grid'
      );

    const customer =
      caso.customer || {};

    agregarDato(
      grid,
      'Cliente',
      customer.name ||
        'No disponible'
    );

    agregarDato(
      grid,
      'ID de cliente',
      customer.customerId ||
        caso.customerIdentifier ||
        'No disponible'
    );

    agregarDato(
      grid,
      'Servicio',
      customer.plan ||
        'No disponible'
    );

    agregarDato(
      grid,
      'Caso creado',
      formatearFecha(
        caso.createdAt
      )
    );

    section.appendChild(grid);
    container.appendChild(section);
  }

  function renderizarFacturacion(
    container,
    caso
  ) {
    const billing =
      caso.billing;

    if (!billing) {
      return;
    }

    const section =
      crearSeccion(
        'Contexto de facturación',
        'billing-section'
      );

    const metrics =
      crearElemento(
        'div',
        'billing-metrics'
      );

    const previous =
      billing.previousBill;

    const current =
      billing.currentBill;

    const comparison =
      billing.comparison;

    if (previous) {
      metrics.appendChild(
        crearMetricCard(
          'Recibo anterior',
          formatearMonto(
            previous.total
          ),
          previous.period
        )
      );
    }

    if (current) {
      metrics.appendChild(
        crearMetricCard(
          'Recibo actual',
          formatearMonto(
            current.total
          ),
          current.period,
          'current'
        )
      );
    }

    if (
      comparison &&
      Number.isFinite(
        comparison.difference
      )
    ) {
      const percentage =
        Number.isFinite(
          comparison.percentage
        )
          ? `${comparison.percentage}% vs. mes anterior`
          : null;

      metrics.appendChild(
        crearMetricCard(
          'Variación',
          formatearMonto(
            comparison.difference,
            { signed: true }
          ),
          percentage,
          comparison.difference > 0
            ? 'variation-up'
            : 'variation-down'
        )
      );
    }

    section.appendChild(metrics);

    if (
      comparison &&
      Array.isArray(
        comparison.causes
      ) &&
      comparison.causes.length
    ) {
      const causesTitle =
        crearElemento(
          'h4',
          null,
          'Causas detectadas'
        );

      const causes =
        crearElemento(
          'div',
          'billing-causes'
        );

      comparison.causes.forEach(
        (cause) => {
          const item =
            crearElemento(
              'div',
              'billing-cause'
            );

          const copy =
            crearElemento(
              'div',
              'billing-cause-copy'
            );

          copy.appendChild(
            crearElemento(
              'strong',
              null,
              cause.title ||
                'Variación detectada'
            )
          );

          if (cause.description) {
            copy.appendChild(
              crearElemento(
                'span',
                null,
                cause.description
              )
            );
          }

          const verification =
            crearVerificacion(
              cause
            );

          if (verification) {
            copy.appendChild(
              verification
            );
          }

          item.appendChild(copy);

          if (
            Number.isFinite(
              cause.impact
            )
          ) {
            item.appendChild(
              crearElemento(
                'strong',
                'billing-cause-impact',
                formatearImpacto(
                  cause
                )
              )
            );
          }

          causes.appendChild(item);
        }
      );

      section.appendChild(causesTitle);
      section.appendChild(causes);
    }

    container.appendChild(section);
  }

  function renderizarDerivacion(
    container,
    caso
  ) {
    const section =
      crearSeccion(
        'Motivo de derivación',
        'handoff-section'
      );

    const grid =
      crearElemento(
        'div',
        'handoff-grid'
      );

    agregarDato(
      grid,
      'Motivo original',
      caso.originalQuery ||
        'No disponible'
    );

    agregarDato(
      grid,
      'Decisión de handoff',
      traducirMotivo(
        caso.reason
      )
    );

    if (caso.handoffPolicy) {
      agregarDato(
        grid,
        'Regla aplicada',
        caso.handoffPolicy.ruleId ||
          'Regla no disponible'
      );

      if (
        Number.isInteger(
          caso.handoffPolicy.threshold
        )
      ) {
        agregarDato(
          grid,
          'Umbral de incomprensión',
          `${caso.handoffPolicy.observedRepairCount || 0}/${caso.handoffPolicy.threshold}`
        );
      }
    }


    agregarDato(
      grid,
      'Último mensaje del cliente',
      caso.handoffMessage ||
        'No disponible'
    );

    section.appendChild(grid);

    const callout =
      crearElemento(
        'p',
        'handoff-callout',
        'El contexto ya fue transferido: el cliente no debería tener que repetir la explicación al asesor.'
      );

    section.appendChild(callout);
    container.appendChild(section);
  }

  function renderizarConversacion(
    container,
    caso
  ) {
    const conversationMessages =
      caso.conversation || [];

    const section =
      crearSeccion(
        `Conversación completa (${conversationMessages.length} mensajes)`,
        'conversation-section'
      );

    const conversation =
      crearElemento(
        'div',
        'conversation'
      );

    conversationMessages
      .forEach((mensaje) => {
        const bubble =
          crearElemento(
            'div',
            `conversation-message ${mensaje.role}`
          );

        const role =
          mensaje.role === 'user'
            ? 'Cliente'
            : 'Lucía';

        const roleElement =
          crearElemento(
            'strong',
            'conversation-role',
            role
          );

        const content =
          crearElemento(
            'p',
            null,
            mensaje.content
          );

        bubble.appendChild(
          roleElement
        );

        bubble.appendChild(
          content
        );

        conversation.appendChild(
          bubble
        );
      });

    section.appendChild(
      conversation
    );

    container.appendChild(section);
  }

  function renderizarDetalle(caso) {
    caseDetail.innerHTML = '';

    const header =
      crearElemento(
        'div',
        'case-detail-header'
      );

    const heading =
      crearElemento(
        'div',
        'case-detail-heading'
      );

    heading.appendChild(
      crearElemento(
        'span',
        'case-detail-eyebrow',
        'Handoff de Lucía'
      )
    );

    heading.appendChild(
      crearElemento(
        'h2',
        null,
        caso.caseId
      )
    );

    const status =
      crearElemento(
        'span',
        `detail-status ${String(caso.status).toLowerCase()}`,
        traducirEstado(
          caso.status
        )
      );

    header.appendChild(heading);
    header.appendChild(status);
    caseDetail.appendChild(header);

    renderizarResumen(
      caseDetail,
      caso
    );

    const contextGrid =
      crearElemento(
        'div',
        'context-columns'
      );

    renderizarCliente(
      contextGrid,
      caso
    );

    renderizarFacturacion(
      contextGrid,
      caso
    );

    caseDetail.appendChild(
      contextGrid
    );

    renderizarDerivacion(
      caseDetail,
      caso
    );

    renderizarConversacion(
      caseDetail,
      caso
    );

    const actions =
      crearElemento(
        'div',
        'case-actions'
      );

    if (
      caso.status !==
      'ATTENDED'
    ) {
      const button =
        crearElemento(
          'button',
          'attend-button',
          'Marcar como atendido'
        );

      button.addEventListener(
        'click',
        () => {
          marcarAtendido(
            caso.caseId
          );
        }
      );

      actions.appendChild(button);
    } else {
      const attended =
        crearElemento(
          'div',
          'attended-message'
        );

      attended.appendChild(
        crearElemento(
          'strong',
          null,
          'Caso atendido'
        )
      );

      attended.appendChild(
        crearElemento(
          'span',
          null,
          `Última actualización: ${formatearFecha(caso.updatedAt)}`
        )
      );

      actions.appendChild(attended);
    }

    caseDetail.appendChild(actions);
  }

  async function marcarAtendido(
    caseId
  ) {
    try {
      const response =
        await fetch(
          `/api/advisor/cases/${encodeURIComponent(caseId)}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              status: 'ATTENDED'
            })
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const caso =
        await response.json();

      renderizarDetalle(caso);

      const listResponse =
        await fetch(
          '/api/advisor/cases'
        );

      if (listResponse.ok) {
        const list =
          await listResponse.json();

        renderizarCasos(
          list.cases || []
        );
      }
    } catch (error) {
      console.error(
        '[ADVISOR] Error actualizando caso:',
        error
      );
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener(
      'click',
      cargarCasos
    );
  }

  cargarCasos();
})();

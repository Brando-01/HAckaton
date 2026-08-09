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
        'Consulta no resuelta'
    };

    return (
      motivos[reason] ||
      reason
    );
  }

  function traducirEstado(status) {
    if (status === 'ATTENDED') {
      return 'Atendido';
    }

    return 'Pendiente';
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

      renderizarCasos(
        data.cases || []
      );
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
      casesList.textContent =
        'No hay casos derivados.';
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

      const id =
        crearElemento(
          'strong',
          'case-id',
          caso.caseId
        );

      const reason =
        crearElemento(
          'span',
          'case-reason',
          traducirMotivo(
            caso.reason
          )
        );

      const status =
        crearElemento(
          'span',
          `case-status ${caso.status.toLowerCase()}`,
          traducirEstado(
            caso.status
          )
        );

      button.appendChild(id);
      button.appendChild(reason);
      button.appendChild(status);

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

  async function cargarCaso(caseId) {
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

      await cargarCasos();
    } catch (error) {
      console.error(
        '[ADVISOR] Error cargando caso:',
        error
      );
    }
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
        'strong',
        null,
        `${label}: `
      );

    const valueElement =
      crearElemento(
        'span',
        null,
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

  function renderizarDetalle(caso) {
    caseDetail.innerHTML = '';

    const title =
      crearElemento(
        'h2',
        null,
        caso.caseId
      );

    caseDetail.appendChild(title);

    agregarDato(
      caseDetail,
      'Cliente',
      caso.customerIdentifier ||
        'Cliente no identificado'
    );

    agregarDato(
      caseDetail,
      'Estado',
      traducirEstado(
        caso.status
      )
    );

    agregarDato(
      caseDetail,
      'Motivo',
      traducirMotivo(
        caso.reason
      )
    );

    agregarDato(
      caseDetail,
      'Consulta original',
      caso.originalQuery
    );

    const conversationTitle =
      crearElemento(
        'h3',
        null,
        'Conversación'
      );

    caseDetail.appendChild(
      conversationTitle
    );

    const conversation =
      crearElemento(
        'div',
        'conversation'
      );

    (caso.conversation || [])
      .forEach((mensaje) => {
        const bubble =
          crearElemento(
            'div',
            `conversation-message ${mensaje.role}`
          );

        const role =
          mensaje.role === 'user'
            ? 'Cliente'
            : 'Asistente';

        const roleElement =
          crearElemento(
            'strong',
            null,
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

    caseDetail.appendChild(
      conversation
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

      caseDetail.appendChild(
        button
      );
    }
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

      await cargarCasos();

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
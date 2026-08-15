(function () {
  const customerName =
    document.getElementById(
      'waCustomerName'
    );
  const continuityLabel =
    document.getElementById(
      'waContinuityLabel'
    );
  const journey =
    document.getElementById(
      'waJourney'
    );
  const messages =
    document.getElementById(
      'waMessages'
    );
  const empty =
    document.getElementById(
      'waEmpty'
    );
  const form =
    document.getElementById(
      'waForm'
    );
  const input =
    document.getElementById(
      'waInput'
    );
  const sendButton =
    document.getElementById(
      'waSendButton'
    );
  const footnote =
    document.getElementById(
      'waFootnote'
    );

  const CHANNEL_LABELS = {
    MI_MOVISTAR: 'Mi Movistar',
    LUCIA_WEB: 'Lucía web',
    WHATSAPP: 'WhatsApp',
    ADVISOR: 'Asesor'
  };

  let currentSessionId = null;
  let currentCustomerId = null;
  let sending = false;

  function createSessionId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        'function'
    ) {
      return `s_${window.crypto.randomUUID()}`;
    }

    return (
      `s_${Date.now()}_` +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function getOrCreateSessionId() {
    const existing =
      sessionStorage.getItem(
        'chatSessionId'
      );

    if (existing) {
      return existing;
    }

    const created =
      createSessionId();

    sessionStorage.setItem(
      'chatSessionId',
      created
    );

    return created;
  }

  function createProviderMessageId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        'function'
    ) {
      return `wa_${window.crypto.randomUUID()}`;
    }

    return (
      `wa_${Date.now()}_` +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function labelForChannel(channel) {
    return (
      CHANNEL_LABELS[channel] ||
      channel ||
      'Canal'
    );
  }

  async function loadAuth() {
    const response =
      await fetch(
        '/api/auth/me',
        {
          cache: 'no-store',
          credentials: 'same-origin'
        }
      );

    if (response.status === 401) {
      window.location.href =
        `/login?returnTo=${encodeURIComponent('/whatsapp')}`;
      return null;
    }

    if (!response.ok) {
      throw new Error(
        'No se pudo validar la sesión autenticada'
      );
    }

    return response.json();
  }

  async function associateCustomer() {
    const response =
      await fetch(
        `/api/session/${encodeURIComponent(currentSessionId)}/customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            customerId:
              currentCustomerId
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'No se pudo asociar la sesión de WhatsApp'
      );
    }

    if (
      data.sessionId &&
      data.sessionId !==
        currentSessionId
    ) {
      currentSessionId =
        data.sessionId;
      sessionStorage.setItem(
        'chatSessionId',
        currentSessionId
      );
    }
  }

  function renderJourney(continuity) {
    if (!journey) {
      return;
    }

    journey.innerHTML = '';

    const visited =
      Array.isArray(
        continuity?.visitedChannels
      )
        ? continuity.visitedChannels
        : [];

    const label =
      document.createElement('span');
    label.className =
      'journey-label';
    label.textContent =
      'Ruta del contexto';
    journey.appendChild(label);

    if (!visited.length) {
      const pending =
        document.createElement('span');
      pending.className =
        'journey-chip';
      pending.textContent =
        'WhatsApp';
      journey.appendChild(pending);
      return;
    }

    visited.forEach(
      (channel, index) => {
        if (index > 0) {
          const arrow =
            document.createElement(
              'span'
            );
          arrow.className =
            'journey-arrow';
          arrow.textContent = '→';
          journey.appendChild(arrow);
        }

        const chip =
          document.createElement('span');
        chip.className =
          'journey-chip';
        chip.textContent =
          labelForChannel(channel);
        journey.appendChild(chip);
      }
    );

    if (continuityLabel) {
      continuityLabel.textContent =
        continuity?.isOmnichannel
          ? `Contexto conservado entre ${visited.length} canales`
          : 'Contexto preparado en este canal';
    }
  }

  function renderMessages(items) {
    if (!messages) {
      return;
    }

    messages.innerHTML = '';

    if (!items || !items.length) {
      if (empty) {
        messages.appendChild(empty);
      }
      return;
    }

    items.forEach((item) => {
      const bubble =
        document.createElement('div');
      bubble.className =
        `wa-message ${item.role === 'user' ? 'user' : 'assistant'}`;

      const copy =
        document.createElement('div');
      copy.className =
        'wa-message-copy';
      copy.textContent =
        item.content || '';

      const meta =
        document.createElement('div');
      meta.className =
        'wa-message-meta';

      const channel =
        document.createElement('span');
      channel.className =
        'wa-message-channel';
      channel.textContent =
        labelForChannel(
          item.channel
        );

      meta.appendChild(channel);
      bubble.appendChild(copy);
      bubble.appendChild(meta);
      messages.appendChild(bubble);
    });

    messages.scrollTop =
      messages.scrollHeight;
  }

  async function refreshContinuity() {
    const response =
      await fetch(
        `/api/session/${encodeURIComponent(currentSessionId)}/continuity`,
        {
          cache: 'no-store'
        }
      );

    if (!response.ok) {
      throw new Error(
        'No se pudo recuperar la continuidad de la sesión'
      );
    }

    const data =
      await response.json();

    renderJourney(
      data.continuity
    );
    renderMessages(
      data.recentMessages || []
    );

    return data;
  }

  function setSending(value) {
    sending = value;
    input.disabled = value;
    sendButton.disabled = value;
    sendButton.textContent =
      value
        ? 'Enviando...'
        : 'Enviar';
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (sending) {
      return;
    }

    const message =
      input.value.trim();

    if (!message) {
      return;
    }

    setSending(true);

    try {
      await associateCustomer();

      const response =
        await fetch(
          '/api/channels/whatsapp/inbound',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              message,
              sessionId:
                currentSessionId,
              providerMessageId:
                createProviderMessageId()
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          `HTTP ${response.status}`
        );
      }

      input.value = '';

      if (data.sessionId) {
        currentSessionId =
          data.sessionId;
        sessionStorage.setItem(
          'chatSessionId',
          currentSessionId
        );
      }

      await refreshContinuity();

      if (data.handoff) {
        input.disabled = true;
        sendButton.disabled = true;
        footnote.textContent =
          `La consulta fue derivada al asesor en el caso ${data.handoff.caseId}. El contexto de los canales recorridos quedó transferido.`;
        return;
      }

      if (
        data.adapter &&
        data.adapter.liveProviderConnected ===
          false
      ) {
        footnote.textContent =
          'Respuesta procesada por el contrato de adaptador WhatsApp simulado. No se realizó ningún envío a un proveedor externo.';
      }
    } catch (error) {
      console.error(
        '[WHATSAPP] Error:',
        error
      );
      footnote.textContent =
        error.message ||
        'No se pudo procesar el mensaje.';
    } finally {
      if (!input.disabled) {
        setSending(false);
      }
    }
  }

  async function init() {
    try {
      currentSessionId =
        getOrCreateSessionId();

      const auth =
        await loadAuth();

      if (!auth) {
        return;
      }

      currentCustomerId =
        auth.user.customerId;
      customerName.textContent =
        `${auth.user.name} · autenticado`;

      await associateCustomer();
      await refreshContinuity();

      input.focus();
    } catch (error) {
      console.error(
        '[WHATSAPP] Init:',
        error
      );
      customerName.textContent =
        'No se pudo iniciar el simulador';
      continuityLabel.textContent =
        error.message ||
        'Revisa la sesión autenticada';
      input.disabled = true;
      sendButton.disabled = true;
    }
  }

  form.addEventListener(
    'submit',
    sendMessage
  );

  init();
})();

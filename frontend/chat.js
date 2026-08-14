(function () {
  // =========================================================
  // ELEMENTOS DEL CHAT
  // =========================================================

  const chatMessages =
    document.getElementById('chatMessages');

  const chatWrapper =
    document.getElementById('chatWrapper');

  const chatTimer =
    document.getElementById('chatTimer');

  const userInput =
    document.getElementById('userInput');

  const sendButton =
    document.getElementById('sendButton');

  const sidebar =
    document.getElementById('sidebar');

  const toggleSidebarBtn =
    document.getElementById('toggleSidebar');

  const newChatButton =
    document.getElementById('newChatButton');


  // =========================================================
  // PERSONA 3 - SATISFACCIÓN
  // =========================================================

  const finishChatButton =
    document.getElementById(
      'finishChatButton'
    );

  const satisfactionModal =
    document.getElementById(
      'satisfactionModal'
    );

  const ratingButtons =
    document.querySelectorAll(
      '.rating-button'
    );

  const satisfactionComment =
    document.getElementById(
      'satisfactionComment'
    );

  const submitSatisfactionButton =
    document.getElementById(
      'submitSatisfactionButton'
    );

  const skipSatisfactionButton =
    document.getElementById(
      'skipSatisfactionButton'
    );

  const satisfactionError =
    document.getElementById(
      'satisfactionError'
    );


  // =========================================================
  // CONFIGURACIÓN
  // =========================================================

  const SESSION_TIMEOUT_MS =
    10 * 60 * 1000;


  const chatState = {
    lastActivity: Date.now(),
    sessionEnded: false
  };


  let timerInterval = null;

  let selectedRating = null;

  let interactionFinished = false;

  let sendingMessage = false;

  let hasUserInteraction = false;

  // =========================================================
  // SESIONES
  // =========================================================

  function crearSessionId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        'function'
    ) {
      return (
        `s_${window.crypto.randomUUID()}`
      );
    }

    // Fallback para navegadores
    // sin randomUUID().
    return (
      `s_${Date.now()}_` +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }


  function obtenerOCrearSessionId() {
    let sessionId =
      sessionStorage.getItem(
        'chatSessionId'
      );

    if (!sessionId) {
      sessionId =
        crearSessionId();

      sessionStorage.setItem(
        'chatSessionId',
        sessionId
      );
    }

    return sessionId;
  }


  let currentSessionId =
    obtenerOCrearSessionId();


  // =========================================================
  // SCROLL
  // =========================================================

  function scrollToBottom() {
    if (!chatWrapper) {
      return;
    }

    setTimeout(
      () => {
        chatWrapper.scrollTo({
          top:
            chatWrapper.scrollHeight,

          behavior:
            'smooth'
        });
      },
      50
    );
  }


  // =========================================================
  // TEMPORIZADOR
  // =========================================================

  function formatTime(ms) {
    const totalSeconds =
      Math.max(
        0,
        Math.ceil(ms / 1000)
      );

    const minutes =
      Math.floor(
        totalSeconds / 60
      );

    const seconds =
      totalSeconds % 60;

    return (
      `${minutes}:` +
      seconds
        .toString()
        .padStart(2, '0')
    );
  }


  function updateTimer() {
    if (!chatTimer) {
      return;
    }

    if (
      chatState.sessionEnded ||
      interactionFinished
    ) {
      chatTimer.textContent =
        'Finalizado';

      return;
    }

    const elapsed =
      Date.now() -
      chatState.lastActivity;

    const remaining =
      SESSION_TIMEOUT_MS -
      elapsed;

    if (remaining <= 0) {
      chatState.sessionEnded =
        true;

      chatTimer.textContent =
        '00:00';

      appendMessage(
        'La sesión se cerró por inactividad. Puedes iniciar una nueva consulta para continuar.',
        'bot'
      );

      stopTimer();

      return;
    }

    chatTimer.textContent =
      formatTime(remaining);
  }


  function startTimer() {
    if (timerInterval) {
      return;
    }

    timerInterval =
      setInterval(
        updateTimer,
        1000
      );

    updateTimer();
  }


  function stopTimer() {
    if (!timerInterval) {
      return;
    }

    clearInterval(
      timerInterval
    );

    timerInterval = null;
  }


  // =========================================================
  // MENSAJES
  // =========================================================

  function escapeHtml(text) {
    return String(text)
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }


  function formatMarkdown(text) {
    if (!text) {
      return '';
    }

    // Primero escapamos HTML para impedir
    // que una respuesta del modelo inyecte
    // etiquetas arbitrarias.
    return escapeHtml(text)
      .replace(
        /\*\*(.*?)\*\*/g,
        '<strong>$1</strong>'
      )
      .replace(
        /^---$/gm,
        '<hr style="border:0; border-top:1px solid #e0e0e0; margin:10px 0;">'
      )
      .replace(
        /^\s*[\*\-]\s+(.*)$/gm,
        '<li style="margin-left:15px;">$1</li>'
      )
      .replace(
        /\n/g,
        '<br>'
      );
  }


  function appendMessage(
    text,
    sender
  ) {
    if (!chatMessages) {
      return;
    }

    const div =
      document.createElement(
        'div'
      );

    div.className =
      'message ' +
      (
        sender === 'user'
          ? 'user'
          : 'bot'
      );

    if (sender === 'bot') {
      div.innerHTML =
        formatMarkdown(text);
    } else {
      div.textContent =
        text;
    }

    chatMessages.appendChild(
      div
    );

    scrollToBottom();
  }


  function showTyping() {
    if (!chatMessages) {
      return;
    }

    // Evita crear dos indicadores.
    if (
      document.getElementById(
        'typingIndicator'
      )
    ) {
      return;
    }

    const typing =
      document.createElement(
        'div'
      );

    typing.className =
      'message bot typing';

    typing.id =
      'typingIndicator';

    typing.textContent =
      'Movistar Bot está escribiendo...';

    chatMessages.appendChild(
      typing
    );

    scrollToBottom();
  }


  function hideTyping() {
    const typing =
      document.getElementById(
        'typingIndicator'
      );

    if (typing) {
      typing.remove();
    }
  }


  // =========================================================
  // ESTADO DEL COMPOSITOR
  // =========================================================

  function disableChatComposer() {
    interactionFinished =
      true;

    chatState.sessionEnded =
      true;

    stopTimer();

    if (chatTimer) {
      chatTimer.textContent =
        'Finalizado';
    }

    if (userInput) {
      userInput.disabled =
        true;
    }

    if (sendButton) {
      sendButton.disabled =
        true;
    }

    if (finishChatButton) {
      finishChatButton.disabled =
        true;
    }
  }


  function enableChatComposer() {
    interactionFinished =
      false;

    chatState.sessionEnded =
      false;

    if (userInput) {
      userInput.disabled =
        false;
    }

    if (sendButton) {
      sendButton.disabled =
        false;
    }

    if (finishChatButton) {
      finishChatButton.disabled =
        false;
    }
  }


  // =========================================================
  // ENCUESTA DE SATISFACCIÓN - HU05
  // =========================================================

  function resetSatisfactionForm() {
    selectedRating = null;

    ratingButtons.forEach(
      (button) => {
        button.classList.remove(
          'selected'
        );
      }
    );

    if (satisfactionComment) {
      satisfactionComment.value =
        '';
    }

    if (satisfactionError) {
      satisfactionError.textContent =
        '';

      satisfactionError.classList.add(
        'hidden'
      );
    }

    if (
      submitSatisfactionButton
    ) {
      submitSatisfactionButton.disabled =
        false;

      submitSatisfactionButton.textContent =
        'Enviar calificación';
    }
  }


  function showSatisfactionModal() {
    resetSatisfactionForm();

    if (!satisfactionModal) {
      return;
    }

    satisfactionModal.classList.remove(
      'hidden'
    );
  }


  function hideSatisfactionModal() {
    if (!satisfactionModal) {
      return;
    }

    satisfactionModal.classList.add(
      'hidden'
    );
  }


  async function finishCurrentInteraction() {
    if (interactionFinished) {
      showSatisfactionModal();
      return;
    }
    if (!hasUserInteraction) {
      appendMessage(
        'Realiza una consulta antes de finalizar la atención.',
        'bot'
      );
      return;
    }

    if (!currentSessionId) {
      return;
    }

    try {
      if (finishChatButton) {
        finishChatButton.disabled =
          true;
      }

      const response =
        await fetch(
          `/api/metrics/${encodeURIComponent(
            currentSessionId
          )}/end`,
          {
            method: 'POST'
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'No se pudo finalizar la interacción'
        );
      }

      disableChatComposer();

      appendMessage(
        'Tu consulta ha finalizado. Gracias por comunicarte con Movistar.',
        'bot'
      );

      showSatisfactionModal();

    } catch (error) {
      console.error(
        '[CHAT] Error finalizando interacción:',
        error
      );

      if (finishChatButton) {
        finishChatButton.disabled =
          false;
      }

      appendMessage(
        'No pude finalizar la consulta en este momento. Intenta nuevamente.',
        'bot'
      );
    }
  }


  async function submitSatisfaction() {
    if (!selectedRating) {
      if (satisfactionError) {
        satisfactionError.textContent =
          'Selecciona una calificación del 1 al 5.';

        satisfactionError.classList.remove(
          'hidden'
        );
      }

      return;
    }

    try {
      if (
        submitSatisfactionButton
      ) {
        submitSatisfactionButton.disabled =
          true;

        submitSatisfactionButton.textContent =
          'Enviando...';
      }

      const response =
        await fetch(
          `/api/metrics/${encodeURIComponent(
            currentSessionId
          )}/satisfaction`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                rating:
                  selectedRating,

                comment:
                  satisfactionComment
                    ? satisfactionComment
                        .value
                        .trim()
                    : ''
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'No se pudo registrar la calificación'
        );
      }

      hideSatisfactionModal();

      console.log(
        '[CHAT] Satisfacción registrada:',
        data.satisfaction
      );

      appendMessage(
        '¡Gracias por tu calificación! Tu opinión nos ayuda a mejorar.',
        'bot'
      );

    } catch (error) {
      console.error(
        '[CHAT] Error enviando satisfacción:',
        error
      );

      if (satisfactionError) {
        satisfactionError.textContent =
          'No se pudo enviar la calificación. Intenta nuevamente.';

        satisfactionError.classList.remove(
          'hidden'
        );
      }

      if (
        submitSatisfactionButton
      ) {
        submitSatisfactionButton.disabled =
          false;

        submitSatisfactionButton.textContent =
          'Enviar calificación';
      }
    }
  }


  // =========================================================
  // NUEVA CONVERSACIÓN
  // =========================================================

  async function startNewChat() {
    const oldSessionId =
      currentSessionId;

    // El backend finaliza la interacción
    // anterior como NEW_CHAT únicamente si
    // todavía estaba ACTIVE.
    if (oldSessionId) {
      try {
        await fetch(
          `/api/session/${encodeURIComponent(
            oldSessionId
          )}`,
          {
            method:
              'DELETE'
          }
        );

      } catch (error) {
        // No bloqueamos la creación de una
        // nueva sesión si falla la limpieza.
        console.warn(
          '[CHAT] No se pudo eliminar la sesión anterior:',
          error
        );
      }
    }

    currentSessionId =
      crearSessionId();

    sessionStorage.setItem(
      'chatSessionId',
      currentSessionId
    );

    // Si el cliente inició sesión en Mi Movistar,
    // una nueva consulta conserva su identidad.
    await associateAuthenticatedCustomer(
      currentSessionId
    );

    chatState.lastActivity =
      Date.now();

    chatState.sessionEnded =
      false;

    sendingMessage = false;

    hasUserInteraction = false;

    stopTimer();

    enableChatComposer();

    hideSatisfactionModal();

    resetSatisfactionForm();

    hideTyping();

    if (chatMessages) {
      chatMessages.innerHTML =
        '';
    }

    if (finishChatButton) {
      finishChatButton.disabled = true;
    }

    appendMessage(
      '¡Hola! Soy tu asistente virtual Movistar. ¿En qué puedo ayudarte hoy?',
      'bot'
    );

    if (userInput) {
      userInput.value =
        '';

      userInput.style.height =
        'auto';

      userInput.focus();
    }

    startTimer();

    console.log(
      '[CHAT] Nueva sesión:',
      currentSessionId
    );
  }


  // =========================================================
  // ENVÍO DE MENSAJES
  // =========================================================

  /**
   * Envía un texto como si el usuario lo hubiera escrito.
   *
   * Lo usan los chips de seguimiento: `sendMessage` lee del input, así que se
   * rellena y se dispara el mismo camino, sin duplicar la lógica de envío.
   */
  function enviarTextoComoUsuario(texto) {
    if (!userInput || sendingMessage) {
      return;
    }

    userInput.value = texto;
    sendMessage();
  }

  async function sendMessage() {
    if (sendingMessage) {
      return;
    }

    const text =
      userInput &&
      userInput.value.trim();

    if (!text) {
      return;
    }

    // Los chips de la respuesta anterior ya no aplican: dejarlos invita a
    // hacer clic sobre una sugerencia fuera de contexto.
    if (window.Interaccion) {
      window.Interaccion.limpiarChips();
    }


    // Si el temporizador terminó la sesión,
    // creamos una nueva conversación antes
    // de mandar el nuevo mensaje.
    if (
      chatState.sessionEnded &&
      !interactionFinished
    ) {
      await startNewChat();
    }


    // Una interacción finalizada manualmente
    // o por handoff no acepta mensajes nuevos.
    if (interactionFinished) {
      appendMessage(
        'Esta consulta ya finalizó. Selecciona "Nueva consulta" para comenzar otra conversación.',
        'bot'
      );

      return;
    }


    sendingMessage = true;

    if (sendButton) {
      sendButton.disabled =
        true;
    }


    appendMessage(
      text,
      'user'
    );


    if (userInput) {
      userInput.value =
        '';

      userInput.style.height =
        'auto';
    }


    chatState.lastActivity =
      Date.now();

    chatState.sessionEnded =
      false;

    startTimer();
    updateTimer();

    showTyping();


    try {
      const response =
        await fetch(
          '/api/chat',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                message:
                  text,

                sessionId:
                  currentSessionId
              })
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.error ||
          data.reply ||
          `HTTP ${response.status}`
        );
      }

      hasUserInteraction = true;
      if (
        finishChatButton &&
        !interactionFinished
      ) {
        finishChatButton.disabled = false;
      }

      hideTyping();


      // El backend es la autoridad final
      // sobre el sessionId utilizado.
      if (data.sessionId) {
        currentSessionId =
          data.sessionId;

        sessionStorage.setItem(
          'chatSessionId',
          currentSessionId
        );
      }


      if (
        data &&
        data.reply
      ) {
        appendMessage(
          data.reply,
          'bot'
        );

        // Tarjeta de recibo y chips de seguimiento. Sus datos vienen del
        // bloque de hechos del backend, así que la vista no calcula ningún
        // monto por su cuenta.
        if (window.Interaccion) {
          window.Interaccion.renderizarRespuesta(data, (textoDelChip) => {
            enviarTextoComoUsuario(textoDelChip);
          });
        }
      } else {
        appendMessage(
          'No se recibió respuesta del servidor.',
          'bot'
        );
      }


      // =====================================================
      // HANDOFF
      // =====================================================

      if (data.handoff) {
        disableChatComposer();

        console.log(
          '[CHAT] Consulta derivada:',
          data.handoff
        );

        // Si acaba de producirse el handoff,
        // mostramos la encuesta.
        //
        // Si alreadyTransferred === true,
        // significa que el backend solo informó
        // sobre un caso que ya existía.
        if (
          !data.handoff
            .alreadyTransferred
        ) {
          setTimeout(
            () => {
              showSatisfactionModal();
            },
            400
          );
        }
      }


      chatState.lastActivity =
        Date.now();

    } catch (error) {
      hideTyping();

      console.error(
        '[CHAT] Error:',
        error
      );

      appendMessage(
        'No pudimos procesar tu consulta. Verifica que el backend esté encendido e intenta nuevamente.',
        'bot'
      );

    } finally {
      sendingMessage = false;

      if (
        sendButton &&
        !interactionFinished
      ) {
        sendButton.disabled =
          false;
      }

      if (
        userInput &&
        !interactionFinished
      ) {
        userInput.focus();
      }
    }
  }


  // =========================================================
  // QUICK PROMPTS
  // =========================================================

  window.sendQuickPrompt =
    function (promptText) {
      if (
        !userInput ||
        interactionFinished
      ) {
        return;
      }

      userInput.value =
        promptText;

      sendMessage();
    };


  // =========================================================
  // EVENTOS DEL CHAT
  // =========================================================

  if (userInput) {
    userInput.addEventListener(
      'input',
      () => {
        userInput.style.height =
          'auto';

        userInput.style.height =
          Math.min(
            userInput.scrollHeight,
            120
          ) + 'px';
      }
    );


    userInput.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key ===
            'Enter' &&
          !event.shiftKey
        ) {
          event.preventDefault();

          sendMessage();
        }
      }
    );
  }


  if (sendButton) {
    sendButton.addEventListener(
      'click',
      sendMessage
    );
  }


  if (newChatButton) {
    newChatButton.addEventListener(
      'click',
      startNewChat
    );
  }


  if (finishChatButton) {
    finishChatButton.addEventListener(
      'click',
      finishCurrentInteraction
    );
  }


  // =========================================================
  // EVENTOS DE SATISFACCIÓN
  // =========================================================

  ratingButtons.forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          selectedRating =
            Number(
              button.dataset.rating
            );

          ratingButtons.forEach(
            (item) => {
              item.classList.remove(
                'selected'
              );
            }
          );

          button.classList.add(
            'selected'
          );

          if (satisfactionError) {
            satisfactionError.classList.add(
              'hidden'
            );
          }
        }
      );
    }
  );


  if (
    submitSatisfactionButton
  ) {
    submitSatisfactionButton.addEventListener(
      'click',
      submitSatisfaction
    );
  }


  if (
    skipSatisfactionButton
  ) {
    skipSatisfactionButton.addEventListener(
      'click',
      () => {
        hideSatisfactionModal();

        console.log(
          '[CHAT] Usuario omitió la encuesta'
        );
      }
    );
  }


  // =========================================================
  // SIDEBAR
  // =========================================================

  if (
    toggleSidebarBtn &&
    sidebar
  ) {
    toggleSidebarBtn.addEventListener(
      'click',
      () => {
        sidebar.classList.toggle(
          'collapsed'
        );
      }
    );
  }

  let currentUserState = null;

  function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginButton');
    const userProfileBtn = document.getElementById('userProfileButton');
    const badgeText = document.getElementById('userProfileBadgeText');

    // Nivel de identidad en el encabezado: "Modo general" o "Verificado".
    if (window.Interaccion) {
      window.Interaccion.actualizarBadgeIdentidad(user);
    }

    if (user) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userProfileBtn) {
        userProfileBtn.classList.remove('hidden');
        if (badgeText) {
          badgeText.textContent = `👤 ${user.name || user.phone}`;
        }
      }
      const pName = document.getElementById('profileModalName');
      const pPhone = document.getElementById('profileModalPhone');
      const pCustomer = document.getElementById('profileModalCustomerId');

      if (pName) pName.textContent = user.name || 'Usuario Mi Movistar';
      if (pPhone) pPhone.textContent = user.phone || '-';
      if (pCustomer) pCustomer.textContent = user.customerId || 'Sin DNI asociado';
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userProfileBtn) userProfileBtn.classList.add('hidden');
    }
  }

  async function associateAuthenticatedCustomer(
    sessionId
  ) {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        sessionStorage.removeItem('movistarDemoCustomerId');
        currentUserState = null;
        updateAuthUI(null);
        return null;
      }

      const resp = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (resp.status === 401) {
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('movistarDemoCustomerId');
        currentUserState = null;
        updateAuthUI(null);
        return null;
      }

      const data = await resp.json();
      if (!data || !data.user) {
        currentUserState = null;
        updateAuthUI(null);
        return null;
      }

      currentUserState = data.user;
      updateAuthUI(data.user);

      const customerId = data.user.customerId || null;

      // Asociar el cliente a la sesión de chat.
      //
      // Antes se ignoraba el resultado: si el servidor rechazaba la
      // asociación, el usuario quedaba "logueado" pero sin cuenta activa, y
      // el chat le seguía pidiendo iniciar sesión sin explicar por qué.
      if (customerId) {
        try {
          const asociacion = await fetch(`/api/session/${encodeURIComponent(sessionId)}/customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ customerId })
          });

          if (!asociacion.ok) {
            const detalle = await asociacion.json().catch(() => ({}));
            console.warn('[CHAT] no se pudo asociar el cliente:', asociacion.status, detalle);

            appendMessage(
              detalle.error || 'No pude asociar tu cuenta a esta conversación. Puedo derivarte con un asesor.',
              'bot'
            );

            sessionStorage.removeItem('movistarDemoCustomerId');
            // `false` distingue "el servidor lo rechazó" de `null`, que es
            // simplemente no tener documento asociado.
            return false;
          }
        } catch (e) {
          console.warn('[CHAT] error notifying session of customer:', e);
          appendMessage(
            'No pude conectar con el servidor para cargar tu cuenta. Revisa tu conexión e intenta de nuevo.',
            'bot'
          );
          return false;
        }

        sessionStorage.setItem('movistarDemoCustomerId', customerId);
      }

      return customerId;
    } catch (error) {
      console.warn('[CHAT] No se pudo recuperar el contexto autenticado:', error);
      currentUserState = null;
      updateAuthUI(null);
      return null;
    }
  }


  async function bootstrapFromApp(
    authenticatedCustomerId
  ) {
    const params =
      new URLSearchParams(
        window.location.search
      );

    if (
      params.get('source') !==
      'app'
    ) {
      return;
    }

    const prompt =
      params.get(
        'prompt'
      );

    if (!authenticatedCustomerId) {
      appendMessage(
        'Tu sesión de Mi Movistar ya no está activa. Puedes iniciar sesión nuevamente para continuar con tu información personal.',
        'bot'
      );

      history.replaceState(
        {},
        '',
        '/chat'
      );
      return;
    }

    if (
      prompt &&
      userInput
    ) {
      userInput.value =
        prompt;

      await sendMessage();
    }

    // Limpiamos parámetros para evitar
    // repetir el prompt al refrescar.
    history.replaceState(
      {},
      '',
      '/chat'
    );
  }


  function syncBackToAppLink() {
    const backToAppLink =
      document.getElementById(
        'backToAppLink'
      );

    if (backToAppLink) {
      backToAppLink.href =
        '/app';
    }
  }

  // =========================================================
  // AUTH MODAL — LOGIN & REGISTER
  // =========================================================

  function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    clearLoginMessages();
    showLoginView();
    modal.classList.remove('hidden');
    setTimeout(() => {
      const p = document.getElementById('loginPhone');
      if (p) p.focus();
    }, 120);
  }

  function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.add('hidden');
    clearLoginMessages();
  }

  function showLoginView() {
    document.getElementById('loginView')?.classList.remove('hidden');
    document.getElementById('registerView')?.classList.add('hidden');
  }

  function showRegisterView() {
    document.getElementById('loginView')?.classList.add('hidden');
    document.getElementById('registerView')?.classList.remove('hidden');
    setTimeout(() => {
      const p = document.getElementById('regPhone');
      if (p) p.focus();
    }, 120);
  }

  function clearLoginMessages() {
    ['loginMessage', 'registerMessage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ''; el.className = 'login-message'; el.removeAttribute('style'); }
    });
  }

  function setMsg(id, text, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'login-message' + (isError ? ' error' : '');
    el.removeAttribute('style');
  }

  // LOGIN: phone + password
  async function submitLogin(overridePhone, overridePassword) {
    const phone    = overridePhone    || document.getElementById('loginPhone')?.value?.trim()    || '';
    const password = overridePassword || document.getElementById('loginPassword')?.value || '';
    const msgId    = 'loginMessage';

    if (!phone || !/^9\d{8}$/.test(phone)) {
      setMsg(msgId, 'Número inválido. Debe tener 9 dígitos y comenzar con 9.', true);
      return;
    }
    if (!password || password.length < 4) {
      setMsg(msgId, 'Ingresa tu contraseña (mínimo 4 caracteres).', true);
      return;
    }

    const submitBtn  = document.getElementById('submitLogin');
    const showRegBtn = document.getElementById('showRegister');
    const closeBtn   = document.getElementById('closeLogin');

    if (submitBtn)  { submitBtn.disabled  = true;  submitBtn.textContent  = 'Entrando...'; }
    if (showRegBtn)   showRegBtn.disabled = true;
    if (closeBtn)     closeBtn.disabled  = true;

    try {
      setMsg(msgId, 'Verificando...', false);

      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      let data = null;
      try { data = await resp.json(); } catch (_) {}

      if (!resp.ok) {
        const errMsg = (data && data.error) ? data.error : 'Número o contraseña incorrectos';
        setMsg(msgId, errMsg, true);
        return;
      }

      localStorage.setItem('authToken', data.token);

      // El modal se cierra solo si la cuenta quedó realmente asociada.
      // Antes se cerraba antes de intentarlo, así que un fallo de asociación
      // dejaba al usuario en el chat aparentemente logueado pero sin cuenta,
      // y el asistente le seguía pidiendo iniciar sesión.
      const asociado = await associateAuthenticatedCustomer(currentSessionId);

      if (asociado === false) {
        localStorage.removeItem('authToken');
        setMsg(msgId, 'Entraste, pero no pude cargar tu cuenta de facturación. Revisa el motivo en el chat o prueba con otra cuenta.', true);
        return;
      }

      hideLoginModal();

    } catch (e) {
      console.error('[CHAT] login error', e);
      setMsg(msgId, 'Error de conexion. Intenta nuevamente.', true);
    } finally {
      if (submitBtn)  { submitBtn.disabled  = false; submitBtn.textContent  = 'Entrar'; }
      if (showRegBtn)   showRegBtn.disabled = false;
      if (closeBtn)     closeBtn.disabled  = false;
    }
  }

  // REGISTER: phone + DNI + password
  async function submitRegister() {
    const phone    = document.getElementById('regPhone')?.value?.trim()    || '';
    const dni      = document.getElementById('regDni')?.value?.trim()      || '';
    const password = document.getElementById('regPassword')?.value         || '';
    const msgId    = 'registerMessage';

    // Exactamente 9 dígitos, igual que validatePhone en el backend. El patrón
    // anterior aceptaba 8, así que el formulario dejaba pasar números que el
    // servidor luego rechazaba con un mensaje que no cuadraba con el aviso.
    if (!phone || !/^9\d{8}$/.test(phone)) {
      setMsg(msgId, 'Número inválido. Debe tener 9 dígitos y comenzar con 9.', true);
      return;
    }
    if (!password || password.length < 4) {
      setMsg(msgId, 'La contrasena debe tener al menos 4 caracteres.', true);
      return;
    }

    const submitBtn = document.getElementById('submitRegister');
    const cancelBtn = document.getElementById('cancelRegister');

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creando...'; }
    if (cancelBtn)   cancelBtn.disabled = true;

    try {
      setMsg(msgId, 'Registrando cuenta...', false);

      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, dni })
      });

      let data = null;
      try { data = await resp.json(); } catch (_) {}

      if (!resp.ok) {
        if (resp.status === 409) {
          // El número ya tiene cuenta, y su contraseña no tiene por qué ser
          // la que se acaba de escribir. Antes se intentaba entrar con ella
          // igualmente y el usuario recibía un "contraseña incorrecta" que no
          // explicaba nada. Se le lleva al login con el campo en blanco.
          setMsg(msgId, 'Este número ya tiene una cuenta. Ingresa su contraseña para entrar.', true);
          await new Promise(r => setTimeout(r, 1200));
          showLoginView();

          const lp = document.getElementById('loginPhone');
          const lpw = document.getElementById('loginPassword');
          if (lp) lp.value = phone;
          if (lpw) { lpw.value = ''; lpw.focus(); }

          setMsg('loginMessage', 'Este número ya estaba registrado. Escribe su contraseña.', false);
          return;
        }
        const errMsg = (data && data.error) ? data.error : 'No se pudo registrar';
        setMsg(msgId, errMsg, true);
        return;
      }

      setMsg(msgId, 'Cuenta creada. Iniciando sesión...', false);
      await new Promise(r => setTimeout(r, 600));
      showLoginView();
      const lp = document.getElementById('loginPhone');
      const lpw = document.getElementById('loginPassword');
      if (lp) lp.value = phone;
      if (lpw) lpw.value = password;
      await submitLogin(phone, password);

    } catch (e) {
      console.error('[CHAT] register error', e);
      setMsg(msgId, 'Error de conexion. Intenta nuevamente.', true);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Crear cuenta'; }
      if (cancelBtn)   cancelBtn.disabled = false;
    }
  }

  // LOGOUT
  async function logout() {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('movistarDemoCustomerId');
      currentUserState = null;
      updateAuthUI(null);
      hideProfileModal();
    }
  }

  function showProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (modal) modal.classList.remove('hidden');
  }

  function hideProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (modal) modal.classList.add('hidden');
  }


  // =========================================================
  // INICIO
  // =========================================================

  document.addEventListener('DOMContentLoaded', async () => {
    appendMessage('Hola! Soy tu asistente virtual Movistar. En que puedo ayudarte hoy?', 'bot');
    console.log('[CHAT] Sesion activa:', currentSessionId);

    enableChatComposer();
    hideSatisfactionModal();
    syncBackToAppLink();

    const authenticatedCustomerId = await associateAuthenticatedCustomer(currentSessionId);

    // Login modal wiring
    document.getElementById('loginButton')    ?.addEventListener('click', showLoginModal);
    document.getElementById('closeLogin')     ?.addEventListener('click', hideLoginModal);
    document.getElementById('submitLogin')    ?.addEventListener('click', () => submitLogin());
    document.getElementById('showRegister')   ?.addEventListener('click', showRegisterView);
    document.getElementById('backToLogin')    ?.addEventListener('click', showLoginView);
    document.getElementById('cancelRegister') ?.addEventListener('click', showLoginView);
    document.getElementById('submitRegister') ?.addEventListener('click', submitRegister);

    // Profile modal wiring
    document.getElementById('userProfileButton') ?.addEventListener('click', showProfileModal);
    document.getElementById('closeProfileModal') ?.addEventListener('click', hideProfileModal);
    document.getElementById('logoutButton')      ?.addEventListener('click', logout);

    // Close on backdrop click
    document.getElementById('loginModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'loginModal') hideLoginModal();
    });
    document.getElementById('userProfileModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'userProfileModal') hideProfileModal();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { hideLoginModal(); hideProfileModal(); }
    });

    // Enter key on inputs
    ['loginPhone', 'loginPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitLogin();
      });
    });
    ['regPhone', 'regDni', 'regPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitRegister();
      });
    });

    // Demo shortcuts — fill phone + password and auto-login
    document.getElementById('demoUserCarlos')?.addEventListener('click', () => {
      const lp = document.getElementById('loginPhone');
      const lpw = document.getElementById('loginPassword');
      if (lp) lp.value = '987654321';
      if (lpw) lpw.value = 'Demo1234!';
      submitLogin('987654321', 'Demo1234!');
    });
    document.getElementById('demoUserAna')?.addEventListener('click', () => {
      const lp = document.getElementById('loginPhone');
      const lpw = document.getElementById('loginPassword');
      if (lp) lp.value = '912345678';
      if (lpw) lpw.value = 'Demo1234!';
      submitLogin('912345678', 'Demo1234!');
    });

    startTimer();
    if (finishChatButton) finishChatButton.disabled = true;

    await bootstrapFromApp(authenticatedCustomerId);
  });
})();
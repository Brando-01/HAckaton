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

  async function bootstrapFromApp() {
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

    const customerId =
      params.get(
        'customerId'
      );

    const prompt =
      params.get(
        'prompt'
      );

    if (!customerId) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/session/${encodeURIComponent(
            currentSessionId
          )}/customer`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              customerId
            })
          }
        );

      if (!response.ok) {
        throw new Error(
          'No se pudo asociar el cliente'
        );
      }

      console.log(
        '[CHAT] Cliente autenticado desde app:',
        customerId
      );


      if (
        prompt &&
        userInput
      ) {
        userInput.value =
          prompt;

        await sendMessage();
      }


      // Limpiamos parámetros para evitar
      // repetir la acción al refrescar.
      history.replaceState(
        {},
        '',
        '/'
      );

    } catch (error) {
      console.error(
        '[CHAT] Error cargando contexto de app:',
        error
      );
    }
  }


  // =========================================================
  // INICIO
  // =========================================================

  document.addEventListener(
    'DOMContentLoaded',
    async () => {
      appendMessage(
        '¡Hola! Soy tu asistente virtual Movistar. ¿En qué puedo ayudarte hoy?',
        'bot'
      );

      console.log(
        '[CHAT] Sesión activa:',
        currentSessionId
      );

      enableChatComposer();

      hideSatisfactionModal();

      startTimer();

      if (finishChatButton) {
        finishChatButton.disabled =
          true;
      }

      await bootstrapFromApp();
    }
  );
})();
(function () {
  const chatMessages = document.getElementById('chatMessages');
  const chatWrapper = document.getElementById('chatWrapper');
  const chatTimer = document.getElementById('chatTimer');
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const newChatButton = document.getElementById('newChatButton');

  const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

  const chatState = {
    lastActivity: Date.now(),
    sessionEnded: false
  };

  let timerInterval = null;

  // -------------------------------------------------------
  // SESIONES
  // -------------------------------------------------------

  function crearSessionId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === 'function'
    ) {
      return `s_${window.crypto.randomUUID()}`;
    }

    // Fallback para navegadores sin randomUUID()
    return `s_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  function obtenerOCrearSessionId() {
    let sessionId =
      sessionStorage.getItem('chatSessionId');

    if (!sessionId) {
      sessionId = crearSessionId();

      sessionStorage.setItem(
        'chatSessionId',
        sessionId
      );
    }

    return sessionId;
  }

  let currentSessionId =
    obtenerOCrearSessionId();

  // -------------------------------------------------------
  // SCROLL
  // -------------------------------------------------------

  function scrollToBottom() {
    if (chatWrapper) {
      setTimeout(() => {
        chatWrapper.scrollTo({
          top: chatWrapper.scrollHeight,
          behavior: 'smooth'
        });
      }, 50);
    }
  }

  // -------------------------------------------------------
  // TEMPORIZADOR
  // -------------------------------------------------------

  function formatTime(ms) {
    const totalSeconds =
      Math.max(0, Math.ceil(ms / 1000));

    const minutes =
      Math.floor(totalSeconds / 60);

    const seconds =
      totalSeconds % 60;

    return `${minutes}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  function updateTimer() {
    if (!chatTimer) return;

    if (chatState.sessionEnded) {
      chatTimer.textContent = 'Finalizado';
      return;
    }

    const elapsed =
      Date.now() - chatState.lastActivity;

    const remaining =
      SESSION_TIMEOUT_MS - elapsed;

    if (remaining <= 0) {
      chatState.sessionEnded = true;
      chatTimer.textContent = '00:00';

      appendMessage(
        'La sesión se cerró por inactividad. Puedes escribir nuevamente para iniciar otra consulta.',
        'bot'
      );

      stopTimer();
      return;
    }

    chatTimer.textContent =
      formatTime(remaining);
  }

  function startTimer() {
    if (timerInterval) return;

    timerInterval =
      setInterval(updateTimer, 1000);

    updateTimer();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // -------------------------------------------------------
  // MENSAJES
  // -------------------------------------------------------

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMarkdown(text) {
    if (!text) return '';

    // Primero escapamos HTML para evitar que una respuesta
    // del modelo pueda inyectar etiquetas arbitrarias.
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
      .replace(/\n/g, '<br>');
  }

  function appendMessage(text, sender) {
    if (!chatMessages) return;

    const div =
      document.createElement('div');

    div.className =
      'message ' +
      (sender === 'user' ? 'user' : 'bot');

    if (sender === 'bot') {
      div.innerHTML =
        formatMarkdown(text);
    } else {
      div.textContent = text;
    }

    chatMessages.appendChild(div);

    scrollToBottom();
  }

  function showTyping() {
    if (!chatMessages) return;

    const t =
      document.createElement('div');

    t.className =
      'message bot typing';

    t.id =
      'typingIndicator';

    t.textContent =
      'Movistar Bot está escribiendo...';

    chatMessages.appendChild(t);

    scrollToBottom();
  }

  function hideTyping() {
    const t =
      document.getElementById(
        'typingIndicator'
      );

    if (t) {
      t.remove();
    }
  }

  // -------------------------------------------------------
  // NUEVA CONVERSACIÓN
  // -------------------------------------------------------

  async function startNewChat() {
    const oldSessionId =
      currentSessionId;

    // Intentamos eliminar la sesión anterior
    // del backend.
    if (oldSessionId) {
      try {
        await fetch(
          `http://localhost:3000/api/session/${encodeURIComponent(oldSessionId)}`,
          {
            method: 'DELETE'
          }
        );
      } catch (error) {
        // No bloqueamos al usuario si el servidor
        // no puede eliminar la sesión anterior.
        console.warn(
          'No se pudo eliminar la sesión anterior:',
          error
        );
      }
    }

    // Crear una conversación completamente nueva.
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

    stopTimer();

    if (chatMessages) {
      chatMessages.innerHTML = '';
    }

    appendMessage(
      '¡Hola! Soy tu asistente virtual Movistar. ¿En qué puedo ayudarte hoy?',
      'bot'
    );

    if (userInput) {
      userInput.value = '';
      userInput.style.height = 'auto';
      userInput.focus();
    }

    startTimer();

    console.log(
      '[CHAT] Nueva sesión:',
      currentSessionId
    );
  }

  // -------------------------------------------------------
  // ENVÍO DE MENSAJES
  // -------------------------------------------------------

  async function sendMessage() {
    const text =
      userInput &&
      userInput.value.trim();

    if (!text) return;

    // Si la sesión terminó por inactividad,
    // el siguiente mensaje inicia una nueva.
    if (chatState.sessionEnded) {
      await startNewChat();
    }

    appendMessage(
      text,
      'user'
    );

    if (userInput) {
      userInput.value = '';
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
      const res = await fetch(
        'http://localhost:3000/api/chat',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            message: text,
            sessionId:
              currentSessionId
          })
        }
      );

      if (!res.ok) {
        throw new Error(
          'HTTP ' + res.status
        );
      }

      const data =
        await res.json();

      hideTyping();

      // El backend es la autoridad final
      // sobre qué sessionId se utilizó.
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

      chatState.lastActivity =
        Date.now();

    } catch (err) {
      hideTyping();

      console.error(
        '[CHAT] Error:',
        err
      );

      appendMessage(
        'No pudimos conectar con el servidor. Verifica que tu backend esté encendido.',
        'bot'
      );
    }
  }

  // -------------------------------------------------------
  // QUICK PROMPTS
  // -------------------------------------------------------

  window.sendQuickPrompt =
    function (promptText) {
      if (userInput) {
        userInput.value =
          promptText;

        sendMessage();
      }
    };

  // -------------------------------------------------------
  // EVENTOS
  // -------------------------------------------------------

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
      (e) => {
        if (
          e.key === 'Enter' &&
          !e.shiftKey
        ) {
          e.preventDefault();
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

  // -------------------------------------------------------
  // INICIO
  // -------------------------------------------------------

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      appendMessage(
        '¡Hola! Soy tu asistente virtual Movistar. ¿En qué puedo ayudarte hoy?',
        'bot'
      );

      console.log(
        '[CHAT] Sesión activa:',
        currentSessionId
      );

      startTimer();
    }
  );
})();
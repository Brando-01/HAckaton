(function(){
  const chatMessages = document.getElementById('chatMessages');
  const chatWrapper = document.getElementById('chatWrapper'); // Contenedor que tiene el scroll
  const chatTimer = document.getElementById('chatTimer');
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggleSidebar');

  const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

  const chatState = {
    lastActivity: Date.now(),
    sessionEnded: false,
  };

  let timerInterval = null;

  // FUNCIÓN CLAVE: Auto-scroll suave al final del chat
  function scrollToBottom() {
    if (chatWrapper) {
      setTimeout(() => {
        chatWrapper.scrollTo({
          top: chatWrapper.scrollHeight,
          behavior: 'smooth'
        });
      }, 50); // Pequeño delay para asegurar que el DOM haya renderizado el mensaje completo
    }
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function updateTimer() {
    if (!chatTimer) return;
    if (chatState.sessionEnded) {
      chatTimer.textContent = 'Finalizado';
      return;
    }
    const elapsed = Date.now() - chatState.lastActivity;
    const remaining = SESSION_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      chatState.sessionEnded = true;
      chatTimer.textContent = '00:00';
      appendMessage('La sesión se cerró por inactividad. Puedes escribir nuevamente para iniciar otra consulta.', 'bot');
      stopTimer();
      return;
    }
    chatTimer.textContent = formatTime(remaining);
  }

  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^---$/gm, '<hr style="border:0; border-top:1px solid #e0e0e0; margin:10px 0;">')
      .replace(/^\s*[\*\-]\s+(.*)$/gm, '<li style="margin-left: 15px;">$1</li>')
      .replace(/\n/g, '<br>');
  }

  function appendMessage(text, sender){
    if(!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'message ' + (sender === 'user' ? 'user' : 'bot');
    
    if (sender === 'bot') {
      div.innerHTML = formatMarkdown(text);
    } else {
      div.textContent = text;
    }
    
    chatMessages.appendChild(div);
    scrollToBottom(); // Se ejecuta cada vez que aparece un mensaje
  }

  function showTyping(){
    const t = document.createElement('div');
    t.className = 'message bot typing';
    t.id = 'typingIndicator';
    t.textContent = 'Movistar Bot está escribiendo...';
    chatMessages.appendChild(t);
    scrollToBottom(); // Scroll también al mostrar que está tipeando
  }

  function hideTyping(){
    const t = document.getElementById('typingIndicator');
    if(t) t.remove();
  }

  async function sendMessage(){
    let text = userInput && userInput.value.trim();
    if(!text) return;

    appendMessage(text, 'user');
    
    if(userInput) {
      userInput.value = '';
      userInput.style.height = 'auto';
    }

    chatState.lastActivity = Date.now();
    showTyping();

    try {
      const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: text,
          sessionId: localStorage.getItem('chatSessionId') || 's_12345'
        })
      });

      if(!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      hideTyping();

      if(data && data.reply) {
        appendMessage(data.reply, 'bot');
      } else {
        appendMessage('No se recibió respuesta del servidor.', 'bot');
      }
    } catch(err) {
      hideTyping();
      appendMessage('No pudimos conectar con el servidor. Verifica que tu backend esté encendido.', 'bot');
    }
  }

  window.sendQuickPrompt = function(promptText) {
    if(userInput) {
      userInput.value = promptText;
      sendMessage();
    }
  };

  if(userInput) {
    userInput.addEventListener('input', () => {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    });

    userInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if(sendButton) sendButton.addEventListener('click', sendMessage);

  if(toggleSidebarBtn && sidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    appendMessage('¡Hola! Soy tu asistente virtual Movistar. ¿En qué puedo ayudarte hoy?', 'bot');
    startTimer();
  });

})();
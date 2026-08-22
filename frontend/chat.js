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

  const voiceInputButton =
    document.getElementById('voiceInputButton');

  const autoReadToggle =
    document.getElementById('autoReadToggle');

  const stopSpeechButton =
    document.getElementById('stopSpeechButton');

  const voiceStatus =
    document.getElementById('voiceStatus');

  const sidebar =
    document.getElementById('sidebar');

  const toggleSidebarBtn =
    document.getElementById('toggleSidebar');

  const sidebarBackdrop =
    document.getElementById('sidebarBackdrop');

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

  const mediaRecordingSupported = Boolean(
    navigator.mediaDevices?.getUserMedia && window.MediaRecorder
  );

  const speechSynthesisSupported =
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;

  let audioRecorder = null;

  let activeAudioStream = null;

  let recordedAudioChunks = [];

  let recordingLimitTimer = null;

  let listeningForSpeech = false;

  let autoReadEnabled = false;

  let activeUtterance = null;

  let activeSpeechButton = null;

  let preferredSpeechVoice = null;

  let neuralTtsAvailable = false;

  let neuralTtsTemporarilyDisabled = false;

  let activeNeuralAudio = null;

  let activeNeuralAudioUrl = '';

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


  // =========================================================
  // VOZ: DICTADO Y LECTURA EN ESPAÑOL PERUANO
  // =========================================================

  function setVoiceStatus(message, state = '') {
    if (!voiceStatus) return;
    voiceStatus.textContent = message || '';
    voiceStatus.className = `voice-status${state ? ` is-${state}` : ''}`;
  }

  function textForSpeech(rawText) {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return String(rawText || '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/(\d{2})\/(\d{2})\/(\d{4})/g, (_, day, month, year) => `${Number(day)} de ${months[Number(month) - 1] || month} de ${year}`)
      .replace(/S\/\s*([+-]?\d+)(?:\.(\d{1,2}))?/g, (_, units, decimal = '') => {
        const negative = String(units).startsWith('-');
        const soles = Math.abs(Number(units));
        const cents = Number(String(decimal).padEnd(2, '0')) || 0;
        return `${negative ? 'menos ' : ''}${soles} ${soles === 1 ? 'sol' : 'soles'}${cents ? ` con ${cents} céntimos` : ''}`;
      })
      .replace(/\bGB\b/gi, 'gigabytes')
      .replace(/\bMb\b/g, 'megabits')
      .replace(/\bVR\b/g, 'uve erre')
      .replace(/[|•]/g, ', ')
      .replace(/\n{2,}/g, '. ')
      // Cada renglón suele ser una idea distinta; cerrarlo como oración da a
      // la voz neural espacio para respirar y evita enumeraciones atropelladas.
      .replace(/\n/g, '. ')
      .replace(/\.{2,}/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function peruvianSpanishVoice() {
    if (!speechSynthesisSupported) return null;
    const voices = window.speechSynthesis.getVoices();
    const language = (voice) => String(voice.lang || '').toLowerCase().replace('_', '-');
    const score = (voice) => {
      const description = `${voice.name} ${voice.lang}`;
      const lang = language(voice);
      let points = 0;
      if (lang === 'es-pe') points += 80;
      else if (/per[uú]/i.test(description)) points += 75;
      else if (lang === 'es-mx' || lang === 'es-us' || lang === 'es-419') points += 50;
      else if (lang.startsWith('es-')) points += 35;
      if (/natural|neural|online/i.test(description)) points += 70;
      if (/google.*(?:español|spanish)/i.test(description)) points += 45;
      if (/elvira|dalia|ximena|sofia|helena|sabina|paulina/i.test(description)) points += 12;
      if (voice.localService) points += 2;
      return points;
    };
    preferredSpeechVoice = voices
      .filter((voice) => language(voice).startsWith('es-'))
      .sort((a, b) => score(b) - score(a))[0] || null;
    return preferredSpeechVoice;
  }

  function updateSpeechButton(button, state = 'idle') {
    if (!button) return;
    button.classList.toggle('is-speaking', state === 'speaking');
    button.classList.toggle('is-paused', state === 'paused');
    button.setAttribute('aria-pressed', String(state !== 'idle'));
    if (state === 'speaking') {
      button.innerHTML = '<span aria-hidden="true">⏸</span><span>Pausar</span>';
      button.title = 'Pausar lectura';
    } else if (state === 'paused') {
      button.innerHTML = '<span aria-hidden="true">▶</span><span>Continuar</span>';
      button.title = 'Continuar lectura';
    } else {
      button.innerHTML = '<span aria-hidden="true">🔊</span><span>Escuchar</span>';
      button.title = 'Leer este mensaje';
    }
  }

  function stopSpeech(announce = false) {
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
    if (activeNeuralAudio) {
      activeNeuralAudio.pause();
      activeNeuralAudio.removeAttribute('src');
      activeNeuralAudio.load();
      activeNeuralAudio = null;
    }
    if (activeNeuralAudioUrl) URL.revokeObjectURL(activeNeuralAudioUrl);
    activeNeuralAudioUrl = '';
    updateSpeechButton(activeSpeechButton, 'idle');
    activeSpeechButton = null;
    activeUtterance = null;
    if (stopSpeechButton) stopSpeechButton.classList.add('hidden');
    if (announce) setVoiceStatus('Lectura detenida.');
  }

  function setAutoRead(enabled, announce = true) {
    autoReadEnabled = Boolean(enabled && speechSynthesisSupported);
    if (autoReadToggle) {
      autoReadToggle.classList.toggle('is-active', autoReadEnabled);
      autoReadToggle.setAttribute('aria-pressed', String(autoReadEnabled));
      autoReadToggle.innerHTML = autoReadEnabled
        ? '<span aria-hidden="true">🔊</span> Lectura automática'
        : '<span aria-hidden="true">🔊</span> Leer respuestas';
    }
    if (!autoReadEnabled) stopSpeech(false);
    if (announce) {
      setVoiceStatus(autoReadEnabled ? 'Leeré en voz alta las próximas respuestas.' : 'Lectura automática desactivada.', 'ready');
    }
  }

  async function tryNeuralSpeech(spokenText, button) {
    const token = localStorage.getItem('authToken') || '';
    if (!neuralTtsAvailable || neuralTtsTemporarilyDisabled || !token) return false;
    try {
      setVoiceStatus('Preparando la voz peruana de Lucía…', 'processing');
      const response = await fetch('/api/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: spokenText })
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        if (response.status === 401) {
          clearClientAuthState();
          setVoiceStatus('Tu sesión venció. Usaré la voz en español del dispositivo.', 'ready');
        } else {
          neuralTtsTemporarilyDisabled = true;
          setVoiceStatus(problem.error || 'La voz neural no pudo generar el audio. Usaré la voz del dispositivo.', 'ready');
        }
        return false;
      }
      neuralTtsTemporarilyDisabled = false;
      const audioBlob = await response.blob();
      activeNeuralAudioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(activeNeuralAudioUrl);
      activeNeuralAudio = audio;
      activeSpeechButton = button;
      audio.onplay = () => {
        updateSpeechButton(button, 'speaking');
        if (stopSpeechButton) stopSpeechButton.classList.remove('hidden');
        setVoiceStatus('Lucía está hablando con voz peruana…', 'speaking');
      };
      audio.onpause = () => {
        if (!audio.ended && audio.currentTime > 0) updateSpeechButton(button, 'paused');
      };
      audio.onended = () => stopSpeech(false);
      audio.onerror = () => stopSpeech(false);
      await audio.play();
      return true;
    } catch (error) {
      stopSpeech(false);
      neuralTtsTemporarilyDisabled = true;
      setVoiceStatus('No pude conectar con la voz neural. Usaré la voz del dispositivo.', 'ready');
      return false;
    }
  }

  async function speakMessage(rawText, button, voiceLoadAttempt = 0) {
    if (!speechSynthesisSupported) {
      setVoiceStatus('La lectura de voz no está disponible en este navegador.', 'error');
      return;
    }

    if (listeningForSpeech) stopListening(true);

    if (button === activeSpeechButton && activeNeuralAudio) {
      if (activeNeuralAudio.paused) await activeNeuralAudio.play();
      else activeNeuralAudio.pause();
      return;
    }

    if (button === activeSpeechButton && window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        updateSpeechButton(button, 'speaking');
        setVoiceStatus('Lucía está hablando…', 'speaking');
      } else {
        window.speechSynthesis.pause();
        updateSpeechButton(button, 'paused');
        setVoiceStatus('Lectura pausada.');
      }
      return;
    }

    stopSpeech(false);
    const spokenText = textForSpeech(rawText);
    if (!spokenText) return;

    if (await tryNeuralSpeech(spokenText, button)) return;

    const selectedVoice = peruvianSpanishVoice();
    if (!selectedVoice && voiceLoadAttempt < 8) {
      setVoiceStatus('Preparando una voz más natural…', 'processing');
      window.setTimeout(() => speakMessage(rawText, button, voiceLoadAttempt + 1), 250);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'es-PE';
    utterance.rate = 0.95;
    utterance.pitch = 1.02;
    utterance.volume = 0.96;
    if (selectedVoice) utterance.voice = selectedVoice;

    activeUtterance = utterance;
    activeSpeechButton = button;
    utterance.onstart = () => {
      if (activeUtterance !== utterance) return;
      updateSpeechButton(button, 'speaking');
      if (stopSpeechButton) stopSpeechButton.classList.remove('hidden');
      setVoiceStatus('Lucía está hablando…', 'speaking');
    };
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      updateSpeechButton(button, 'idle');
      activeUtterance = null;
      activeSpeechButton = null;
      if (stopSpeechButton) stopSpeechButton.classList.add('hidden');
      setVoiceStatus('');
    };
    utterance.onerror = (event) => {
      if (activeUtterance !== utterance) return;
      updateSpeechButton(button, 'idle');
      activeUtterance = null;
      activeSpeechButton = null;
      if (stopSpeechButton) stopSpeechButton.classList.add('hidden');
      if (!['canceled', 'interrupted'].includes(event.error)) {
        setVoiceStatus('No pude reproducir el audio. Puedes intentarlo nuevamente.', 'error');
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function appendMessageAudioControl(messageElement, rawText) {
    if (!speechSynthesisSupported) return null;
    const actions = document.createElement('div');
    actions.className = 'message-audio-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-audio-button';
    button.setAttribute('aria-label', 'Leer este mensaje en voz alta');
    updateSpeechButton(button, 'idle');
    button.addEventListener('click', () => speakMessage(rawText, button));
    actions.appendChild(button);
    messageElement.appendChild(actions);
    return button;
  }

  function updateListeningState(listening) {
    listeningForSpeech = listening;
    if (!voiceInputButton) return;
    voiceInputButton.classList.toggle('is-listening', listening);
    voiceInputButton.setAttribute('aria-pressed', String(listening));
    voiceInputButton.title = listening ? 'Detener dictado' : 'Hablar para escribir';
  }

  function closeAudioStream() {
    if (recordingLimitTimer) window.clearTimeout(recordingLimitTimer);
    recordingLimitTimer = null;
    activeAudioStream?.getTracks().forEach((track) => track.stop());
    activeAudioStream = null;
  }

  function stopListening(cancel = false) {
    if (!audioRecorder || !listeningForSpeech) return;
    audioRecorder.cancelRequested = cancel;
    if (audioRecorder.state !== 'inactive') audioRecorder.stop();
  }

  function stopAllVoiceActivity() {
    if (audioRecorder && listeningForSpeech) stopListening(true);
    closeAudioStream();
    updateListeningState(false);
    stopSpeech(false);
    setVoiceStatus('');
  }

  function initializeVoiceFeatures() {
    fetch('/api/audio/capabilities')
      .then((response) => response.ok ? response.json() : null)
      .then((capabilities) => { neuralTtsAvailable = Boolean(capabilities?.neuralTts); })
      .catch(() => { neuralTtsAvailable = false; });

    if (speechSynthesisSupported) {
      peruvianSpanishVoice();
      window.speechSynthesis.addEventListener('voiceschanged', peruvianSpanishVoice);
    }
    if (voiceInputButton && !mediaRecordingSupported) {
      voiceInputButton.disabled = true;
      voiceInputButton.title = 'Este navegador no permite grabar el micrófono';
    }
    if (autoReadToggle && !speechSynthesisSupported) {
      autoReadToggle.disabled = true;
      autoReadToggle.title = 'La lectura de voz no está disponible en este navegador';
    }
    let inputPrefix = '';

    voiceInputButton?.addEventListener('click', async () => {
      if (interactionFinished) return;
      if (listeningForSpeech) {
        stopListening();
        return;
      }
      stopSpeech(false);
      inputPrefix = userInput?.value.trim() ? `${userInput.value.trim()} ` : '';
      try {
        activeAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
          .find((type) => MediaRecorder.isTypeSupported(type));
        audioRecorder = preferredType
          ? new MediaRecorder(activeAudioStream, { mimeType: preferredType })
          : new MediaRecorder(activeAudioStream);
        recordedAudioChunks = [];
        audioRecorder.ondataavailable = (event) => {
          if (event.data.size) recordedAudioChunks.push(event.data);
        };
        audioRecorder.onstop = async () => {
          const recorder = audioRecorder;
          const cancelled = Boolean(recorder?.cancelRequested);
          updateListeningState(false);
          closeAudioStream();
          if (cancelled) return;

          const audio = new Blob(recordedAudioChunks, { type: recorder?.mimeType || 'audio/webm' });
          if (audio.size < 100) {
            setVoiceStatus('No escuché suficiente audio. Inténtalo nuevamente.', 'error');
            return;
          }
          setVoiceStatus('Entendiendo lo que dijiste…', 'processing');
          try {
            const token = localStorage.getItem('authToken') || '';
            const response = await fetch('/api/audio/transcribe', {
              method: 'POST',
              headers: {
                'Content-Type': audio.type || 'audio/webm',
                Authorization: `Bearer ${token}`
              },
              body: audio
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'No pude transcribir el audio.');
            if (userInput) {
              userInput.value = `${inputPrefix}${result.text}`.trimStart();
              userInput.dispatchEvent(new Event('input', { bubbles: true }));
              userInput.focus();
            }
            setVoiceStatus('Texto listo. Revísalo y envíalo cuando quieras.', 'ready');
          } catch (error) {
            setVoiceStatus(error.message || 'No pude transcribir el audio.', 'error');
          }
        };
        audioRecorder.onerror = () => {
          updateListeningState(false);
          closeAudioStream();
          setVoiceStatus('Hubo un problema al grabar. Inténtalo nuevamente.', 'error');
        };
        audioRecorder.start(250);
        recordingLimitTimer = window.setTimeout(() => {
          if (listeningForSpeech) stopListening();
        }, 30000);
        updateListeningState(true);
        setVoiceStatus('Escuchando… toca el micrófono otra vez al terminar (máx. 30 s).', 'listening');
      } catch (error) {
        closeAudioStream();
        updateListeningState(false);
        const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
        setVoiceStatus(
          denied
            ? 'Necesito permiso del micrófono. Habilítalo en el candado del navegador.'
            : 'No pude abrir el micrófono. Revisa que esté conectado y libre.',
          'error'
        );
      }
    });
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

    let audioButton = null;
    if (sender === 'bot') {
      div.innerHTML =
        formatMarkdown(text);
      appendStructuredInsight(div, text);
      audioButton = appendMessageAudioControl(div, text);
    } else {
      div.textContent =
        text;
    }

    chatMessages.appendChild(
      div
    );

    if (sender === 'bot' && autoReadEnabled && hasUserInteraction && audioButton) {
      window.setTimeout(() => speakMessage(text, audioButton), 120);
    }

    scrollToBottom();
  }

  // Añade una visualización únicamente cuando los valores ya aparecen en la
  // respuesta respaldada. No calcula ni inventa información financiera.
  function appendStructuredInsight(messageElement, rawText) {
    const text = String(rawText || '');
    const cleanAmount = (value) => String(value || '').replace(/[.,]+$/, '').replace(',', '.');
    const amountNumber = (value) => Number(cleanAmount(value)) || 0;
    const formatAmount = (value) => `S/ ${amountNumber(value).toFixed(2)}`;
    const cycleLabel = (cycle) => `${cycle.slice(6, 8)}/${cycle.slice(4, 6)}`;

    const passedComparison = text.match(/pas[oó]\s+de\s+S\/\s*([\d.,]+)\s+a\s+S\/\s*([\d.,]+)/i);
    const beforeNowComparison = text.match(/antes[\s\S]{0,85}?S\/\s*([\d.,]+)[\s\S]{0,100}?ahora[\s\S]{0,55}?S\/\s*([\d.,]+)/i);
    const comparison = passedComparison || beforeNowComparison;
    const variation = text.match(/(?:aument[oó]|subi[oó]|baj[oó])(?:\s+en)?\s+S\/\s*([\d.,]+)/i);
    const dueDate = text.match(/(?:fecha\s+l[ií]mite(?:\s+registrada)?|vence|vencimiento(?:\s+registrado)?(?:\s+es|\s+el|:)|tienes\s+hasta)[^\d]{0,18}(\d{2}\/\d{2}\/\d{4})/i)
      || text.trim().match(/^(\d{2}\/\d{2}\/\d{4})\.?$/);
    const debtStatus = text.match(/(?:figura|estado(?:\s+registrado)?(?:\s+es|:)?)[^\n]{0,20}[“\"]?(CON DEUDA|SIN DEUDA)[”\"]?/i);
    const totalAmount = text.match(/(?:total(?:\s+de\s+cargos|\s+facturado)?|recibo(?:\s+actual)?(?:\s+suma|\s+es|\s+era)?)[^\nS]{0,30}S\/\s*([\d.,]+)/i);
    const netEffect = text.match(/efecto\s+neto[^\n]{0,28}?S\/\s*(-?[\d.,]+)/i);
    const event = text.match(/\b(prorrateo|reconexi[oó]n)\b[^\n]{0,100}?S\/\s*([\d.,]+)(?:[^\n]{0,80}?(\d{2}[/-]\d{2}[/-]\d{4}))?/i);
    let historyRows = [...text.matchAll(/(?:^|\n)\s*\d+[.)]\s*(S\dAA-\d+)\s*[·|-]\s*ciclo\s*(\d{8})\s*[·|-]\s*(?:total(?:\s+de\s+cargos)?\s*)?S\/\s*([\d.,]+)/gim)].slice(0, 5);
    if (historyRows.length < 2) {
      historyRows = [...text.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?(\d{8})\s*:\s*S\/\s*([\d.,]+)/gim)]
        .slice(0, 5)
        .map((match) => [match[0], '—', match[1], String(match[2]).replace(/[.,]+$/, '')]);
    }

    if (!comparison && !dueDate && !debtStatus && !netEffect && !event && historyRows.length < 2) return;

    const card = document.createElement('div');
    card.className = 'message-insight-card';
    card.setAttribute('role', 'group');
    const title = document.createElement('div');
    title.className = 'message-insight-title';
    title.textContent = historyRows.length >= 2
      ? 'Así cambiaron tus recibos'
      : comparison
        ? 'Antes y ahora'
        : dueDate
          ? 'Tu fecha de pago'
          : debtStatus
            ? 'Estado de tu recibo'
            : netEffect
              ? 'Efecto de tus bonos'
              : 'Movimiento registrado';
    card.appendChild(title);

    if (historyRows.length >= 2) {
      const chart = document.createElement('div');
      chart.className = 'message-mini-bars';
      const maximum = Math.max(...historyRows.map((match) => amountNumber(match[3])), 1);
      historyRows.forEach((match, index) => {
        const column = document.createElement('div');
        column.className = 'message-mini-bar-column';
        column.style.setProperty('--insight-delay', `${index * 75}ms`);
        const value = document.createElement('strong');
        value.textContent = formatAmount(match[3]);
        const track = document.createElement('div');
        track.className = 'message-mini-bar-track';
        const bar = document.createElement('span');
        bar.className = 'message-mini-bar';
        bar.style.setProperty('--mini-height', `${Math.max(8, Math.round((amountNumber(match[3]) / maximum) * 72))}px`);
        track.appendChild(bar);
        const label = document.createElement('span');
        label.textContent = cycleLabel(match[2]);
        column.append(value, track, label);
        chart.appendChild(column);
      });
      card.appendChild(chart);
    } else if (comparison) {
      const before = amountNumber(comparison[1]);
      const now = amountNumber(comparison[2]);
      const maximum = Math.max(before, now, 1);
      const chart = document.createElement('div');
      chart.className = 'message-comparison-chart';
      [['Antes', before], ['Ahora', now]].forEach(([label, amount], index) => {
        const row = document.createElement('div');
        row.className = `message-comparison-row${index === 1 ? ' is-current' : ''}`;
        row.style.setProperty('--insight-delay', `${index * 90}ms`);
        const heading = document.createElement('div');
        const caption = document.createElement('span');
        caption.textContent = label;
        const value = document.createElement('strong');
        value.textContent = `S/ ${amount.toFixed(2)}`;
        heading.append(caption, value);
        const track = document.createElement('div');
        track.className = 'message-comparison-track';
        const fill = document.createElement('span');
        fill.style.setProperty('--comparison-width', `${Math.max(5, Math.round((amount / maximum) * 100))}%`);
        track.appendChild(fill);
        row.append(heading, track);
        chart.appendChild(row);
      });
      if (variation) {
        const badge = document.createElement('div');
        badge.className = 'message-change-badge';
        badge.textContent = `${/baj[oó]/i.test(variation[0]) ? 'Bajó' : 'Subió'} ${formatAmount(variation[1])}`;
        chart.appendChild(badge);
      }
      card.appendChild(chart);
    } else if (dueDate) {
      const [day, month, year] = dueDate[1].split('/');
      const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const dateView = document.createElement('div');
      dateView.className = 'message-date-highlight';
      const calendar = document.createElement('div');
      calendar.className = 'message-calendar';
      const monthLabel = document.createElement('span');
      monthLabel.textContent = monthNames[Number(month) - 1] || month;
      const dayLabel = document.createElement('strong');
      dayLabel.textContent = day;
      calendar.append(monthLabel, dayLabel);
      const copy = document.createElement('div');
      const dateCaption = document.createElement('span');
      dateCaption.textContent = 'Fecha límite registrada';
      const dateValue = document.createElement('strong');
      dateValue.textContent = `${day}/${month}/${year}`;
      copy.append(dateCaption, dateValue);
      dateView.append(calendar, copy);
      card.appendChild(dateView);
    } else if (debtStatus) {
      const status = debtStatus[1].toUpperCase();
      const statusView = document.createElement('div');
      statusView.className = 'message-status-view';
      const badge = document.createElement('span');
      badge.className = `message-status-badge ${status === 'CON DEUDA' ? 'has-debt' : 'no-debt'}`;
      badge.textContent = status;
      statusView.appendChild(badge);
      if (totalAmount) {
        const amount = document.createElement('strong');
        amount.textContent = formatAmount(totalAmount[1]);
        statusView.appendChild(amount);
      }
      if (/no (?:tengo|puedo|indican|incluyen)[^\n]{0,55}(?:pendiente|importe|saldo)/i.test(text)) {
        const note = document.createElement('small');
        note.textContent = 'El saldo pendiente exacto no está disponible.';
        statusView.appendChild(note);
      }
      card.appendChild(statusView);
    } else if (netEffect) {
      const net = document.createElement('div');
      net.className = 'message-net-effect';
      const value = document.createElement('strong');
      value.textContent = formatAmount(netEffect[1]);
      const label = document.createElement('span');
      label.textContent = amountNumber(netEffect[1]) === 0 ? 'Los cargos y bonos se compensan' : 'Efecto neto registrado';
      net.append(value, label);
      card.appendChild(net);
    } else if (event) {
      const eventView = document.createElement('div');
      eventView.className = 'message-event-view';
      const dot = document.createElement('span');
      const eventCopy = document.createElement('div');
      const eventTitle = document.createElement('strong');
      eventTitle.textContent = event[1].toLowerCase().startsWith('recon') ? 'Reconexión registrada' : 'Prorrateo registrado';
      const eventDetail = document.createElement('span');
      eventDetail.textContent = `${formatAmount(event[2])}${event[3] ? ` · ${event[3]}` : ''}`;
      eventCopy.append(eventTitle, eventDetail);
      eventView.append(dot, eventCopy);
      card.appendChild(eventView);
    } else {
      return;
    }

    messageElement.appendChild(card);
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

    stopAllVoiceActivity();

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

    if (voiceInputButton) {
      voiceInputButton.disabled =
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

    if (voiceInputButton) {
      voiceInputButton.disabled =
        !mediaRecordingSupported;
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
                'application/json',
              Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
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

    stopAllVoiceActivity();

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
              'DELETE',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
            }
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

    stopListening();
    setVoiceStatus('');


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
                'application/json',
              Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
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

  function isMobileSidebar() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function setMobileSidebarOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open', open);
    document.body.classList.toggle('sidebar-open', open);
    if (toggleSidebarBtn) {
      toggleSidebarBtn.setAttribute('aria-expanded', String(open));
      toggleSidebarBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    }
  }

  function closeMobileSidebar() {
    if (isMobileSidebar()) setMobileSidebarOpen(false);
  }

  if (toggleSidebarBtn && sidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
      if (isMobileSidebar()) {
        setMobileSidebarOpen(!sidebar.classList.contains('mobile-open'));
      } else {
        sidebar.classList.toggle('collapsed');
      }
    });
  }

  sidebarBackdrop?.addEventListener('click', closeMobileSidebar);
  sidebar?.querySelectorAll('.sidebar-menu button').forEach((button) => {
    button.addEventListener('click', closeMobileSidebar);
  });
  newChatButton?.addEventListener('click', closeMobileSidebar);

  window.addEventListener('resize', () => {
    if (!isMobileSidebar()) setMobileSidebarOpen(false);
  });

  let currentUserState = null;
  let billingDashboardServices = [];

  function formatDashboardDate(rawDate) {
    const digits = String(rawDate || '').replace(/\D/g, '');
    if (digits.length !== 8) return 'No disponible';
    return `${digits.slice(6, 8)}/${digits.slice(4, 6)}/${digits.slice(0, 4)}`;
  }

  if (autoReadToggle) {
    autoReadToggle.addEventListener('click', () => {
      if (!speechSynthesisSupported) return;
      setAutoRead(!autoReadEnabled);
    });
  }

  if (stopSpeechButton) {
    stopSpeechButton.addEventListener('click', () => stopSpeech(true));
  }

  function setBillingDashboardVisible(visible) {
    document.getElementById('billingDashboard')?.classList.toggle('hidden', !visible);
    if (!visible) document.getElementById('billingDetailModal')?.classList.add('hidden');
  }

  function renderBillingDashboard(service) {
    if (!service) return;
    const amount = document.getElementById('billingDashboardAmount');
    const due = document.getElementById('billingDashboardDue');
    const variation = document.getElementById('billingDashboardVariation');
    const cause = document.getElementById('billingDashboardCause');
    const status = document.getElementById('billingDashboardStatus');
    if (amount) amount.textContent = `S/ ${Number(service.total).toFixed(2)}`;
    if (due) due.textContent = formatDashboardDate(service.dueDate);
    if (status) status.textContent = service.status || 'Sin estado';
    if (variation) {
      if (service.variation === null) variation.textContent = 'Sin comparación';
      else if (service.variation > 0) variation.textContent = `▲ S/ ${service.variation.toFixed(2)}`;
      else if (service.variation < 0) variation.textContent = `▼ S/ ${Math.abs(service.variation).toFixed(2)}`;
      else variation.textContent = 'Sin cambio';
    }
    if (cause) {
      cause.textContent = service.mainCause
        ? `${service.mainCause.label} (${service.mainCause.delta >= 0 ? '+' : '-'}S/ ${Math.abs(service.mainCause.delta).toFixed(2)})`
        : 'No hay una factura anterior comparable';
    }
  }

  function createReceiptElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function activeBillingDashboardService() {
    const selector = document.getElementById('billingServiceSelect');
    return billingDashboardServices[Number(selector?.value || 0)] || billingDashboardServices[0];
  }

  function receiptCycleLabel(rawCycle) {
    const formatted = formatDashboardDate(rawCycle);
    return formatted === 'No disponible' ? 'Sin fecha' : formatted.slice(3);
  }

  function friendlyServiceType(rawType) {
    const labels = { WRLS: 'Línea móvil', FIXED: 'Hogar', FIBER: 'Fibra', SHEQ: 'Equipo' };
    return labels[String(rawType || '').toUpperCase()] || rawType || 'Servicio';
  }

  function friendlyChargeGroups(charges) {
    const friendlyTitle = (description) => {
      const raw = String(description || '').trim();
      if (/\bplan\b/i.test(raw) && /^RV\s+/i.test(raw)) return 'Tu plan mensual Movistar';
      return raw
        .replace(/\s*\(\s*VR[^)]*\)/i, '')
        .replace(/(\d+)\s*GB/gi, '$1 GB')
        .replace(/x\s*(\d+)\s*mes(?:es)?/gi, (_, months) => `por ${months} ${Number(months) === 1 ? 'mes' : 'meses'}`)
        .replace(/\s+(\d+)m$/i, (_, months) => ` por ${months} meses`)
        .replace(/\s+/g, ' ')
        .trim();
    };
    const simplify = (description) => String(description || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\(\s*VR[^)]*\)/gi, '')
      .replace(/^\s*bono\s+/i, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
    const used = new Set();
    const groups = [];

    charges.forEach((charge, index) => {
      if (used.has(index)) return;
      const oppositeIndex = charges.findIndex((candidate, candidateIndex) => (
        candidateIndex !== index
        && !used.has(candidateIndex)
        && Math.abs(Number(candidate.amount) + Number(charge.amount)) < 0.01
        && simplify(candidate.description) === simplify(charge.description)
      ));
      if (oppositeIndex >= 0) {
        used.add(index);
        used.add(oppositeIndex);
        const pair = [charge, charges[oppositeIndex]];
        const bonus = pair.find((item) => /bono/i.test(item.description)) || pair[0];
        groups.push({
          kind: 'compensated',
          title: friendlyTitle(bonus.description),
          description: 'El beneficio y su cargo asociado se compensan por completo.',
          amount: 0,
          originals: pair
        });
        return;
      }
      used.add(index);
      groups.push({
        kind: charge.amount < 0 ? 'discount' : 'charge',
        title: friendlyTitle(charge.description),
        description: charge.amount < 0 ? 'Este importe reduce el total del recibo.' : 'Este importe sí forma parte del total facturado.',
        amount: charge.amount,
        originals: [charge]
      });
    });
    return groups;
  }

  function openBillingDetail() {
    const service = activeBillingDashboardService();
    const modal = document.getElementById('billingDetailModal');
    const content = document.getElementById('billingDetailContent');
    if (!service || !modal || !content) return;
    content.textContent = '';

    const hero = createReceiptElement('section', 'receipt-hero-grid');
    const heroData = [
      ['Total facturado', `S/ ${Number(service.total).toFixed(2)}`, 'primary'],
      ['Vencimiento', formatDashboardDate(service.dueDate), ''],
      ['Estado registrado', service.status || 'Sin estado', ''],
      ['Servicio', `${friendlyServiceType(service.serviceType)} · ${service.subscriberSuffix}`, '']
    ];
    heroData.forEach(([label, value, extraClass], index) => {
      const item = createReceiptElement('div', `receipt-hero-item ${extraClass}`.trim());
      item.style.setProperty('--receipt-delay', `${index * 60}ms`);
      item.append(createReceiptElement('span', '', label), createReceiptElement('strong', '', value));
      hero.appendChild(item);
    });
    content.appendChild(hero);

    const explanation = createReceiptElement('section', 'receipt-section');
    explanation.append(
      createReceiptElement('span', 'receipt-section-kicker', 'En pocas palabras'),
      createReceiptElement('h3', '', '¿Qué pasó con tu recibo?')
    );
    if (service.previousTotal !== null && service.variation !== null) {
      const track = createReceiptElement('div', 'receipt-change-track');
      const before = createReceiptElement('div', 'receipt-change-value');
      before.append(createReceiptElement('span', '', 'Recibo anterior'), createReceiptElement('strong', '', `S/ ${Number(service.previousTotal).toFixed(2)}`));
      const now = createReceiptElement('div', 'receipt-change-value');
      now.append(createReceiptElement('span', '', 'Recibo actual'), createReceiptElement('strong', '', `S/ ${Number(service.total).toFixed(2)}`));
      track.append(before, createReceiptElement('div', 'receipt-change-arrow', service.variation >= 0 ? '→' : '←'), now);
      explanation.appendChild(track);
      const direction = service.variation > 0 ? `subió S/ ${service.variation.toFixed(2)}` : service.variation < 0 ? `bajó S/ ${Math.abs(service.variation).toFixed(2)}` : 'no cambió';
      const reason = service.causes?.length
        ? service.causes.map((item) => `${item.label} (${item.delta >= 0 ? '+' : '-'}S/ ${Math.abs(item.delta).toFixed(2)})`).join(' y ')
        : 'no hay una causa individual registrada';
      explanation.appendChild(createReceiptElement('p', 'receipt-friendly-explanation', `Tu recibo ${direction}. Esto se explica por ${reason}.`));
    } else {
      explanation.appendChild(createReceiptElement('p', 'receipt-friendly-explanation', 'No hay un recibo anterior comparable, por eso no afirmamos que haya subido o bajado.'));
    }
    content.appendChild(explanation);

    if (service.charges?.length) {
      const chargesSection = createReceiptElement('section', 'receipt-section');
      chargesSection.append(createReceiptElement('span', 'receipt-section-kicker', 'Explicación del total'), createReceiptElement('h3', '', 'Qué estás pagando realmente'));
      chargesSection.appendChild(createReceiptElement('p', 'receipt-friendly-explanation receipt-intro', 'Agrupamos los movimientos que se cancelan entre sí para que el recibo sea más fácil de entender.'));
      const groupsContainer = createReceiptElement('div', 'receipt-charge-groups');
      const groupedCharges = friendlyChargeGroups(service.charges);
      groupedCharges.forEach((group, index) => {
        const card = createReceiptElement('div', `receipt-charge-group ${group.kind}`);
        card.style.setProperty('--receipt-delay', `${index * 65}ms`);
        const icon = createReceiptElement('span', 'receipt-charge-icon', group.kind === 'compensated' ? '✓' : group.kind === 'discount' ? '−' : '↗');
        const copy = createReceiptElement('div', 'receipt-charge-copy');
        copy.append(createReceiptElement('strong', '', group.title), createReceiptElement('span', '', group.description));
        const amount = createReceiptElement('strong', 'receipt-charge-effect', group.kind === 'compensated' ? 'Efecto S/ 0.00' : `${group.amount < 0 ? '−' : ''}S/ ${Math.abs(group.amount).toFixed(2)}`);
        card.append(icon, copy, amount);
        groupsContainer.appendChild(card);
      });
      chargesSection.appendChild(groupsContainer);

      const originals = document.createElement('details');
      originals.className = 'receipt-original-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Ver movimientos originales';
      originals.appendChild(summary);
      const originalList = createReceiptElement('ul', 'receipt-list');
      service.charges.forEach((charge) => {
        const row = createReceiptElement('li');
        row.append(createReceiptElement('span', '', charge.description), createReceiptElement('strong', charge.amount < 0 ? 'negative' : '', `${charge.amount < 0 ? '−' : ''}S/ ${Math.abs(charge.amount).toFixed(2)}`));
        originalList.appendChild(row);
      });
      originals.appendChild(originalList);
      chargesSection.appendChild(originals);
      content.appendChild(chargesSection);
    }

    if (service.history?.length > 1) {
      const historySection = createReceiptElement('section', 'receipt-section');
      historySection.append(createReceiptElement('span', 'receipt-section-kicker', 'Últimos meses'), createReceiptElement('h3', '', 'Así evolucionó tu facturación'));
      const history = service.history.slice().reverse();
      const maxTotal = Math.max(...history.map((invoice) => Math.abs(invoice.total)), 1);
      const minInvoice = history.reduce((best, invoice) => invoice.total < best.total ? invoice : best);
      const maxInvoice = history.reduce((best, invoice) => invoice.total > best.total ? invoice : best);
      historySection.appendChild(createReceiptElement('p', 'receipt-friendly-explanation receipt-intro', `En este periodo, el monto más bajo fue S/ ${minInvoice.total.toFixed(2)} y el más alto S/ ${maxInvoice.total.toFixed(2)}.`));
      const chart = createReceiptElement('div', 'receipt-chart-shell');
      const bars = createReceiptElement('div', 'receipt-history-bars');
      history.forEach((invoice, index) => {
        const isCurrent = index === history.length - 1;
        const column = createReceiptElement('div', `receipt-history-column${isCurrent ? ' is-current' : ''}`);
        column.title = `${receiptCycleLabel(invoice.cycle)}: S/ ${Number(invoice.total).toFixed(2)}`;
        column.appendChild(createReceiptElement('strong', '', `S/ ${Number(invoice.total).toFixed(2)}`));
        const bar = createReceiptElement('div', 'receipt-history-bar');
        bar.style.setProperty('--bar-height', `${Math.max(10, Math.round((Math.abs(invoice.total) / maxTotal) * 88))}px`);
        bar.style.animationDelay = `${index * 80}ms`;
        column.append(bar, createReceiptElement('span', '', receiptCycleLabel(invoice.cycle)));
        if (isCurrent) column.appendChild(createReceiptElement('em', '', 'Actual'));
        bars.appendChild(column);
      });
      chart.appendChild(bars);
      historySection.appendChild(chart);
      content.appendChild(historySection);
    }

    modal.classList.remove('hidden');
    document.getElementById('closeBillingDetail')?.focus();
  }

  function closeBillingDetail() {
    document.getElementById('billingDetailModal')?.classList.add('hidden');
  }

  async function loadBillingDashboard() {
    const token = localStorage.getItem('authToken');
    if (!token) {
      billingDashboardServices = [];
      setBillingDashboardVisible(false);
      return;
    }

    setBillingDashboardVisible(true);
    const status = document.getElementById('billingDashboardStatus');
    const detailButton = document.getElementById('billingDashboardAsk');
    if (status) status.textContent = 'Cargando';
    if (detailButton) detailButton.disabled = true;
    try {
      const response = await fetch('/api/billing/summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('No se pudo cargar el resumen');
      const data = await response.json();
      billingDashboardServices = Array.isArray(data.services) ? data.services : [];
      if (!billingDashboardServices.length) throw new Error('Sin recibos');

      const selector = document.getElementById('billingServiceSelect');
      if (selector) {
        selector.textContent = '';
        billingDashboardServices.forEach((service, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = `${service.serviceType} · ${service.subscriberSuffix}`;
          selector.appendChild(option);
        });
        selector.classList.toggle('hidden', billingDashboardServices.length < 2);
      }
      renderBillingDashboard(billingDashboardServices[0]);
      if (detailButton) detailButton.disabled = false;
    } catch (error) {
      console.warn('[CHAT] No se pudo cargar el panel del recibo:', error);
      setBillingDashboardVisible(false);
      if (detailButton) detailButton.disabled = true;
    }
  }

  document.getElementById('billingServiceSelect')?.addEventListener('change', (event) => {
    renderBillingDashboard(billingDashboardServices[Number(event.target.value)]);
  });

  document.getElementById('billingDashboardAsk')?.addEventListener('click', () => {
    openBillingDetail();
  });

  document.getElementById('closeBillingDetail')?.addEventListener('click', closeBillingDetail);
  document.getElementById('billingDetailModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'billingDetailModal') closeBillingDetail();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeBillingDetail();
  });
  document.getElementById('billingDetailAsk')?.addEventListener('click', () => {
    closeBillingDetail();
    window.sendQuickPrompt?.('Ayúdame a entender mi recibo con palabras simples. Primero dime el total y luego explícame el cambio más importante.');
  });

  function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginButton');
    const userProfileBtn = document.getElementById('userProfileButton');
    const badgeText = document.getElementById('userProfileBadgeText');

    if (user) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userProfileBtn) {
        userProfileBtn.classList.remove('hidden');
        if (badgeText) {
          badgeText.textContent = `👤 ${user.name || user.userId}`;
        }
      }
      const pName = document.getElementById('profileModalName');
      const pPhone = document.getElementById('profileModalPhone');
      const pCustomer = document.getElementById('profileModalCustomerId');

      if (pName) pName.textContent = user.name || 'Usuario Mi Movistar';
      if (pPhone) pPhone.textContent = user.userId || '-';
      if (pCustomer) pCustomer.textContent = user.customerId || 'Sin DNI asociado';
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userProfileBtn) userProfileBtn.classList.add('hidden');
    }
  }

  function clearClientAuthState() {
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('movistarDemoCustomerId');
    currentUserState = null;
    updateAuthUI(null);
    setBillingDashboardVisible(false);
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
        setBillingDashboardVisible(false);
        return null;
      }

      const resp = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (resp.status === 401) {
        clearClientAuthState();
        return null;
      }

      const data = await resp.json();
      if (!data || !data.user) {
        clearClientAuthState();
        return null;
      }

      currentUserState = data.user;
      updateAuthUI(data.user);
      await loadBillingDashboard();

      const customerId = data.user.customerId || null;

      // Notify server about the association for metrics/context
      if (customerId) {
        try {
          await fetch(`/api/session/${encodeURIComponent(sessionId)}/customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ customerId })
          });
        } catch (e) {
          console.warn('[CHAT] error notifying session of customer:', e);
        }
        sessionStorage.setItem('movistarDemoCustomerId', customerId);
      }

      return customerId;
    } catch (error) {
      console.warn('[CHAT] No se pudo recuperar el contexto autenticado:', error);
      currentUserState = null;
      updateAuthUI(null);
      setBillingDashboardVisible(false);
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
  async function submitLogin(overrideUserId, overridePassword) {
    const userId   = overrideUserId   || document.getElementById('loginPhone')?.value?.trim()    || '';
    const password = overridePassword || document.getElementById('loginPassword')?.value || '';
    const msgId    = 'loginMessage';

    if (!userId || !/^[a-zA-Z0-9_-]{3,64}$/.test(userId)) {
      setMsg(msgId, 'Ingresa un ID de usuario válido.', true);
      return;
    }
    if (!password || password.length < 8) {
      setMsg(msgId, 'Ingresa tu contraseña (mínimo 8 caracteres).', true);
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
        body: JSON.stringify({ userId, password })
      });

      let data = null;
      try { data = await resp.json(); } catch (_) {}

      if (!resp.ok) {
        const errMsg = (data && data.error) ? data.error : 'Número o contraseña incorrectos';
        setMsg(msgId, errMsg, true);
        return;
      }

      localStorage.setItem('authToken', data.token);
      hideLoginModal();
      // Una conversación anónima o de una cuenta anterior nunca se reutiliza
      // al autenticar un usuario distinto.
      await startNewChat();
      await associateAuthenticatedCustomer(currentSessionId);

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
    const userId   = document.getElementById('regPhone')?.value?.trim()    || '';
    const password = document.getElementById('regPassword')?.value         || '';
    const msgId    = 'registerMessage';

    if (!userId || !/^[a-zA-Z0-9_-]{3,64}$/.test(userId)) {
      setMsg(msgId, 'Ingresa un ID de usuario válido.', true);
      return;
    }
    if (!password || password.length < 8) {
      setMsg(msgId, 'La contraseña debe tener al menos 8 caracteres.', true);
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
        body: JSON.stringify({ userId, password })
      });

      let data = null;
      try { data = await resp.json(); } catch (_) {}

      if (!resp.ok) {
        if (resp.status === 409) {
          showLoginView();
          const lp = document.getElementById('loginPhone');
          const lpw = document.getElementById('loginPassword');
          if (lp) lp.value = userId;
          if (lpw) {
            lpw.value = '';
            lpw.focus();
          }
          setMsg('loginMessage', 'Este usuario ya está registrado. Inicia sesión con tu contraseña.', false);
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
      if (lp) lp.value = userId;
      if (lpw) lpw.value = password;
      await submitLogin(userId, password);

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
    const token = localStorage.getItem('authToken');
    const oldSessionId = currentSessionId;
    stopAllVoiceActivity();
    setAutoRead(false, false);
    try {
      // La conversación se elimina mientras el token aún es válido; así el
      // servidor también descarta cualquier contexto personal de esta cuenta.
      if (token && oldSessionId) {
        await fetch(`/api/session/${encodeURIComponent(oldSessionId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }).catch((error) => {
          console.warn('[CHAT] No se pudo eliminar la conversación al salir:', error);
        });
      }
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('movistarDemoCustomerId');
      // Evita que, después de cerrar sesión, el navegador intente reutilizar
      // una conversación que contiene contexto personal del usuario anterior.
      currentSessionId = crearSessionId();
      sessionStorage.setItem('chatSessionId', currentSessionId);
      currentUserState = null;
      updateAuthUI(null);
      setBillingDashboardVisible(false);
      hideProfileModal();

      // Limpieza inmediata de toda la vista. No se conserva ningún mensaje,
      // tabla ni tarjeta financiera del usuario que acaba de salir.
      hideTyping();
      hideSatisfactionModal();
      resetSatisfactionForm();
      if (chatMessages) chatMessages.replaceChildren();
      if (userInput) {
        userInput.value = '';
        userInput.style.height = 'auto';
      }
      sendingMessage = false;
      hasUserInteraction = false;
      interactionFinished = false;
      chatState.sessionEnded = false;
      chatState.lastActivity = Date.now();
      enableChatComposer();
      if (finishChatButton) finishChatButton.disabled = true;
      stopTimer();
      startTimer();
      appendMessage('Sesión cerrada correctamente. Puedes seguir haciendo consultas generales o iniciar sesión con otra cuenta.', 'bot');
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
    initializeVoiceFeatures();
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
    ['regPhone', 'regPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitRegister();
      });
    });

    startTimer();
    if (finishChatButton) finishChatButton.disabled = true;

    await bootstrapFromApp(authenticatedCustomerId);
  });
})();

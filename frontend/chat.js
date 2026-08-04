(function(){
  // Elementos
  const chatBox = document.getElementById('chatBox');
  const chatMessages = document.getElementById('chatMessages');
  const userInput = document.getElementById('userInput');
  const plansContainer = document.getElementById('plansContainer');
  const billingToggle = document.getElementById('billingToggle');

  // Planes (same data used previously)
  const plansData = [
    { id: 'plan-300', name: '300 Mbps Fibra', monthlyPrice: 69.90, annualPrice: 671.00, features: ['Modem Smart WiFi 5', '1000 Mbps por 6 meses', 'Instalación Gratis'], featured: false },
    { id: 'plan-500', name: '500 Mbps Fibra', monthlyPrice: 89.90, annualPrice: 863.00, features: ['Modem Smart WiFi 6', '1000 Mbps GRATIS x 1 año', 'Disney+ Incluido', 'Instalación Gratis'], featured: true },
    { id: 'plan-1000', name: '1000 Mbps Fibra PRO', monthlyPrice: 139.90, annualPrice: 1343.00, features: ['WiFi 6 de alta cobertura', 'Prioridad de Red/Gaming', 'Disney+ Estándar', 'Soporte VIP'], featured: false }
  ];
  let isAnnual = false;

  function renderPlans(){
    if(!plansContainer) return;
    plansContainer.innerHTML = '';
    plansData.forEach(plan => {
      const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
      const periodText = isAnnual ? '/año' : '/mes';
      const savingsText = isAnnual ? `Ahorras S/ ${(plan.monthlyPrice * 12 - plan.annualPrice).toFixed(2)} al año` : '';
      const card = document.createElement('div');
      card.className = `plan-card ${plan.featured ? 'featured' : ''}`;
      card.innerHTML = `${plan.featured ? '<div class="badge">MÁS POPULAR</div>' : ''}<h3>${plan.name}</h3><div class="price-container"><span class="price">S/ ${price.toFixed(2)}</span><span class="price-period">${periodText}</span><div class="savings">${savingsText}</div></div><ul style="list-style:none;padding:0;text-align:left;margin:20px 0;">${plan.features.map(f=>`<li style="margin-bottom:8px;">✓ ${f}</li>`).join('')}</ul><button class="btn-buy" onclick="alert('Comprar ${plan.id}')">Comprar Online</button>`;
      plansContainer.appendChild(card);
    });
  }

  function toggleBilling(){ isAnnual = billingToggle && billingToggle.checked; renderPlans(); }
  window.toggleBilling = toggleBilling;

  function toggleChat(){
    if(!chatBox) return;
    chatBox.style.display = (chatBox.style.display === 'none' || chatBox.style.display === '') ? 'flex' : 'none';
  }
  window.toggleChat = toggleChat;

  function appendMessage(text, sender){
    if(!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'message ' + (sender === 'user' ? 'user' : 'bot');
    div.innerHTML = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping(){
    const t = document.createElement('div');
    t.className = 'message bot typing';
    t.id = 'typingIndicator';
    t.textContent = 'Escribiendo...';
    chatMessages.appendChild(t);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function hideTyping(){ const t = document.getElementById('typingIndicator'); if(t) t.remove(); }

  async function sendMessage(){
    const text = userInput && userInput.value.trim();
    if(!text) return;
    appendMessage(text, 'user');
    if(userInput) userInput.value = '';
    showTyping();
    try{
      // Force backend to local Express server on port 3000 to avoid Live Server (5500) POST errors
      const backendBase = 'http://localhost:3000';
      const res = await fetch(backendBase + '/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: text, sessionId: localStorage.getItem('chatSessionId') || undefined }) });
      if(!res.ok){ throw new Error('HTTP '+res.status); }
      const data = await res.json();
      hideTyping();
      if(data && data.reply){ appendMessage(data.reply, 'bot'); }
      else { appendMessage('No se recibió respuesta válida del servidor.', 'bot'); }
    }catch(err){
      hideTyping();
      appendMessage('Error de conexión con el servidor. Verifica que el backend esté corriendo en http://localhost:3000/ y recarga la página.', 'bot');
      console.error('chat error', err);
    }
  }

  if(document.getElementById('sendButton')){
    document.getElementById('sendButton').addEventListener('click', sendMessage);
  }
  // Provide global handler for inline onkeypress attribute in index.html
  window.handleKeyPress = function(e){ if(e.key === 'Enter'){ e.preventDefault(); sendMessage(); } };
  if(userInput){ userInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); sendMessage(); } }); }
  if(billingToggle){ billingToggle.addEventListener('change', toggleBilling); }

  // Init
  document.addEventListener('DOMContentLoaded', ()=>{
    renderPlans();
    // show welcome in chat
    appendMessage('¡Hola! Soy el Asistente Movistar. Escribe tu DNI (8 dígitos) o pregunta por tu recibo.', 'bot');
    // small session id
    if(!localStorage.getItem('chatSessionId')) localStorage.setItem('chatSessionId','s_'+Math.random().toString(36).slice(2,9));
  });

  // expose for console/debug
  window.__app = { renderPlans, toggleBilling, sendMessage };

})();

/**
 * Capa visual de la conversación: chips de seguimiento y tarjeta de recibo.
 *
 * `chat.js` es un IIFE cerrado, así que en vez de reescribirlo este módulo
 * expone funciones en `window.Interaccion` y `chat.js` las llama desde dos
 * puntos: al pintar una respuesta del bot y al enviar un mensaje.
 *
 * Todo lo que se muestra viene del backend (`sugerencias`, `tarjeta`), y esos
 * datos salen del bloque de hechos. La vista no calcula ni formatea ningún
 * monto por su cuenta: hereda la garantía anti-alucinación.
 */

(function () {
  'use strict';

  /** Formatea un monto ya calculado por el backend. Nunca opera con él. */
  function soles(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      return '';
    }
    const signo = numero < 0 ? '-' : '';
    return `${signo}S/ ${Math.abs(numero).toFixed(2)}`;
  }

  function contenedorDeChat() {
    return document.getElementById('chatMessages');
  }

  /**
   * Borra los chips visibles.
   *
   * Se llama al enviar un mensaje: dejar los chips viejos invita a hacer clic
   * sobre una sugerencia que ya no aplica a la conversación.
   */
  function limpiarChips() {
    document
      .querySelectorAll('.chips-seguimiento')
      .forEach((nodo) => nodo.remove());
  }

  /**
   * Pinta los chips de seguimiento bajo la última respuesta.
   *
   * @param {string[]} sugerencias Textos que el backend garantiza que su
   *   clasificador reconoce.
   * @param {(texto: string) => void} alElegir Se invoca con el texto del chip.
   */
  function mostrarChips(sugerencias, alElegir) {
    limpiarChips();

    const chat = contenedorDeChat();
    if (!chat || !Array.isArray(sugerencias) || sugerencias.length === 0) {
      return;
    }

    const fila = document.createElement('div');
    fila.className = 'chips-seguimiento';
    fila.setAttribute('role', 'group');
    fila.setAttribute('aria-label', 'Sugerencias de seguimiento');

    sugerencias.slice(0, 4).forEach((texto) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = texto;

      chip.addEventListener('click', () => {
        limpiarChips();
        if (typeof alElegir === 'function') {
          alElegir(texto);
        }
      });

      fila.appendChild(chip);
    });

    chat.appendChild(fila);
    chat.scrollTop = chat.scrollHeight;
  }

  /** Una fila del desglose de causas. */
  function filaDeCausa(causa) {
    const fila = document.createElement('li');
    fila.className = 'tarjeta-causa';

    const titulo = document.createElement('span');
    titulo.className = 'tarjeta-causa-titulo';
    titulo.textContent = causa.titulo;

    const impacto = document.createElement('span');
    impacto.className = `tarjeta-causa-impacto ${causa.impacto >= 0 ? 'sube' : 'baja'}`;
    impacto.textContent = soles(causa.impacto);

    fila.appendChild(titulo);
    fila.appendChild(impacto);
    return fila;
  }

  /**
   * Mini-serie de barras del historial.
   *
   * La forma de la curva comunica la tendencia mucho más rápido que seis
   * líneas de texto. Las barras se escalan contra el máximo de la serie.
   */
  function serieDeBarras(historial) {
    const contenedor = document.createElement('div');
    contenedor.className = 'tarjeta-serie';

    const maximo = Math.max(...historial.map((c) => Math.abs(c.total)), 1);
    // El backend entrega el historial del más reciente al más antiguo; la
    // lectura natural de izquierda a derecha es al revés.
    const cronologico = [...historial].reverse();

    cronologico.forEach((ciclo, indice) => {
      const columna = document.createElement('div');
      columna.className = 'tarjeta-serie-col';
      columna.title = `${ciclo.periodo}: ${soles(ciclo.total)}`;

      const barra = document.createElement('div');
      barra.className = 'tarjeta-serie-barra';
      barra.style.height = `${Math.max(6, (Math.abs(ciclo.total) / maximo) * 100)}%`;

      // El último es el recibo del que se está hablando.
      if (indice === cronologico.length - 1) {
        barra.classList.add('actual');
      }

      columna.appendChild(barra);
      contenedor.appendChild(columna);
    });

    return contenedor;
  }

  /**
   * Pinta la tarjeta del recibo.
   *
   * @param {object} tarjeta Datos ya resueltos por el backend.
   */
  function mostrarTarjeta(tarjeta) {
    const chat = contenedorDeChat();
    if (!chat || !tarjeta) {
      return;
    }

    const caja = document.createElement('article');
    caja.className = 'tarjeta-recibo';

    // Encabezado: periodo y total.
    const cabecera = document.createElement('header');
    cabecera.className = 'tarjeta-cabecera';

    const periodo = document.createElement('span');
    periodo.className = 'tarjeta-periodo';
    periodo.textContent = `Recibo del ${tarjeta.periodo}`;

    const total = document.createElement('strong');
    total.className = 'tarjeta-total';
    total.textContent = soles(tarjeta.total);

    cabecera.appendChild(periodo);
    cabecera.appendChild(total);
    caja.appendChild(cabecera);

    // Estado y vencimiento.
    if (tarjeta.estado) {
      const estado = document.createElement('p');
      const pendiente = tarjeta.estado === 'CON DEUDA';
      estado.className = `tarjeta-estado ${pendiente ? 'pendiente' : 'pagado'}`;
      estado.textContent = pendiente
        ? `Pendiente de pago${tarjeta.vencimiento ? ` · vence el ${tarjeta.vencimiento}` : ''}`
        : 'Pagado';
      caja.appendChild(estado);
    }

    // Variación contra el mes anterior.
    if (tarjeta.variacion && tarjeta.variacion.direccion !== 'SIN_CAMBIO' && tarjeta.totalAnterior !== null) {
      const variacion = document.createElement('p');
      const sube = tarjeta.variacion.direccion === 'AUMENTO';
      variacion.className = `tarjeta-variacion ${sube ? 'sube' : 'baja'}`;
      variacion.textContent = `${sube ? '▲' : '▼'} ${soles(tarjeta.variacion.montoAbsoluto)} vs. ${soles(tarjeta.totalAnterior)} del mes anterior`;
      caja.appendChild(variacion);
    }

    // Causas.
    if (Array.isArray(tarjeta.causas) && tarjeta.causas.length > 0) {
      const lista = document.createElement('ul');
      lista.className = 'tarjeta-causas';
      tarjeta.causas.forEach((causa) => lista.appendChild(filaDeCausa(causa)));
      caja.appendChild(lista);
    }

    // Mini-serie del historial.
    if (Array.isArray(tarjeta.historial) && tarjeta.historial.length > 1) {
      caja.appendChild(serieDeBarras(tarjeta.historial));

      const pie = document.createElement('p');
      pie.className = 'tarjeta-pie';
      pie.textContent = `Últimos ${tarjeta.historial.length} recibos`;
      caja.appendChild(pie);
    }

    chat.appendChild(caja);
    chat.scrollTop = chat.scrollHeight;
  }

  /**
   * Nivel de identidad de la sesión, en el encabezado.
   *
   * Nunca muestra el documento completo: solo los últimos cuatro dígitos.
   */
  function actualizarBadgeIdentidad(usuario) {
    const badge = document.getElementById('badgeIdentidad');
    if (!badge) {
      return;
    }

    if (!usuario || !usuario.customerId) {
      badge.className = 'badge-identidad general';
      badge.textContent = 'Modo general · sin datos personales';
      return;
    }

    const id = String(usuario.customerId);
    const ultimos = id.length > 4 ? id.slice(-4) : id;
    const nombre = usuario.name ? `${usuario.name} · ` : '';

    badge.className = 'badge-identidad verificado';
    badge.textContent = `Verificado · ${nombre}••••${ultimos}`;
  }

  /** Punto único que `chat.js` llama tras pintar una respuesta del bot. */
  function renderizarRespuesta(data, alElegirChip) {
    if (!data) {
      return;
    }

    if (data.tarjeta) {
      mostrarTarjeta(data.tarjeta);
    }

    mostrarChips(data.sugerencias, alElegirChip);
  }

  window.Interaccion = {
    renderizarRespuesta,
    mostrarChips,
    mostrarTarjeta,
    limpiarChips,
    actualizarBadgeIdentidad
  };
}());

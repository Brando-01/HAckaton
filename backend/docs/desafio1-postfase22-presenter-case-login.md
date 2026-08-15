# Post-Fase 22 · Puente local caso de cobertura → login del dataset

## Problema

El Explorador es deliberadamente de solo lectura y no publica `COD_CLIENTE`, `NUM_ANEXO` ni otros identificadores oficiales. Después del hardening de autenticación, esa separación evita que conocer un caso de cobertura equivalga a adoptar una cuenta.

Sin embargo, el presentador necesita poder escoger un caso Premium/HIGH observado en el Explorador y luego demostrar exactamente ese mismo caso mediante el login `COD_CLIENTE + NUM_ANEXO`.

## Solución

Se añade una herramienta **exclusivamente CLI y local**:

```bash
npm run demo:login-case:desafio1 -- --case 74
```

También puede seleccionar automáticamente un caso por escenario y calidad:

```bash
npm run demo:login-case:desafio1 -- --scenario RECONNECTION --quality PREMIUM
```

La herramienta:

1. resuelve el número visible contra el alias técnico privado del índice local;
2. recupera el mapping privado del índice de cobertura;
3. revalida la pareja exacta contra `PLANTA CLIENTES`;
4. confirma que la suscripción tenga facturación disponible;
5. imprime `COD_CLIENTE + NUM_ANEXO` únicamente en la terminal local.

No crea cookie ni sesión, no añade un endpoint HTTP, no escribe un JSON con credenciales y no devuelve esos identificadores al Explorador.

## Identificador visible

La interfaz deja de presentar `DEMO000074` como si fuese una cuenta. El navegador muestra:

```text
Caso #000074
```

`DEMO000074` permanece únicamente como llave técnica estable del índice local de cobertura. No es un identificador oficial ni una credencial.

## Flujo de demo

```text
Explorador
  ↓
filtrar Premium + Reconexión
  ↓
Caso #000074
  ↓
terminal local
npm run demo:login-case:desafio1 -- --case 74
  ↓
COD_CLIENTE + NUM_ANEXO validados
  ↓
/login
  ↓
Mi Movistar / Lucía / WhatsApp / Asesor
```

## Frontera de seguridad

`COD_CLIENTE + NUM_ANEXO` siguen siendo credenciales **simuladas del prototipo**, no secretos productivos de Mi Movistar. Aun así, no se publican en la vista de cobertura porque esa misma pareja habilita la sesión demo.

La herramienta está pensada para la máquina del presentador. Su salida no debe incluirse en capturas públicas, logs compartidos ni commits.

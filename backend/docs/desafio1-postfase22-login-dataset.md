# Desafío 1 · Hardening post-F22 · Login contra datos reales del dataset

## Objetivo

Reemplazar en la interfaz cliente el acceso mediante nombres/correos ficticios por una validación local basada en dos campos que existen realmente en `PLANTA CLIENTES`:

- `COD_CLIENTE`;
- `NUM_ANEXO`.

La mejora no convierte estos identificadores en credenciales productivas. El objetivo es demostrar que la cuenta usada por Mi Movistar y Lucía existe en los datos anonimizados entregados para el desafío.

## Regla de acceso

La autenticación demo exige coincidencia exacta de la pareja:

```text
COD_CLIENTE + NUM_ANEXO
        ↓
PLANTA CLIENTES
        ↓
misma fila + facturación disponible
        ↓
sesión local autenticada
```

Un `COD_CLIENTE` válido combinado con el `NUM_ANEXO` de otra cuenta no autentica.

## Privacidad

`NUM_ANEXO` se usa como clave interna de suscripción para resolver la experiencia financiera, pero no se devuelve completo al navegador. La sesión pública recibe únicamente:

- un identificador opaco por pareja;
- `COD_CLIENTE` anonimizado;
- nombre de demo `Cliente <COD_CLIENTE>`;
- `NUM_ANEXO` enmascarado.

No se publican `subscriberKey`, cuenta financiera, filas fuente ni hash de teléfono.

## Compatibilidad

Los perfiles `CLI000001`–`CLI000006` y `/api/auth/demo-login` se conservan para pruebas automáticas, benchmarks F21 y los casos congelados de Release 1. La UI de `/login` ya no los presenta como acceso del cliente.

## Alcance

Este mecanismo es **autenticación simulada del prototipo**. `COD_CLIENTE` y `NUM_ANEXO` son identificadores anonimizados del dataset y no deben presentarse como contraseña real de Mi Movistar.

F22 incorpora `DATASET_AUTH_BOUNDARY` para comprobar que:

1. se usan los campos reales `COD_CLIENTE` y `NUM_ANEXO`;
2. se exige coincidencia exacta;
3. la pareja inválida no crea sesión;
4. el servicio debe tener facturación disponible;
5. `NUM_ANEXO` no se expone completo al navegador;
6. la documentación no los presenta como secretos productivos.

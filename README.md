# Hackaton Telecom - Desafío 1

Repositorio con backend Express y frontend estático para un asistente de factura.

## Estructura

- `backend/`: servidor Node.js y rutas API.
- `frontend/`: HTML, CSS y JavaScript del cliente.

## Qué no subir

- `node_modules/`
- `backend/.env`
- cualquier archivo de configuración con credenciales o claves privadas

## Preparar el repositorio después de clonar

1. Clona el repo:
```bash
git clone https://github.com/Brando-01/HAckaton.git
cd HAckaton
```

2. Instala dependencias del backend:
```bash
cd backend
npm install
```

3. Crea un archivo `.env` en `backend/` con al menos estas variables:
```env
PORT=3000
GROQ_API_KEY=tu_clave_groq_aqui
```

4. Arranca el servidor:
```bash
npm run dev
```

5. Abre la aplicación en el navegador:

- http://localhost:3000/

## Notas

- El frontend se sirve desde el backend, por lo que no debes usar Live Server en `frontend/`.
- Si alguien baja el repo, solo necesita ejecutar `npm install` dentro de `backend/`.
- Si el proyecto crece, puedes agregar un `package.json` en `frontend/` si haces bundling o usas herramientas de frontend.

## Autenticación local de la demo

El prototipo incluye una autenticación local para proteger la vista de Mi Movistar y conservar la identidad del cliente al pasar a Lucía.

- `http://localhost:3000/login` muestra el inicio de sesión.
- `http://localhost:3000/app` requiere una sesión autenticada.
- El modo demo permite entrar como Carlos o Ana sin escribir credenciales.
- La sesión se guarda en una cookie `HttpOnly` y se reutiliza al abrir Lucía.
- Al cerrar sesión se invalida el acceso a Mi Movistar.

Cuentas ficticias disponibles:

```text
Carlos Mendoza
Correo: carlos.demo@movistar.pe
Contraseña: Demo1234!

Ana Torres
Correo: ana.demo@movistar.pe
Contraseña: Demo1234!
```

Estas cuentas son exclusivamente para el prototipo. El sistema de autenticación se mantiene en memoria y no sustituye la autenticación real de Mi Movistar.

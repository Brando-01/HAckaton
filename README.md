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

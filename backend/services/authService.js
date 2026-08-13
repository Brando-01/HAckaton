const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────
// In-memory store  (prototype — resets on each server restart)
// ─────────────────────────────────────────────────────────
const usersByPhone   = new Map(); // phone  -> user object
const sessionsByToken = new Map(); // token  -> session object

// ─────────────────────────────────────────────────────────
// Cuentas sembradas
//
// Las dos primeras son la demo scriptada (clientes mock CLI000001/2).
// El resto sale de `data/cuentas-demo.json`, generado desde la data real
// por `scripts/generarCuentasDemo.js`: son CUSTOMER_KEY que existen de
// verdad en Cargos_FacturadosV2, así que ejercitan el motor de recibos.
//
// El dataset está anonimizado (solo hay telefono_hash), de modo que el
// celular es una credencial de acceso, no el teléfono del cliente.
// ─────────────────────────────────────────────────────────
const CUENTAS_MOCK = [
  { phone: '987654321', password: 'Demo1234!', customerId: 'CLI000001', name: 'Carlos Mendoza' },
  { phone: '912345678', password: 'Demo1234!', customerId: 'CLI000002', name: 'Ana Torres'    }
];

function cargarCuentasDelDataset() {
  const ruta = path.join(__dirname, '..', 'data', 'cuentas-demo.json');

  if (!fs.existsSync(ruta)) {
    console.warn('⚠️ No hay data/cuentas-demo.json. Ejecuta: node scripts/generarCuentasDemo.js');
    return [];
  }

  try {
    const contenido = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    return (contenido.cuentas || []).map((cuenta) => ({
      phone: cuenta.phone,
      password: cuenta.password,
      customerId: cuenta.customerId,
      name: cuenta.name,
      caso: cuenta.caso || null,
      servicio: cuenta.servicio || null
    }));
  } catch (error) {
    console.warn('⚠️ No se pudo leer cuentas-demo.json:', error.message);
    return [];
  }
}

const CUENTAS_DATASET = cargarCuentasDelDataset();

[...CUENTAS_MOCK, ...CUENTAS_DATASET].forEach((u) => usersByPhone.set(u.phone, u));

if (CUENTAS_DATASET.length > 0) {
  console.log(`🔑 ${CUENTAS_DATASET.length} cuentas del dataset disponibles para iniciar sesión.`);
}

/** Cuentas sembradas, para mostrarlas en la pantalla de acceso de la demo. */
function listarCuentasDemo() {
  return CUENTAS_DATASET.map((cuenta) => ({
    phone: cuenta.phone,
    customerId: cuenta.customerId,
    name: cuenta.name,
    caso: cuenta.caso,
    servicio: cuenta.servicio
  }));
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function normalizePhone(phone) {
  return phone ? String(phone).trim() : null;
}

/** Peruvian mobile: exactly 9 digits starting with 9 */
function validatePhone(phone) {
  return /^9\d{8}$/.test(normalizePhone(phone) || '');
}

// ─────────────────────────────────────────────────────────
// REGISTER  — phone + password + (optional DNI)
// ─────────────────────────────────────────────────────────
function registerUser({ phone, password, dni }) {
  const p = normalizePhone(phone);

  if (!p) {
    const e = new Error('Número de celular requerido'); e.code = 'invalid_input'; throw e;
  }
  if (!validatePhone(p)) {
    const e = new Error('Número inválido. Debe tener 9 dígitos y comenzar con 9.');
    e.code = 'invalid_phone'; throw e;
  }
  if (!password || password.length < 4) {
    const e = new Error('La contraseña debe tener al menos 4 caracteres.');
    e.code = 'password_too_short'; throw e;
  }
  if (usersByPhone.has(p)) {
    const e = new Error('Este número ya tiene una cuenta registrada.');
    e.code = 'user_exists'; throw e;
  }

  const user = { phone: p, password, customerId: dni ? String(dni).trim() : null, name: null };
  usersByPhone.set(p, user);
  return user;
}

// ─────────────────────────────────────────────────────────
// LOGIN  — phone + password
// ─────────────────────────────────────────────────────────
function loginUser({ phone, password }) {
  const p = normalizePhone(phone);

  if (!p) {
    const e = new Error('Número de celular requerido'); e.code = 'invalid_credentials'; throw e;
  }

  const user = usersByPhone.get(p);

  if (!user) {
    const e = new Error('Número no encontrado. Regístrate primero.');
    e.code = 'invalid_credentials'; throw e;
  }

  if (!password || user.password !== password) {
    const e = new Error('Contraseña incorrecta.');
    e.code = 'invalid_credentials'; throw e;
  }

  const token = randomUUID();
  sessionsByToken.set(token, {
    phone:      user.phone,
    customerId: user.customerId || null,
    name:       user.name || null,
  });

  return {
    token,
    user: { phone: user.phone, customerId: user.customerId, name: user.name },
  };
}

// ─────────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────────
function getSession(token) {
  if (!token) return null;
  return sessionsByToken.get(token) || null;
}

function logout(token) {
  sessionsByToken.delete(token);
}

module.exports = { registerUser, loginUser, getSession, logout, validatePhone, listarCuentasDemo };

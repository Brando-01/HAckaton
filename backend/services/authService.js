const { randomUUID } = require('crypto');

// ─────────────────────────────────────────────────────────
// In-memory store  (prototype — resets on each server restart)
// ─────────────────────────────────────────────────────────
const usersByPhone   = new Map(); // phone  -> user object
const sessionsByToken = new Map(); // token  -> session object

// ─────────────────────────────────────────────────────────
// Seeded demo accounts  (9-digit Peruvian numbers)
// Login = phone + password
// ─────────────────────────────────────────────────────────
[
  { phone: '987654321', password: 'Demo1234!', customerId: 'CLI000001', name: 'Carlos Mendoza' },
  { phone: '912345678', password: 'Demo1234!', customerId: 'CLI000002', name: 'Ana Torres'    },
].forEach(u => usersByPhone.set(u.phone, u));

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

module.exports = { registerUser, loginUser, getSession, logout, validatePhone };

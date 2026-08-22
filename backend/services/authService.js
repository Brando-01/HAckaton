const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('crypto');
const path = require('path');
const fs = require('fs');
const { customerIdExistsInData } = require('./dataContextService');
const { getCustomerExperience } = require('./appExperienceService');

const usersById = new Map();
const sessionsByToken = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_USERS_PATH = process.env.AUTH_USERS_PATH || path.resolve(__dirname, '../data/auth-users.json');
const PERSIST_USERS = !process.env.NODE_TEST_CONTEXT && AUTH_USERS_PATH !== ':memory:';
const TEST_DEMO_USER_IDS = new Set(['CLI000001', 'CLI000002']);

function normalizeUserId(userId) {
  return String(userId || '').trim().toUpperCase();
}

function validateUserId(userId) {
  return /^[A-Z0-9_-]{3,64}$/.test(normalizeUserId(userId));
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || '').split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(String(password), salt, 64).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function publicUser(user) {
  return { userId: user.userId, customerId: user.customerId, name: user.name || null };
}

function loadPersistedUsers() {
  if (!PERSIST_USERS || !fs.existsSync(AUTH_USERS_PATH)) return;
  try {
    const storedUsers = JSON.parse(fs.readFileSync(AUTH_USERS_PATH, 'utf8'));
    if (!Array.isArray(storedUsers)) return;
    storedUsers.forEach((user) => {
      if (user && validateUserId(user.userId) && user.passwordHash) {
        const id = normalizeUserId(user.userId);
        if (!process.env.NODE_TEST_CONTEXT && TEST_DEMO_USER_IDS.has(id)) return;
        usersById.set(id, { userId: id, customerId: normalizeUserId(user.customerId || id), name: user.name || null, passwordHash: user.passwordHash });
      }
    });
  } catch (error) {
    console.warn('[AUTH] No se pudieron cargar los usuarios persistidos:', error.message);
  }
}

function persistUsers() {
  if (!PERSIST_USERS) return;
  const temporaryPath = `${AUTH_USERS_PATH}.tmp`;
  const users = [...usersById.values()].map(({ userId, customerId, name, passwordHash }) => ({ userId, customerId, name, passwordHash }));
  fs.mkdirSync(path.dirname(AUTH_USERS_PATH), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, AUTH_USERS_PATH);
}

function createSession(user) {
  const token = randomUUID();
  sessionsByToken.set(token, {
    userId: user.userId,
    customerId: user.customerId,
    name: user.name || null,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

// Las cuentas ficticias se conservan únicamente como fixtures de las pruebas
// automatizadas. Nunca deben estar disponibles al ejecutar la aplicación.
if (process.env.NODE_TEST_CONTEXT) {
  [
    { userId: 'CLI000001', password: 'Demo1234!', name: 'Carlos Mendoza' },
    { userId: 'CLI000002', password: 'Demo1234!', name: 'Ana Torres' }
  ].forEach(({ userId, password, name }) => {
    usersById.set(userId, { userId, customerId: userId, name, passwordHash: hashPassword(password) });
  });
}
loadPersistedUsers();

function registerUser({ userId, password }) {
  const id = normalizeUserId(userId);
  if (!validateUserId(id)) {
    const error = new Error('El ID de usuario debe tener entre 3 y 64 caracteres: letras, números, guion o guion bajo.');
    error.code = 'invalid_user_id';
    throw error;
  }
  if (!password || String(password).length < 8) {
    const error = new Error('La contraseña debe tener al menos 8 caracteres.');
    error.code = 'password_too_short';
    throw error;
  }
  // A user ID must correspond to an existing customer record. This prevents
  // creating an account that could later be mapped to arbitrary data.
  const isKnownCustomer = Boolean(getCustomerExperience(id)) || customerIdExistsInData(path.resolve(__dirname, '../data'), id);
  if (!isKnownCustomer) {
    const error = new Error('El ID de usuario no existe en los datos de clientes. Verifícalo antes de registrarte.');
    error.code = 'unknown_customer';
    throw error;
  }
  if (usersById.has(id)) {
    const error = new Error('Este ID de usuario ya está registrado.');
    error.code = 'user_exists';
    throw error;
  }

  const user = { userId: id, customerId: id, name: null, passwordHash: hashPassword(password) };
  usersById.set(id, user);
  persistUsers();
  return { token: createSession(user), user: publicUser(user) };
}

function loginUser({ userId, password }) {
  const user = usersById.get(normalizeUserId(userId));
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const error = new Error('ID de usuario o contraseña incorrectos.');
    error.code = 'invalid_credentials';
    throw error;
  }
  return { token: createSession(user), user: publicUser(user) };
}

function getSession(token) {
  const session = token ? sessionsByToken.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessionsByToken.delete(token);
    return null;
  }
  return session;
}

function logout(token) {
  sessionsByToken.delete(token);
}

module.exports = { registerUser, loginUser, getSession, logout, validateUserId };

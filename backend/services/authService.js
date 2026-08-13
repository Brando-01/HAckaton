const {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} = require('crypto');

const {
  getDemoProfileDefinitions
} = require(
  '../config/demoProfiles'
);

const SESSION_TTL_MS =
  8 * 60 * 60 * 1000;

const DEMO_PASSWORD =
  'Demo1234!';

function createPasswordRecord(
  password
) {
  const salt =
    randomBytes(16).toString('hex');

  const hash =
    scryptSync(
      password,
      salt,
      64
    ).toString('hex');

  return {
    salt,
    hash
  };
}

const users =
  getDemoProfileDefinitions()
    .map(
      (profile) => ({
        ...profile,
        email:
          normalizeEmail(
            profile.email
          ),
        ...createPasswordRecord(
          DEMO_PASSWORD
        )
      })
    );

const authSessions = new Map();

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function verifyPassword(
  password,
  user
) {
  const attemptedHash =
    scryptSync(
      String(password || ''),
      user.salt,
      64
    );

  const expectedHash =
    Buffer.from(
      user.hash,
      'hex'
    );

  return (
    attemptedHash.length ===
      expectedHash.length &&
    timingSafeEqual(
      attemptedHash,
      expectedHash
    )
  );
}

function sanitizeUser(
  user,
  mode = 'ACCOUNT'
) {
  return {
    userId: user.userId,
    customerId:
      user.customerId,
    name: user.name,
    email: user.email,
    mode
  };
}

function authenticateUser(
  email,
  password
) {
  const normalizedEmail =
    normalizeEmail(email);

  const user =
    users.find(
      (candidate) =>
        candidate.email ===
        normalizedEmail
    );

  if (
    !user ||
    !verifyPassword(
      password,
      user
    )
  ) {
    return null;
  }

  return sanitizeUser(user);
}

function getDemoProfiles() {
  return users.map(
    (user) => ({
      userId: user.userId,
      customerId:
        user.customerId,
      alias: user.alias,
      name: user.name,
      email: user.email,
      release1Pitch:
        user.release1Pitch === true,
      group:
        user.group || 'EXTENDED'
    })
  );
}

function authenticateDemoCustomer(
  customerId
) {
  const user =
    users.find(
      (candidate) =>
        candidate.customerId ===
        customerId
    );

  if (!user) {
    return null;
  }

  return sanitizeUser(
    user,
    'DEMO'
  );
}

function createAuthSession(
  user
) {
  const token =
    randomUUID();

  const session = {
    token,
    user: {
      ...user
    },
    createdAt:
      Date.now(),
    expiresAt:
      Date.now() +
      SESSION_TTL_MS
  };

  authSessions.set(
    token,
    session
  );

  return {
    ...session,
    user: {
      ...session.user
    }
  };
}

function getAuthSession(
  token
) {
  if (!token) {
    return null;
  }

  const session =
    authSessions.get(token);

  if (!session) {
    return null;
  }

  if (
    session.expiresAt <=
    Date.now()
  ) {
    authSessions.delete(token);
    return null;
  }

  // Sliding expiration para que una demo
  // activa no pierda la sesión entre vistas.
  session.expiresAt =
    Date.now() +
    SESSION_TTL_MS;

  return {
    ...session,
    user: {
      ...session.user
    }
  };
}

function destroyAuthSession(
  token
) {
  if (!token) {
    return false;
  }

  return authSessions.delete(token);
}

function clearAuthSessions() {
  authSessions.clear();
}

module.exports = {
  DEMO_PASSWORD,
  SESSION_TTL_MS,
  authenticateUser,
  authenticateDemoCustomer,
  createAuthSession,
  getAuthSession,
  destroyAuthSession,
  getDemoProfiles,
  clearAuthSessions
};

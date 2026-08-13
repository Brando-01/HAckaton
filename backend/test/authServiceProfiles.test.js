const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEMO_PASSWORD,
  authenticateUser,
  authenticateDemoCustomer,
  getDemoProfiles
} = require(
  '../services/authService'
);

test(
  'authService obtiene los usuarios desde el catálogo N y no desde dos objetos hardcodeados',
  () => {
    const profiles =
      getDemoProfiles();

    assert.equal(
      profiles.length,
      6
    );
    assert.equal(
      profiles[2].name,
      'Luis Ramírez'
    );
    assert.equal(
      profiles[3].name,
      'María López'
    );
  }
);

test(
  'un perfil extendido puede autenticarse por correo con la contraseña demo',
  () => {
    const user =
      authenticateUser(
        'LUIS.DEMO@MOVISTAR.PE',
        DEMO_PASSWORD
      );

    assert.ok(user);
    assert.equal(
      user.customerId,
      'CLI000003'
    );
    assert.equal(
      user.name,
      'Luis Ramírez'
    );
  }
);

test(
  'un perfil extendido puede abrirse en modo demo sin contraseña',
  () => {
    const user =
      authenticateDemoCustomer(
        'CLI000006'
      );

    assert.ok(user);
    assert.equal(
      user.name,
      'Sofía Rojas'
    );
    assert.equal(
      user.mode,
      'DEMO'
    );
  }
);

test(
  'la lista pública de perfiles no expone hashes, salts ni contraseña',
  () => {
    const profiles =
      getDemoProfiles();

    profiles.forEach(
      (profile) => {
        assert.equal(
          Object.hasOwn(
            profile,
            'hash'
          ),
          false
        );
        assert.equal(
          Object.hasOwn(
            profile,
            'salt'
          ),
          false
        );
        assert.equal(
          Object.hasOwn(
            profile,
            'password'
          ),
          false
        );
      }
    );
  }
);

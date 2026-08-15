const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEMO_PASSWORD,
  authenticateUser,
  authenticateDemoCustomer,
  getDemoProfiles,
  toPublicAuthUser
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

test(
  'un alias del Explorador no es una cuenta autenticable de cliente',
  () => {
    assert.equal(
      authenticateDemoCustomer(
        'EXP_DEMO000123'
      ),
      null
    );
  }
);


test(
  'la proyección pública de una cuenta dataset elimina NUM_ANEXO interno',
  () => {
    const projected =
      toPublicAuthUser({
        userId: 'D1U-X',
        customerId: 'D1A-X',
        customerCode: '100000001',
        name: 'Cliente 100000001',
        email: null,
        mode: 'DATASET',
        serviceNumberMasked: '•••••0002',
        datasetSubscriberKey: '200000002',
        financialAccount: 'PRIVATE'
      });

    assert.deepEqual(
      projected,
      {
        userId: 'D1U-X',
        customerId: 'D1A-X',
        name: 'Cliente 100000001',
        email: null,
        mode: 'DATASET',
        customerCode: '100000001',
        serviceNumberMasked: '•••••0002'
      }
    );
    assert.equal(
      Object.hasOwn(
        projected,
        'datasetSubscriberKey'
      ),
      false
    );
  }
);

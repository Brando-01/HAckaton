const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const {
  getCustomerExperience,
  getAvailableCustomers,
  customerExists
} = require(
  '../services/appExperienceService'
);


test(
  'obtiene un cliente sintético',
  () => {
    const experience =
      getCustomerExperience(
        'CLI000001'
      );

    assert.ok(experience);

    assert.equal(
      experience.customer.customerId,
      'CLI000001'
    );

    assert.equal(
      experience.currentBill.total,
      125
    );
  }
);


test(
  'la comparación coincide con los totales',
  () => {
    const experience =
      getCustomerExperience(
        'CLI000001'
      );

    const difference =
      experience.currentBill.total -
      experience.previousBill.total;

    assert.equal(
      difference,
      experience.comparison.difference
    );

    assert.equal(
      difference,
      30
    );
  }
);


test(
  'las causas explican la diferencia',
  () => {
    const experience =
      getCustomerExperience(
        'CLI000001'
      );

    const totalImpact =
      experience.comparison.causes
        .reduce(
          (sum, cause) =>
            sum + cause.impact,
          0
        );

    assert.equal(
      totalImpact,
      experience.comparison.difference
    );
  }
);


test(
  'incluye siguientes acciones',
  () => {
    const experience =
      getCustomerExperience(
        'CLI000001'
      );

    assert.ok(
      experience.nextActions.length >= 2
    );

    assert.equal(
      experience.nextActions[0].type,
      'CHAT'
    );
  }
);


test(
  'rechaza cliente inexistente',
  async () => {
    assert.equal(
      getCustomerExperience(
        'NO_EXISTE'
      ),
      null
    );

    assert.equal(
      await customerExists(
        'NO_EXISTE'
      ),
      false
    );
  }
);


test(
  'customerExists valida existencia real, no solo el formato',
  async () => {
    // Los clientes de la demo scriptada siguen valiendo.
    assert.equal(await customerExists('CLI000001'), true);

    // Antes bastaba con tener forma de DNI para pasar el filtro: cualquier
    // cadena de dígitos abría la puerta a los datos de "ese" cliente.
    assert.equal(await customerExists('999999999999'), false);
    assert.equal(await customerExists('123456'), false);

    assert.equal(await customerExists(''), false);
    assert.equal(await customerExists(null), false);
    assert.equal(await customerExists('DROP TABLE clientes'), false);
  }
);


test(
  'lista perfiles disponibles',
  () => {
    const customers =
      getAvailableCustomers();

    assert.ok(
      customers.length >= 2
    );
  }
);
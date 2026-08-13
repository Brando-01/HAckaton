/**
 * Cuentas de acceso sembradas desde la data real.
 *
 * El dataset está anonimizado (solo `telefono_hash`), así que no hay
 * credenciales reales. Estas cuentas atan un celular de acceso a un
 * CUSTOMER_KEY que sí existe en la facturación, para poder iniciar sesión y
 * ver el motor sin registrarse a mano.
 */

process.env.GROQ_FALLBACK_MODE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authService = require('../services/authService');
const { obtenerHechosDeCliente, existeCliente, ARCHIVO_CARGOS } = require('../services/cargosRepository');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RUTA_CUENTAS = path.join(DATA_DIR, 'cuentas-demo.json');
const HAY_DATA_REAL = fs.existsSync(path.join(DATA_DIR, ARCHIVO_CARGOS));
const HAY_CUENTAS = fs.existsSync(RUTA_CUENTAS);
const SALTAR = (!HAY_DATA_REAL || !HAY_CUENTAS) && 'falta data/ o cuentas-demo.json';

test('hay cuentas del dataset sembradas', { skip: SALTAR }, () => {
  const cuentas = authService.listarCuentasDemo();

  assert.ok(cuentas.length >= 5, 'debería haber varias cuentas para demostrar casos distintos');
});

test('cada celular sembrado cumple el formato peruano que exige el login', { skip: SALTAR }, () => {
  for (const cuenta of authService.listarCuentasDemo()) {
    assert.ok(
      authService.validatePhone(cuenta.phone),
      `${cuenta.phone} no pasaría la validación de celular`
    );
  }
});

test('los celulares no se repiten entre sí ni con las cuentas mock', { skip: SALTAR }, () => {
  const telefonos = authService.listarCuentasDemo().map((c) => c.phone);

  assert.equal(new Set(telefonos).size, telefonos.length, 'hay celulares duplicados');
  assert.ok(!telefonos.includes('987654321'), 'colisiona con la cuenta mock sembrada');
  assert.ok(!telefonos.includes('912345678'), 'colisiona con la cuenta mock sembrada');
});

test('cada cuenta apunta a un cliente que existe en la facturación', { skip: SALTAR }, async () => {
  for (const cuenta of authService.listarCuentasDemo()) {
    assert.equal(
      await existeCliente(DATA_DIR, cuenta.customerId),
      true,
      `${cuenta.customerId} no existe en Cargos_FacturadosV2`
    );
  }
});

test('todas se pueden loguear con la contraseña documentada', { skip: SALTAR }, () => {
  for (const cuenta of authService.listarCuentasDemo()) {
    const sesion = authService.loginUser({ phone: cuenta.phone, password: 'Demo1234!' });

    assert.equal(sesion.user.customerId, cuenta.customerId);
    assert.ok(sesion.token);
  }
});

test('cada cuenta tiene los 6 ciclos que pide el reto', { skip: SALTAR }, async () => {
  for (const cuenta of authService.listarCuentasDemo()) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cuenta.customerId);

    assert.equal(hechos.encontrado, true, `${cuenta.customerId} no tiene cargos`);
    assert.equal(hechos.historial.length, 6, `${cuenta.customerId} no llega a 6 ciclos`);
  }
});

test('la serie guardada coincide con lo que calcula el motor', { skip: SALTAR }, async () => {
  // Si alguien regenera el archivo o cambia el motor, esto lo delata.
  const guardadas = JSON.parse(fs.readFileSync(RUTA_CUENTAS, 'utf8')).cuentas;

  for (const cuenta of guardadas) {
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cuenta.customerId);
    const calculada = hechos.historial.map((ciclo) => ciclo.total);

    assert.deepEqual(
      calculada,
      cuenta.ultimosTotales,
      `la serie de ${cuenta.customerId} no coincide con la del motor`
    );
  }
});

test('no se filtra ningún dato personal en las cuentas expuestas', { skip: SALTAR }, () => {
  // El dataset está anonimizado: la etiqueta no debe simular una persona.
  for (const cuenta of authService.listarCuentasDemo()) {
    assert.match(
      cuenta.name,
      /^Cliente \d+$/,
      `"${cuenta.name}" parece un nombre de persona sobre datos anonimizados`
    );
  }
});

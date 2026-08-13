const path = require('path');

const { existeCliente } = require('./cargosRepository');

const customers = new Map([
  [
    'CLI000001',
    {
      customer: {
        customerId: 'CLI000001',
        name: 'Carlos Mendoza',
        plan: 'Movistar Fibra 200 Mbps'
      },

      currentBill: {
        period: 'Julio 2026',
        total: 125,
        status: 'Pendiente',
        dueDate: '15/08/2026',

        items: [
          {
            label: 'Plan Fibra 200 Mbps',
            amount: 115
          },
          {
            label: 'Reconexión',
            amount: 10
          }
        ]
      },

      previousBill: {
        period: 'Junio 2026',
        total: 95,
        status: 'Pagado',

        items: [
          {
            label: 'Plan Fibra 200 Mbps',
            amount: 115
          },
          {
            label: 'Descuento de bienvenida',
            amount: -20
          }
        ]
      },

      comparison: {
        difference: 30,
        percentage: 31.6,
        direction: 'UP',

        causes: [
          {
            code: 'DISCOUNT_ENDED',
            title: 'Finalizó tu descuento',
            description:
              'El descuento de bienvenida de S/ 20 ya no se aplicó en julio.',
            impact: 20
          },

          {
            code: 'RECONNECTION',
            title: 'Cargo por reconexión',
            description:
              'Este mes se registró un cargo de S/ 10 por reconexión.',
            impact: 10
          }
        ]
      },

      nextActions: [
        {
          id: 'EXPLAIN_VARIATION',
          label: 'Entender mi aumento',
          type: 'CHAT',
          prompt:
            'Explícame por qué aumentó mi recibo'
        },

        {
          id: 'CONTACT_ADVISOR',
          label: 'Hablar con un asesor',
          type: 'CHAT',
          prompt:
            'Quiero hablar con un asesor'
        }
      ]
    }
  ],

  [
    'CLI000002',
    {
      customer: {
        customerId: 'CLI000002',
        name: 'Ana Torres',
        plan: 'Movistar Móvil'
      },

      currentBill: {
        period: 'Julio 2026',
        total: 80,
        status: 'Pendiente',
        dueDate: '15/08/2026',

        items: [
          {
            label: 'Plan móvil',
            amount: 55
          },
          {
            label: 'Paquete de roaming',
            amount: 25
          }
        ]
      },

      previousBill: {
        period: 'Junio 2026',
        total: 55,
        status: 'Pagado',

        items: [
          {
            label: 'Plan móvil',
            amount: 55
          }
        ]
      },

      comparison: {
        difference: 25,
        percentage: 45.5,
        direction: 'UP',

        causes: [
          {
            code: 'ROAMING_PACKAGE',
            title: 'Paquete de roaming',
            description:
              'En julio se agregó un paquete de roaming por S/ 25.',
            impact: 25
          }
        ]
      },

      nextActions: [
        {
          id: 'EXPLAIN_VARIATION',
          label: 'Entender mi aumento',
          type: 'CHAT',
          prompt:
            'Explícame por qué aumentó mi recibo'
        },

        {
          id: 'CONTACT_ADVISOR',
          label: 'Hablar con un asesor',
          type: 'CHAT',
          prompt:
            'Quiero hablar con un asesor'
        }
      ]
    }
  ]
]);


function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


function getCustomerExperience(
  customerId
) {
  const experience =
    customers.get(customerId);

  return experience
    ? clone(experience)
    : null;
}


function getAvailableCustomers() {
  return Array.from(
    customers.values()
  ).map(
    (experience) => ({
      customerId:
        experience.customer.customerId,

      name:
        experience.customer.name,

      plan:
        experience.customer.plan
    })
  );
}


// DNI o CUSTOMER_KEY: solo dígitos.
const PATRON_ID_REAL =
  /^\d{6,15}$/;

const RUTA_DATOS =
  path.resolve(__dirname, '../data');


/**
 * Comprueba que el cliente exista de verdad.
 *
 * Antes esto validaba solo el FORMATO del identificador, así que cualquier
 * cadena de dígitos pasaba el filtro. Ahora se consulta el índice real de
 * cargos; el chequeo de formato se conserva únicamente para descartar basura
 * sin tocar el índice.
 *
 * Es asíncrona porque el índice se construye una vez de forma perezosa.
 *
 * @param {string} customerId DNI, CUSTOMER_KEY o id del catálogo mock.
 * @returns {Promise<boolean>}
 */
async function customerExists(
  customerId
) {
  if (!customerId) {
    return false;
  }

  const id =
    String(customerId).trim();

  // Clientes de la demo scriptada (CLI000001 / CLI000002).
  if (customers.has(id)) {
    return true;
  }

  // Corta cadenas arbitrarias antes de pagar la construcción del índice.
  if (!PATRON_ID_REAL.test(id)) {
    return false;
  }

  try {
    return await existeCliente(RUTA_DATOS, id);
  } catch (error) {
    // Si el índice no se puede leer, se niega el acceso. Un fallo de
    // infraestructura no debe convertirse en un permiso concedido.
    console.error('No se pudo verificar el cliente contra el índice:', error);
    return false;
  }
}


module.exports = {
  getCustomerExperience,
  getAvailableCustomers,
  customerExists
};
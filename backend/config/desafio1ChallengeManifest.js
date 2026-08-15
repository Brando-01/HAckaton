const CHALLENGE_MANIFEST_VERSION =
  'desafio1-phase22-final-manifest-v1';

const REQUIRED_SOURCE_KEYS = Object.freeze([
  'planta_clientes',
  'facturacion_clientes',
  'ordenes',
  'catalogo_ofertas',
  'brainy_descuentos_cuotas',
  'brainy_prorrateo',
  'brainy_reconexiones',
  'notas_credito'
]);

const FROZEN_DEMO_CASES = Object.freeze([
  Object.freeze({
    customerId: 'CLI000001',
    name: 'Carlos Mendoza',
    scenario: 'RECONNECTION',
    scenarioLabel: 'Reconexión',
    minimumEvidence: 'HIGH'
  }),
  Object.freeze({
    customerId: 'CLI000002',
    name: 'Ana Torres',
    scenario: 'PRORATION',
    scenarioLabel: 'Prorrateo',
    minimumEvidence: 'HIGH'
  })
]);

const ARCHITECTURE_SNAPSHOT = Object.freeze({
  financialPath: Object.freeze([
    '8 fuentes oficiales locales',
    'SQLite desafio1.db',
    'Repositorio estructurado',
    'Motor financiero determinista',
    'Resolution Engine F15'
  ]),
  experiencePath: Object.freeze([
    'Mi Movistar',
    'Lucía web',
    'WhatsApp simulado',
    'Asesor'
  ]),
  policyLayers: Object.freeze([
    'F16 auditoría financiera / Retrieval Accuracy',
    'F17 matriz B2C RA/RV',
    'F18 política comercial restrictiva',
    'F19 handoff determinista',
    'F20 continuidad omnicanal',
    'F21 benchmark local 3×'
  ]),
  financialReasoningAuthority:
    'STRUCTURED_DATA_AND_DETERMINISTIC_RULES',
  llmRole:
    'LANGUAGE_ASSISTANCE_ONLY_NOT_FINANCIAL_CALCULATION'
});

const STATIC_KNOWN_LIMITS = Object.freeze([
  Object.freeze({
    code: 'DATASET_IDENTIFIER_AUTH_DEMO_ONLY',
    area: 'AUTHENTICATION',
    detail:
      'COD_CLIENTE + NUM_ANEXO se usan únicamente para validar el prototipo contra PLANTA CLIENTES; son identificadores anonimizados del desafío, no secretos ni credenciales productivas de Mi Movistar.'
  }),
  Object.freeze({
    code: 'FINANCED_EQUIPMENT_MAPPING_PENDING',
    area: 'DATASET_COVERAGE',
    detail:
      'Las fuentes disponibles todavía no permiten identificar inequívocamente una cuota de equipo financiado; F17 la conserva como PENDING_MAPPING.'
  }),
  Object.freeze({
    code: 'GENERAL_CREDIT_NOTE_SEMANTICS_CONTEXT_ONLY',
    area: 'DATASET_COVERAGE',
    detail:
      'Las notas de crédito/débito generales se conservan como contexto; solo el subconjunto de suspensión RA conciliado tiene regla monetaria verificable.'
  }),
  Object.freeze({
    code: 'DEBT_STATUS_NOT_AVAILABLE_FACTURACION_V2',
    area: 'BILLING',
    detail:
      'FACTURACION v2 no aporta DEUDA ni FECHA-VENCIMIENTO; el prototipo no infiere saldo pendiente ni vencimiento.'
  }),
  Object.freeze({
    code: 'COMMERCIAL_LAYER_SIMULATED',
    area: 'COMMERCIAL',
    detail:
      'La capa comercial usada para cross-selling es sintética/referencial y no ejecuta contratación ni cambios reales de servicio.'
  }),
  Object.freeze({
    code: 'WHATSAPP_PROVIDER_SIMULATED',
    area: 'OMNICHANNEL',
    detail:
      'WhatsApp usa un adaptador simulado/provider-neutral; no existe integración live con Meta, Twilio o un BSP.'
  }),
  Object.freeze({
    code: 'RUNTIME_STATE_IN_MEMORY',
    area: 'OPERATIONS',
    detail:
      'Sesiones, métricas runtime y deduplicación del adaptador son in-memory para la demo y se reinician con el proceso Node.'
  }),
  Object.freeze({
    code: 'PERFORMANCE_BENCHMARK_LOCAL_NOT_SLA',
    area: 'PERFORMANCE',
    detail:
      'El benchmark 3× se ejecuta en una sola máquina/proceso con SQLite local; no representa SLA ni capacidad productiva de Movistar.'
  }),
  Object.freeze({
    code: 'REPEAT_CONTACTS_IS_PROXY',
    area: 'METRICS',
    detail:
      'Contactos repetidos sigue siendo un proxy dentro de la ejecución local; no existe una ventana persistente productiva cross-device.'
  })
]);

const FINAL_REQUIRED_CHECK_IDS = Object.freeze([
  'DATASETS_8_OF_8',
  'TEST_SUITE',
  'CRITICAL_DEMO_CAUSES',
  'PRIVACY',
  'EXPLORER_AUTH_BOUNDARY',
  'DATASET_AUTH_BOUNDARY',
  'CONVERSATIONAL_GROUNDING_BOUNDARY',
  'RETRIEVAL_ACCURACY',
  'HALLUCINATION_GUARD',
  'HANDOFF_POLICY',
  'BILLING_HISTORY',
  'CROSS_SELLING_GUARD',
  'B2C_MATRIX',
  'OMNICHANNEL_CONTINUITY',
  'PERFORMANCE_3X',
  'RELEASE_SMOKE'
]);

module.exports = {
  CHALLENGE_MANIFEST_VERSION,
  REQUIRED_SOURCE_KEYS,
  FROZEN_DEMO_CASES,
  ARCHITECTURE_SNAPSHOT,
  STATIC_KNOWN_LIMITS,
  FINAL_REQUIRED_CHECK_IDS
};

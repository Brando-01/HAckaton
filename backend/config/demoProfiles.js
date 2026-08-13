const DEMO_PROFILE_DEFINITIONS = Object.freeze([
  Object.freeze({
    userId: 'USR000001',
    customerId: 'CLI000001',
    alias: 'carlos',
    name: 'Carlos Mendoza',
    email: 'carlos.demo@movistar.pe',
    scenario: 'RECONNECTION',
    selectionRank: 1,
    release1Pitch: true,
    group: 'PITCH'
  }),
  Object.freeze({
    userId: 'USR000002',
    customerId: 'CLI000002',
    alias: 'ana',
    name: 'Ana Torres',
    email: 'ana.demo@movistar.pe',
    scenario: 'PRORATION',
    selectionRank: 1,
    release1Pitch: true,
    group: 'PITCH'
  }),
  Object.freeze({
    userId: 'USR000003',
    customerId: 'CLI000003',
    alias: 'luis',
    name: 'Luis Ramírez',
    email: 'luis.demo@movistar.pe',
    scenario: 'DISCOUNT_ENDED',
    selectionRank: 1,
    release1Pitch: false,
    group: 'EXTENDED'
  }),
  Object.freeze({
    userId: 'USR000004',
    customerId: 'CLI000004',
    alias: 'maria',
    name: 'María López',
    email: 'maria.demo@movistar.pe',
    scenario: 'PLAN_CHANGE',
    selectionRank: 1,
    release1Pitch: false,
    group: 'EXTENDED'
  }),
  Object.freeze({
    userId: 'USR000005',
    customerId: 'CLI000005',
    alias: 'jose',
    name: 'José Vargas',
    email: 'jose.demo@movistar.pe',
    scenario: 'RECONNECTION',
    selectionRank: 2,
    release1Pitch: false,
    group: 'EXTENDED'
  }),
  Object.freeze({
    userId: 'USR000006',
    customerId: 'CLI000006',
    alias: 'sofia',
    name: 'Sofía Rojas',
    email: 'sofia.demo@movistar.pe',
    scenario: 'PRORATION',
    selectionRank: 2,
    release1Pitch: false,
    group: 'EXTENDED'
  })
]);

function cloneProfile(profile) {
  return {
    ...profile
  };
}

function getDemoProfileDefinitions() {
  return DEMO_PROFILE_DEFINITIONS.map(
    cloneProfile
  );
}

function getDemoProfileDefinition(
  customerId
) {
  const id = String(
    customerId || ''
  ).trim();

  const profile =
    DEMO_PROFILE_DEFINITIONS.find(
      (candidate) =>
        candidate.customerId === id
    );

  return profile
    ? cloneProfile(profile)
    : null;
}

function getRelease1PitchProfileIds() {
  return DEMO_PROFILE_DEFINITIONS
    .filter(
      (profile) =>
        profile.release1Pitch === true
    )
    .map(
      (profile) =>
        profile.customerId
    );
}

function getConfiguredScenarioRequirements(
  definitions =
    DEMO_PROFILE_DEFINITIONS
) {
  const requirements =
    new Map();

  for (const profile of definitions) {
    const scenario =
      String(
        profile?.scenario || ''
      )
        .trim()
        .toUpperCase();

    const rank = Math.max(
      1,
      Number.parseInt(
        profile?.selectionRank,
        10
      ) || 1
    );

    requirements.set(
      scenario,
      Math.max(
        requirements.get(
          scenario
        ) || 0,
        rank
      )
    );
  }

  return requirements;
}

module.exports = {
  DEMO_PROFILE_DEFINITIONS,
  getDemoProfileDefinitions,
  getDemoProfileDefinition,
  getRelease1PitchProfileIds,
  getConfiguredScenarioRequirements
};

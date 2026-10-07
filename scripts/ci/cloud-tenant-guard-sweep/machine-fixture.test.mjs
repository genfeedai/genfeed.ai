import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildDiagnosticSummary, coverageErrors } from './core.mjs';
import {
  assertMachineResponse,
  MACHINE_CONTENT_HASH,
  MACHINE_DEFINITION,
  MACHINE_MARKER,
  MACHINE_TEMPLATES,
  MACHINE_TOKEN,
  machineCoverage,
  machineRoute,
  seedMachineFixture,
} from './machine-fixture.mjs';

const privateFixture = {
  organizationId: 'private-organization-canary',
  brandId: 'private-brand-canary',
  userId: 'private-user-canary',
  integrationId: 'private-integration-canary',
  executionId: 'private-execution-canary',
};
function positive(template) {
  const row = {
    id: privateFixture.integrationId,
    organizationId: privateFixture.organizationId,
    platform: 'TELEGRAM',
    status: 'ACTIVE',
    botToken: MACHINE_TOKEN,
    encryptedToken: 'private-cipher-canary',
    sql: 'private-SQL-canary',
  };
  const json =
    template === MACHINE_TEMPLATES[0]
      ? [row]
      : template === MACHINE_TEMPLATES[1]
        ? row
        : template === MACHINE_TEMPLATES[2]
          ? {
              data: {
                id: 'platform-runtime-settings',
                type: 'platformSetting',
                attributes: { imageCompressionQuality: 47 },
              },
            }
          : {
              data: {
                id: privateFixture.executionId,
                type: 'workflow-execution',
                attributes: {
                  organizationId: privateFixture.organizationId,
                  userId: privateFixture.userId,
                  status: 'COMPLETED',
                  inputValues: { ciFixture: MACHINE_MARKER },
                },
              },
            };
  return {
    record: {
      actor: 'MACHINE',
      method: 'GET',
      route: template,
      phase: 'machineGets',
      sweepPhase: 'machineGets',
      status: 200,
      hasTenantHit: false,
    },
    body: JSON.stringify(json),
    json,
  };
}
function coverageFixture() {
  const templates = [
    ...Array.from({ length: 609 }, (_, i) => `/v1/example-${i}`),
    ...MACHINE_TEMPLATES,
  ];
  const requests = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    templates.map((route) => ({
      actor,
      method: 'GET',
      phase: 'get',
      route,
      status: MACHINE_TEMPLATES.includes(route) ? 401 : 200,
      hasTenantHit: false,
    })),
  );
  for (const template of MACHINE_TEMPLATES) {
    const response = positive(template);
    assert.equal(
      assertMachineResponse(template, response, privateFixture),
      true,
    );
    requests.push(response.record);
  }
  requests.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, (_, i) => ({
        actor,
        method: 'POST',
        phase: 'tool',
        route: `/v1/agent-tools/tool${i}/execute`,
        status: 200,
      })),
    ),
  );
  return { requests, templates };
}

test('machine fixture seeds only direct database writes in deferred identity/version/execution order and verifies readback', async () => {
  const calls = [],
    stored = new Map();
  const transaction = Object.fromEntries(
    ['orgIntegration', 'workflow', 'workflowVersion', 'workflowExecution'].map(
      (name) => [
        name,
        {
          create: async ({ data }) => {
            calls.push(name);
            stored.set(name, data);
            return data;
          },
          findFirst: async ({ where }) => {
            assert.equal(where.organizationId, privateFixture.organizationId);
            return stored.get(name);
          },
        },
      ],
    ),
  );
  let transactions = 0,
    id = 0;
  const descriptor = await seedMachineFixture(
    {
      $transaction: async (run) => {
        transactions++;
        return run(transaction);
      },
    },
    privateFixture,
    {
      secret: 'private-key-canary',
      deriveEncryptionKey: (secret) => {
        assert.equal(secret, 'private-key-canary');
        return 'derived';
      },
      encryptWithKey: (key, token) => {
        assert.equal(key, 'derived');
        assert.equal(token, MACHINE_TOKEN);
        return 'private-cipher-canary';
      },
      uuid: () => `private-id-${++id}`,
    },
  );
  assert.equal(transactions, 1);
  assert.deepEqual(calls, [
    'orgIntegration',
    'workflow',
    'workflowVersion',
    'workflowExecution',
  ]);
  const workflow = stored.get('workflow'),
    version = stored.get('workflowVersion'),
    execution = stored.get('workflowExecution'),
    integration = stored.get('orgIntegration');
  assert.equal(workflow.currentVersionId, version.id);
  assert.equal(version.workflowId, workflow.id);
  assert.equal(execution.workflowId, workflow.id);
  assert.equal(execution.workflowVersionId, version.id);
  assert.equal(workflow.status, 'draft');
  assert.equal(workflow.isScheduleEnabled, false);
  assert.equal(workflow.isDeleted, false);
  assert.equal(workflow.brandId, privateFixture.brandId);
  assert.equal(workflow.userId, privateFixture.userId);
  assert.deepEqual(version.graph, MACHINE_DEFINITION.graph);
  assert.deepEqual(version.inputSchema, []);
  assert.equal(version.version, 1);
  assert.equal(version.contentHash, MACHINE_CONTENT_HASH);
  assert.equal(execution.status, 'COMPLETED');
  assert.equal(execution.progress, 100);
  assert.equal(execution.creditsUsed, 0);
  assert.equal(execution.isDeleted, false);
  assert.equal(execution.result.inputValues.ciFixture, MACHINE_MARKER);
  assert.equal(integration.status, 'ACTIVE');
  assert.equal(integration.platform, 'TELEGRAM');
  assert.equal(integration.isDeleted, false);
  assert.deepEqual(integration.config, {});
  assert.equal(integration.encryptedToken, 'private-cipher-canary');
  assert.deepEqual(
    Object.keys(descriptor).sort(),
    [
      'integrationId',
      'workflowId',
      'versionId',
      'executionId',
      'organizationId',
      'userId',
    ].sort(),
  );
  assert.equal(
    MACHINE_CONTENT_HASH,
    `sha256:v1:${createHash('sha256').update('{"graph":{"edges":[],"lockedNodeIds":[],"nodes":[]},"inputSchema":[]}').digest('hex')}`,
  );
});

test('machine fixture fails closed on encryption or readback errors without serializing secrets', async () => {
  await assert.rejects(
    seedMachineFixture({}, privateFixture, {
      secret: '',
      deriveEncryptionKey() {},
      encryptWithKey() {},
    }),
    /^Error: Machine fixture encryption unavailable$/,
  );
  const transaction = Object.fromEntries(
    ['orgIntegration', 'workflow', 'workflowVersion', 'workflowExecution'].map(
      (name) => [
        name,
        {
          create: async () => {},
          findFirst: async () => ({ secret: 'private-canary' }),
        },
      ],
    ),
  );
  await assert.rejects(
    seedMachineFixture(
      { $transaction: (run) => run(transaction) },
      privateFixture,
      {
        secret: 'private-key-canary',
        deriveEncryptionKey: (value) => value,
        encryptWithKey: () => 'cipher',
      },
    ),
    /^Error: Machine fixture readback failed$/,
  );
});

for (const template of MACHINE_TEMPLATES) {
  test(`machine positive requires exact nonempty data and discards transient payload: ${template}`, () => {
    const response = positive(template);
    assert.equal(
      assertMachineResponse(template, response, privateFixture),
      true,
    );
    assert.equal(response.json, null);
    assert.equal(response.body, '');
    assert.doesNotMatch(
      JSON.stringify(response.record),
      /private-|botToken|encryptedToken|sql/,
    );
    for (const change of [
      (r) => (r.json = null),
      (r) => (r.json = {}),
      (r) => (r.record.status = 401),
      (r) => (r.record.status = 403),
      (r) => (r.record.hasTenantHit = true),
      (r) => (r.record.isRetry = true),
      (r) => (r.record.isTimeout = true),
    ]) {
      const wrong = positive(template);
      change(wrong);
      assert.equal(
        assertMachineResponse(template, wrong, privateFixture),
        false,
      );
      assert.equal(wrong.json, null);
      assert.equal(wrong.body, '');
    }
    const wrong = positive(template);
    const data = Array.isArray(wrong.json)
      ? wrong.json[0]
      : (wrong.json.data ?? wrong.json);
    if (template.includes('platform-runtime'))
      data.attributes.imageCompressionQuality = 48;
    else data.id = 'wrong';
    assert.equal(assertMachineResponse(template, wrong, privateFixture), false);
  });
}
test('only machine templates receive fixture-specific id/org substitution', () => {
  assert.equal(
    machineRoute(MACHINE_TEMPLATES[0], privateFixture),
    '/v1/internal/integrations/TELEGRAM',
  );
  assert.equal(
    machineRoute(MACHINE_TEMPLATES[1], privateFixture),
    `/v1/internal/integrations/TELEGRAM/${privateFixture.integrationId}`,
  );
  assert.equal(
    machineRoute(MACHINE_TEMPLATES[3], privateFixture),
    `/v1/internal/orgs/${privateFixture.organizationId}/workflow-executions/${privateFixture.executionId}`,
  );
  assert.throws(
    () => machineRoute('/v1/posts/{id}', privateFixture),
    /^Error: Machine route inventory invalid$/,
  );
});

test('four actors retain full N inventory, exactly sixteen denials and four separately asserted machine positives', () => {
  const { requests, templates } = coverageFixture();
  assert.deepEqual(coverageErrors(requests, 613, 20, 20, templates), []);
  const projection = machineCoverage(requests, templates, true);
  assert.equal(projection.discoveredGets, 613);
  assert.equal(projection.ordinaryGets, 609);
  assert.equal(projection.available, true);
  assert.equal(
    projection.denials
      .flatMap((value) => value.denials)
      .filter((value) => value.denied).length,
    16,
  );
  assert.equal(
    projection.positives.reduce(
      (sum, value) => sum + value.assertedPositives,
      0,
    ),
    4,
  );
});
for (const [name, change, label] of [
  ['missing template', (f) => f.templates.pop(), 'machine-route-inventory'],
  [
    'duplicate template',
    (f) => f.templates.push(MACHINE_TEMPLATES[0]),
    'machine-route-inventory',
  ],
  [
    'negative duplicate',
    (f) => f.requests.push({ ...f.requests.find((r) => r.status === 401) }),
    'machine-authorization-denial',
  ],
  [
    'negative retry',
    (f) => (f.requests.find((r) => r.status === 401).isRetry = true),
    'machine-authorization-denial',
  ],
  ...[200, 403, 404, 500, 0].map((status) => [
    `negative status ${status}`,
    (f) => (f.requests.find((r) => r.status === 401).status = status),
    'machine-authorization-denial',
  ]),
  [
    'negative tenant hit',
    (f) => (f.requests.find((r) => r.status === 401).hasTenantHit = true),
    'machine-authorization-denial',
  ],
  [
    'wrong machine key',
    (f) => (f.requests.find((r) => r.actor === 'MACHINE').status = 401),
    'machine-data-coverage',
  ],
  [
    'wrong machine data',
    (f) =>
      (f.requests.find((r) => r.actor === 'MACHINE').machineDataAsserted =
        false),
    'machine-data-coverage',
  ],
  [
    'missing machine phase',
    (f) =>
      (f.requests.find((r) => r.actor === 'MACHINE').sweepPhase = 'controls'),
    'machine-data-coverage',
  ],
  [
    'machine tenant hit',
    (f) => (f.requests.find((r) => r.actor === 'MACHINE').hasTenantHit = true),
    'machine-data-coverage',
  ],
  [
    'machine duplicate',
    (f) =>
      f.requests.push({ ...f.requests.find((r) => r.actor === 'MACHINE') }),
    'machine-data-coverage',
  ],
])
  test(`required machine coverage rejects ${name}`, () => {
    const f = coverageFixture();
    change(f);
    assert.ok(
      machineCoverage(f.requests, f.templates, true).failures.includes(label),
    );
  });

test('historical machine proof stays unavailable; current finalizer recomputes mandatory sanitized projection and fails missing positives', () => {
  const historical = buildDiagnosticSummary({
    sourceSha: 'a'.repeat(40),
    requests: [],
    inventoryTemplates: [],
  });
  assert.equal(historical.machineCoverage.available, false);
  const f = coverageFixture();
  const report = {
    sourceSha: 'a'.repeat(40),
    requests: f.requests,
    inventoryTemplates: f.templates,
    getInventoryTemplates: f.templates,
    machineCoverageRequired: true,
    failures: [],
  };
  const summary = buildDiagnosticSummary(report);
  assert.deepEqual(summary.machineCoverage.failures, []);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /private-|botToken|encryptedToken|SQL|cipher|key-canary/,
  );
  report.requests = report.requests.filter((r) => r.actor !== 'MACHINE');
  buildDiagnosticSummary(report);
  assert.equal(report.hasFailed, true);
  assert.ok(report.failures.includes('machine-data-coverage'));
});

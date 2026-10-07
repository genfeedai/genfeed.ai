import { createHash, randomUUID } from 'node:crypto';

export const MACHINE_TEMPLATES = Object.freeze([
  '/v1/internal/integrations/{platform}',
  '/v1/internal/integrations/{platform}/{id}',
  '/v1/internal/platform-runtime-settings',
  '/v1/internal/orgs/{orgId}/workflow-executions/{id}',
]);
export const MACHINE_TOKEN = 'ci-isolated-non-provider-machine-token';
export const MACHINE_MARKER = 'internal-machine-get';
export const MACHINE_DEFINITION = Object.freeze({
  graph: { edges: [], lockedNodeIds: [], nodes: [] },
  inputSchema: [],
});
export const MACHINE_CONTENT_HASH = `sha256:v1:${createHash('sha256').update('{"graph":{"edges":[],"lockedNodeIds":[],"nodes":[]},"inputSchema":[]}').digest('hex')}`;

export async function seedMachineFixture(
  prisma,
  organization,
  { deriveEncryptionKey, encryptWithKey, secret, uuid = randomUUID },
) {
  if (
    !secret ||
    typeof deriveEncryptionKey !== 'function' ||
    typeof encryptWithKey !== 'function'
  )
    throw new Error('Machine fixture encryption unavailable');
  const { organizationId, brandId, userId } = organization;
  if (
    ![organizationId, brandId, userId].every(
      (value) => typeof value === 'string' && value.length,
    )
  )
    throw new Error('Machine fixture identity unavailable');
  const integrationId = uuid(),
    workflowId = uuid(),
    versionId = uuid(),
    executionId = uuid();
  const encryptedToken = encryptWithKey(
    deriveEncryptionKey(secret),
    MACHINE_TOKEN,
  );
  if (
    typeof encryptedToken !== 'string' ||
    encryptedToken === MACHINE_TOKEN ||
    !encryptedToken
  )
    throw new Error('Machine fixture encryption unavailable');
  await prisma.$transaction(async (transaction) => {
    await transaction.orgIntegration.create({
      data: {
        id: integrationId,
        organizationId,
        platform: 'TELEGRAM',
        status: 'ACTIVE',
        isDeleted: false,
        config: {},
        encryptedToken,
      },
    });
    await transaction.workflow.create({
      data: {
        id: workflowId,
        currentVersionId: versionId,
        organizationId,
        brandId,
        userId,
        label: 'CI inert machine read',
        status: 'draft',
        isScheduleEnabled: false,
        isDeleted: false,
      },
    });
    await transaction.workflowVersion.create({
      data: {
        id: versionId,
        workflowId,
        organizationId,
        userId,
        version: 1,
        ...MACHINE_DEFINITION,
        contentHash: MACHINE_CONTENT_HASH,
      },
    });
    await transaction.workflowExecution.create({
      data: {
        id: executionId,
        workflowId,
        workflowVersionId: versionId,
        organizationId,
        userId,
        status: 'COMPLETED',
        progress: 100,
        creditsUsed: 0,
        isDeleted: false,
        result: { inputValues: { ciFixture: MACHINE_MARKER } },
      },
    });
    const integration = await transaction.orgIntegration.findFirst({
      where: { id: integrationId, organizationId, isDeleted: false },
    });
    const workflow = await transaction.workflow.findFirst({
      where: { id: workflowId, organizationId, isDeleted: false },
    });
    const version = await transaction.workflowVersion.findFirst({
      where: { id: versionId, workflowId, organizationId },
    });
    const execution = await transaction.workflowExecution.findFirst({
      where: { id: executionId, organizationId, isDeleted: false },
    });
    if (
      !(
        integration?.encryptedToken === encryptedToken &&
        integration.platform === 'TELEGRAM' &&
        integration.status === 'ACTIVE' &&
        workflow?.currentVersionId === versionId &&
        workflow.userId === userId &&
        workflow.brandId === brandId &&
        workflow.status === 'draft' &&
        workflow.isScheduleEnabled === false &&
        version?.contentHash === MACHINE_CONTENT_HASH &&
        version.version === 1 &&
        version.userId === userId &&
        JSON.stringify(version.graph) ===
          JSON.stringify(MACHINE_DEFINITION.graph) &&
        JSON.stringify(version.inputSchema) === '[]' &&
        execution?.workflowId === workflowId &&
        execution.workflowVersionId === versionId &&
        execution.userId === userId &&
        execution.status === 'COMPLETED' &&
        execution.progress === 100 &&
        execution.creditsUsed === 0 &&
        execution.result?.inputValues?.ciFixture === MACHINE_MARKER
      )
    )
      throw new Error('Machine fixture readback failed');
  });
  return {
    integrationId,
    workflowId,
    versionId,
    executionId,
    organizationId,
    userId,
  };
}

export function machineRoute(template, fixture) {
  if (!MACHINE_TEMPLATES.includes(template))
    throw new Error('Machine route inventory invalid');
  return template
    .replace('{platform}', 'TELEGRAM')
    .replace('{orgId}', encodeURIComponent(fixture.organizationId))
    .replace(
      '{id}',
      encodeURIComponent(
        template.includes('workflow-executions')
          ? fixture.executionId
          : fixture.integrationId,
      ),
    );
}

export function assertMachineResponse(template, response, fixture) {
  let asserted = false;
  try {
    if (
      !MACHINE_TEMPLATES.includes(template) ||
      response.record.status !== 200 ||
      response.record.hasTenantHit ||
      response.record.isTimeout ||
      response.record.isRetry
    )
      return false;
    const integrationMatches = (value) =>
      value?.id === fixture.integrationId &&
      value.organizationId === fixture.organizationId &&
      value.platform === 'TELEGRAM' &&
      value.status === 'ACTIVE' &&
      value.botToken === MACHINE_TOKEN;
    const json = response.json;
    if (template === MACHINE_TEMPLATES[0])
      asserted =
        Array.isArray(json) && json.length === 1 && integrationMatches(json[0]);
    else if (template === MACHINE_TEMPLATES[1])
      asserted = integrationMatches(json);
    else if (template === MACHINE_TEMPLATES[2])
      asserted =
        json?.data?.id === 'platform-runtime-settings' &&
        json.data.type === 'platformSetting' &&
        json.data.attributes?.imageCompressionQuality === 47;
    else
      asserted =
        json?.data?.id === fixture.executionId &&
        json.data.type === 'workflow-execution' &&
        json.data.attributes?.organizationId === fixture.organizationId &&
        json.data.attributes?.userId === fixture.userId &&
        json.data.attributes?.status === 'COMPLETED' &&
        json.data.attributes?.inputValues?.ciFixture === MACHINE_MARKER;
    return Boolean(asserted);
  } finally {
    response.record.machineDataAsserted = Boolean(asserted);
    response.json = null;
    response.body = '';
  }
}

export function machineCoverage(records, templates, required = false) {
  const available = required === true;
  const inventoryComplete =
    Array.isArray(templates) &&
    MACHINE_TEMPLATES.every(
      (template) =>
        templates.filter((value) => value === template).length === 1,
    );
  const actors = ['M:A', 'M2:B', 'S', 'S:A'];
  const failures = new Set();
  if (available && !inventoryComplete) failures.add('machine-route-inventory');
  const denials = actors.map((actor) => {
    const probes = MACHINE_TEMPLATES.map((template) => {
      const attempts = records.filter(
        (record) =>
          record.actor === actor &&
          record.phase === 'get' &&
          record.route === template,
      );
      const denied =
        attempts.length === 1 &&
        attempts[0].status === 401 &&
        !attempts[0].isTimeout &&
        !attempts[0].isRetry &&
        !attempts[0].hasTenantHit;
      if (available && !denied) failures.add('machine-authorization-denial');
      return {
        template,
        attempts: attempts.length,
        status: attempts.length === 1 ? attempts[0].status : null,
        denied,
      };
    });
    const ordinary = records.filter(
      (record) =>
        record.actor === actor &&
        record.phase === 'get' &&
        !MACHINE_TEMPLATES.includes(record.route),
    );
    return {
      actor,
      ordinaryAttempts: ordinary.filter((record) => !record.isRetry).length,
      ordinaryCompletions: ordinary.filter(
        (record) => record.status > 0 && ![401, 429].includes(record.status),
      ).length,
      denials: probes,
    };
  });
  const positives = MACHINE_TEMPLATES.map((template) => {
    const attempts = records.filter(
      (record) => record.actor === 'MACHINE' && record.route === template,
    );
    const terminal =
      attempts.length === 1 &&
      attempts[0].phase === 'machineGets' &&
      attempts[0].sweepPhase === 'machineGets' &&
      attempts[0].status === 200 &&
      !attempts[0].isRetry &&
      !attempts[0].isTimeout &&
      !attempts[0].hasTenantHit;
    const asserted = terminal && attempts[0].machineDataAsserted === true;
    if (available && !asserted) failures.add('machine-data-coverage');
    return {
      template,
      attempts: attempts.length,
      terminalResponses: terminal ? 1 : 0,
      assertedPositives: asserted ? 1 : 0,
    };
  });
  return {
    version: 1,
    available,
    inventoryComplete,
    discoveredGets: templates?.length ?? 0,
    ordinaryGets: inventoryComplete ? templates.length - 4 : null,
    denials,
    positives,
    failures: [...failures],
  };
}

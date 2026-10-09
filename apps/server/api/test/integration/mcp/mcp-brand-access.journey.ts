import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mutationSnapshot,
  proveMigrationInventory,
  requireMcpRuntime,
  runtimePrisma,
  seedMcpRuntime,
} from '@api-test/integration/mcp/mcp-auth-runtime.fixture';
import type {
  McpRuntimeActorLabel,
  McpRuntimeCase,
} from '@api-test/integration/mcp/mcp-auth-runtime.interface';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Redis from 'ioredis';

function record(value: unknown): Record<string, unknown> {
  requireMcpRuntime(
    value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_RESPONSE_SHAPE',
  );
  return value as Record<string, unknown>;
}
function denied(value: unknown): boolean {
  const row = record(value);
  return (
    row.isError === true || row.success === false || Object.hasOwn(row, 'error')
  );
}
function publicShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicShape);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !['requestId', 'timestamp', 'durationMs'].includes(key),
        )
        .map(([key, entry]) => [key, publicShape(entry)]),
    );
  return value;
}
const prisma = runtimePrisma();
const clients: Client[] = [];
const redis = new Redis('redis://127.0.0.1:6379/1', {
  maxRetriesPerRequest: 1,
});
const cases: McpRuntimeCase[] = [];
let principalStage = 'SIGNIN';
const caseRun = async (id: string, run: () => Promise<void>) => {
  try {
    await run();
    cases.push({ id, status: 'passed' });
    process.stdout.write(`${id} passed\n`);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (
      id !== 'B01_REAL_PRINCIPALS' &&
      [
        'INVALID_RESPONSE_SHAPE',
        'PROTECTED_READ_FAILED',
        'VISIBLE_BRAND_MISSING',
        'HIDDEN_BRAND_DISCLOSED',
        'REST_LIST',
        'REST_COUNT_METADATA',
        'REST_FOREIGN_SCOPE',
      ].includes(code)
    )
      throw new Error(`${id}_${code}`);
    throw new Error(
      id === 'B01_REAL_PRINCIPALS' ? `${id}_${principalStage}` : id,
    );
  }
};
async function rest(
  token: string | undefined,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`http://127.0.0.1:3010${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: (await response.json()) as unknown,
    headers: response.headers,
  };
}
async function connect(token: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const client = new Client(
    { name: 'genfeed-member-brand-acceptance', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('http://127.0.0.1:3014/mcp'),
    { requestInit: { headers } },
  );
  clients.push(client);
  await client.connect(transport);
  return { client, headers };
}
try {
  const migrationInventoryDigest = await proveMigrationInventory();
  const fixture = await seedMcpRuntime(prisma);
  const sessions = {} as Record<
    McpRuntimeActorLabel,
    { token: string; client: Client; headers: Record<string, string> }
  >;
  let key = '';
  let keyClient: Awaited<ReturnType<typeof connect>> | undefined;
  const requireKeyClient = () => {
    requireMcpRuntime(keyClient, 'REAL_KEY_TRANSPORT_REQUIRED');
    return keyClient;
  };
  const visible = (value: unknown, labels: Array<'A' | 'B'>) => {
    requireMcpRuntime(!denied(value), 'PROTECTED_READ_FAILED');
    const text = JSON.stringify(value);
    for (const label of labels)
      requireMcpRuntime(
        text.includes(fixture.brands[label]),
        'VISIBLE_BRAND_MISSING',
      );
    for (const label of ['A', 'B', 'D', 'X'] as const)
      if (!labels.includes(label as 'A' | 'B')) {
        requireMcpRuntime(
          !text.includes(fixture.brands[label]) &&
            !text.includes(`sentinel-brand-${label}`) &&
            !text.includes(`sentinel-slug-${label.toLowerCase()}`),
          'HIDDEN_BRAND_DISCLOSED',
        );
      }
  };
  const tool = async (
    label: McpRuntimeActorLabel,
    name: string,
    args: Record<string, unknown> = {},
  ) => {
    try {
      return await sessions[label].client.callTool({ name, arguments: args });
    } catch (error) {
      if (
        error instanceof StreamableHTTPError &&
        (error.code === 401 || error.code === 403)
      )
        return { isError: true, transportStatus: error.code };
      throw error;
    }
  };
  const denyTool = async (
    label: McpRuntimeActorLabel,
    name: string,
    args: Record<string, unknown>,
  ) => {
    const result = await tool(label, name, args);
    requireMcpRuntime(denied(result), 'BRAND_DENIAL_REQUIRED');
    const text = JSON.stringify(result);
    requireMcpRuntime(
      !text.includes('sentinel-brand-') && !text.includes('sentinel-slug-'),
      'HIDDEN_ERROR_METADATA',
    );
    return publicShape(result);
  };
  await caseRun('B01_REAL_PRINCIPALS', async () => {
    for (const label of ['U', 'V', 'W', 'Z'] as const) {
      const actor = fixture.actors[label];
      principalStage = 'SIGNIN';
      const signIn = () =>
        rest(undefined, '/v1/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://127.0.0.1:3000',
          },
          body: JSON.stringify({
            email: actor.email,
            password: actor.password,
          }),
        });
      let signin = await signIn();
      if (signin.status === 429) {
        principalStage = 'SIGNIN_HTTP_429';
        const retryAfter = Number(signin.headers.get('x-retry-after'));
        requireMcpRuntime(
          Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 10,
          'BOUNDED_SIGNIN_RETRY',
        );
        // Four real principals share the production three-per-ten-second cap.
        // Respect its response interval; never clear counters or bypass it.
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfter * 1000 + 100),
        );
        signin = await signIn();
      }
      if (signin.status !== 200) {
        principalStage = `SIGNIN_HTTP_${signin.status}`;
        const code = record(signin.body).code;
        if (
          typeof code === 'string' &&
          [
            'INVALID_EMAIL_OR_PASSWORD',
            'INVALID_ORIGIN',
            'EMAIL_NOT_VERIFIED',
            'USER_BANNED',
          ].includes(code)
        )
          principalStage += `_${code}`;
      } else principalStage = 'SIGNIN_IDENTITY';
      requireMcpRuntime(
        signin.status === 200 &&
          record(record(signin.body).user).id === actor.id,
        'REAL_SIGNIN',
      );
      principalStage = 'COOKIE';
      const cookie = signin.headers
        .getSetCookie()
        .map((entry) => entry.split(';')[0])
        .join('; ');
      requireMcpRuntime(cookie, 'REAL_SESSION_COOKIE');
      principalStage = 'TOKEN';
      const tokenResponse = await rest(undefined, '/v1/auth/token', {
        headers: { cookie },
      });
      const token = record(tokenResponse.body).token;
      requireMcpRuntime(
        tokenResponse.status === 200 && typeof token === 'string',
        'REAL_JWT',
      );
      principalStage = 'CONTEXT';
      const who = await rest(token, '/v1/auth/whoami');
      const data = record(record(who.body).data);
      requireMcpRuntime(
        who.status === 200 &&
          record(data.user).id === actor.id &&
          record(data.organization).id === fixture.organizationId,
        'REAL_WHOAMI',
      );
      requireMcpRuntime(
        (await prisma.session.count({ where: { userId: actor.id } })) > 0,
        'REAL_PERSISTED_SESSION',
      );
      principalStage = 'TRANSPORT';
      sessions[label] = { token, ...(await connect(token)) };
    }
    principalStage = 'KEY_MINT';
    const minted = await rest(sessions.W.token, '/v1/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'GENFEEDAI',
        label: 'MCP brand acceptance',
        scopes: ['brands:read', 'credits:read'],
        defaultBrandId: fixture.brands.A,
      }),
    });
    principalStage = `KEY_MINT_HTTP_${minted.status}`;
    requireMcpRuntime(
      minted.status === 201 || minted.status === 200,
      'REAL_KEY_MINT',
    );
    principalStage = 'KEY_SERIALIZER';
    const data = record(record(minted.body).data);
    const attributes = record(data.attributes ?? data);
    requireMcpRuntime(
      typeof attributes.key === 'string',
      'REAL_KEY_SERIALIZER',
    );
    key = attributes.key;
    principalStage = 'KEY_BINDING';
    const persisted = await prisma.apiKey.findFirstOrThrow({
      where: {
        userId: fixture.actors.W.id,
        organizationId: fixture.organizationId,
        label: 'MCP brand acceptance',
      },
    });
    requireMcpRuntime(
      persisted.key !== key &&
        persisted.keyFingerprint &&
        persisted.defaultBrandId === fixture.brands.A &&
        persisted.scopes.length === 2 &&
        !persisted.scopes.includes('admin'),
      'REAL_KEY_BINDING',
    );
    keyClient = await connect(key);
  });
  await caseRun('B02_MCP_ORDINARY_LIST', async () => {
    visible(await tool('U', 'get_brands'), ['A']);
    visible(await tool('V', 'get_brands'), ['B']);
  });
  await caseRun('B03_MCP_PRIVILEGED_LIST', async () => {
    for (const label of ['W', 'Z'] as const)
      visible(await tool(label, 'get_brands'), ['A', 'B']);
  });
  await caseRun('B04_KEY_CAP_AND_DIRECT_PARITY', async () => {
    visible(
      await requireKeyClient().client.callTool({
        name: 'get_brands',
        arguments: {},
      }),
      ['A'],
    );
    for (const token of [key, sessions.U.token]) {
      const result = await rest(token, '/v1/brands?limit=1&page=1');
      requireMcpRuntime(result.status === 200, 'REST_LIST');
      visible(result.body, ['A']);
      const metadata = record(result.body).meta;
      requireMcpRuntime(
        metadata && JSON.stringify(metadata).includes('1'),
        'REST_COUNT_METADATA',
      );
      const spoof = await rest(
        token,
        `/v1/brands?organizationId=${fixture.foreignOrganizationId}`,
        { headers: { 'X-Organization-Id': fixture.foreignOrganizationId } },
      );
      requireMcpRuntime(
        !JSON.stringify(spoof.body).includes(fixture.brands.X),
        'REST_FOREIGN_SCOPE',
      );
    }
  });
  await caseRun('B05_NONDISCLOSING_POINT_DENIAL', async () => {
    for (const name of ['get_brands', 'get_brand_context']) {
      let expected: unknown;
      for (const label of ['B', 'D', 'X', 'missing'] as const) {
        const args =
          name === 'get_brands'
            ? { brand: fixture.brands[label] }
            : {
                brandId: fixture.brands[label],
                includeSystemPrompt: false,
                query: 'authorization-negative-fixture',
              };
        const result = await denyTool('U', name, args);
        if (expected === undefined) expected = result;
        else
          requireMcpRuntime(
            JSON.stringify(result) === JSON.stringify(expected),
            'OPAQUE_POINT_SHAPE',
          );
      }
    }
  });
  await caseRun('B06_HEADER_CONTEXT_SPOOF', async () => {
    for (const current of [sessions.U, requireKeyClient()]) {
      current.headers['X-Organization-Id'] = fixture.foreignOrganizationId;
      const result = await current.client.callTool({
        name: 'get_brands',
        arguments: {
          organizationId: fixture.foreignOrganizationId,
          isApiKey: false,
          role: 'owner',
          context: {
            organizationId: fixture.foreignOrganizationId,
            userId: fixture.actors.W.id,
          },
        },
      });
      requireMcpRuntime(
        !JSON.stringify(result).includes(fixture.brands.X),
        'MCP_CLIENT_CLAIM',
      );
      delete current.headers['X-Organization-Id'];
      visible(
        await current.client.callTool({ name: 'get_brands', arguments: {} }),
        ['A'],
      );
    }
  });
  const cacheKey = `brand-ctx:${fixture.organizationId}:${fixture.brands.A}`;
  await caseRun('B07_WARM_CONTEXT_REVOKE', async () => {
    for (let n = 0; n < 2; n++)
      requireMcpRuntime(
        !denied(
          await tool('U', 'get_brand_context', {
            brandId: fixture.brands.A,
            includeSystemPrompt: false,
          }),
        ),
        'WARM_CONTEXT_READ',
      );
    requireMcpRuntime(
      (await redis.get(cacheKey)) !== null && (await redis.ttl(cacheKey)) > 0,
      'REAL_CACHE_POPULATED',
    );
    await prisma.member.update({
      where: { id: fixture.actors.U.memberId },
      data: { brands: { disconnect: { id: fixture.brands.A } } },
    });
    await denyTool('U', 'get_brand_context', {
      brandId: fixture.brands.A,
      includeSystemPrompt: false,
    });
    requireMcpRuntime(
      (await redis.get(cacheKey)) !== null && (await redis.ttl(cacheKey)) > 0,
      'CACHE_SURVIVES_REVOCATION',
    );
  });
  await caseRun('B08_EMPTY_ASSIGNMENTS', async () => {
    const list = await tool('U', 'get_brands');
    requireMcpRuntime(
      denied(list) || !JSON.stringify(list).includes(fixture.brands.A),
      'ZERO_ASSIGNMENT_LIST',
    );
    const row = await prisma.member.findUniqueOrThrow({
      where: { id: fixture.actors.U.memberId },
      select: { currentBrandId: true, brands: { select: { id: true } } },
    });
    requireMcpRuntime(
      row.currentBrandId === fixture.brands.A && row.brands.length === 0,
      'PREFERENCE_NOT_GRANT',
    );
    const direct = await rest(sessions.U.token, '/v1/brands');
    requireMcpRuntime(
      direct.status === 200 &&
        !JSON.stringify(direct.body).includes(fixture.brands.A),
      'REST_EMPTY_LIST',
    );
    const point = await rest(
      sessions.U.token,
      `/v1/brands/${fixture.brands.A}`,
    );
    requireMcpRuntime([403, 404].includes(point.status), 'REST_EMPTY_SELECTOR');
    await denyTool('U', 'get_brand_context', {
      brandId: fixture.brands.A,
      includeSystemPrompt: false,
    });
    visible(await tool('V', 'get_brands'), ['B']);
  });
  await caseRun('B09_MEMBERSHIP_REVOCATION', async () => {
    await prisma.member.update({
      where: { id: fixture.actors.U.memberId },
      data: { brands: { connect: { id: fixture.brands.A } } },
    });
    visible(await tool('U', 'get_brands'), ['A']);
    for (const data of [
      { isActive: false },
      { isActive: true, isDeleted: true },
    ]) {
      await prisma.member.update({
        where: { id: fixture.actors.U.memberId },
        data,
      });
      requireMcpRuntime(
        denied(await tool('U', 'get_brands')),
        'LIVE_MEMBERSHIP_REVOCATION',
      );
      visible(await tool('V', 'get_brands'), ['B']);
    }
    await prisma.member.update({
      where: { id: fixture.actors.U.memberId },
      data: { isActive: true, isDeleted: false },
    });
  });
  await caseRun('B10_ROLE_DOWNGRADE', async () => {
    requireMcpRuntime(
      !denied(await tool('W', 'get_brands', { brand: fixture.brands.B })),
      'OWNER_WARM_READ',
    );
    await prisma.member.update({
      where: { id: fixture.actors.W.memberId },
      data: { roleId: fixture.ordinaryRoleId, roleKey: 'owner' },
    });
    await denyTool('W', 'get_brands', { brand: fixture.brands.B });
    visible(await tool('W', 'get_brands'), ['A']);
    visible(
      await requireKeyClient().client.callTool({
        name: 'get_brands',
        arguments: {},
      }),
      ['A'],
    );
  });
  let negativeStateDigest = '';
  await caseRun('B11_PROVIDER_NOT_STARTED', async () => {
    const before = await mutationSnapshot();
    for (const label of ['B', 'D', 'X', 'missing'] as const)
      await denyTool('U', 'get_brand_context', {
        brandId: fixture.brands[label],
        includeSystemPrompt: false,
        query: 'authorization-negative-fixture',
      });
    const after = await mutationSnapshot();
    requireMcpRuntime(before === after, 'NEGATIVE_MUTATION_STARTED');
    negativeStateDigest = after;
    const network = readFileSync(
      process.env.MCP_AUTH_NETWORK_REPORT ?? '',
      'utf8',
    );
    requireMcpRuntime(network.length === 0, 'PROVIDER_SUBMISSION_ATTEMPTED');
  });
  const candidateSha = process.env.MCP_AUTH_CANDIDATE_SHA;
  const testedSha = process.env.MCP_AUTH_TESTED_SHA;
  const nonce = process.env.MCP_AUTH_RUNTIME_NONCE;
  requireMcpRuntime(
    /^[0-9a-f]{40}$/.test(candidateSha ?? '') &&
      /^[0-9a-f]{40}$/.test(testedSha ?? '') &&
      candidateSha === testedSha &&
      nonce,
    'SOURCE_IDENTITY',
  );
  const report = {
    version: 1,
    candidateSha,
    testedSha,
    nonce,
    cases,
    migrationInventoryDigest,
    negativeStateDigest,
    cacheObserved: true,
  };
  writeFileSync(
    resolve(process.env.MCP_AUTH_JOURNEY_REPORT ?? ''),
    JSON.stringify(report),
    { mode: 0o600 },
  );
  requireMcpRuntime(
    createHash('sha256').update(JSON.stringify(report)).digest('hex').length ===
      64,
    'JOURNEY_REPORT_DIGEST',
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error && /^B\d{2}_[A-Z_]+(?:_[1-5][0-9]{2}(?:_[A-Z_]+)?)?$/.test(error.message) ? error.message : 'JOURNEY_INFRASTRUCTURE'} failed\n`,
  );
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => client.close()));
  await redis.quit();
  await prisma.$disconnect();
}

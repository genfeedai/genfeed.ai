import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { tenantHit } from './core.mjs';
import { entity, requireSuccess, rows, sessionCookie } from './http.mjs';

export async function warmup(request) {
  requireSuccess(
    await request(null, 'GET', '/v1/health', { phase: 'warmup' }),
    'Warm-up health',
  );
  return requireSuccess(
    await request(null, 'GET', '/v1/openapi.json', { phase: 'warmup' }),
    'Warm-up OpenAPI',
  );
}

export function printFixtureFailure(
  error,
  records,
  apiLog,
  write = (text) => process.stdout.write(text),
) {
  const record =
    error.record ??
    records
      .filter((record) => ['fixture', 'warmup'].includes(record.phase))
      .at(-1);
  write(`Fixture failed: ${error}\n`);
  if (record)
    write(
      `Failing setup request: ${record.method} ${record.path} status=${record.status} duration=${record.durationMs}ms\n`,
    );
  if (!apiLog) return;
  try {
    const tail = readFileSync(apiLog, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .slice(-20);
    write(`Last 20 non-empty API log lines (${apiLog}):\n${tail.join('\n')}\n`);
  } catch (logError) {
    write(`Cannot read fixture API log: ${logError}\n`);
  }
}

export async function fixtureDatabase(
  label,
  run,
  { timeoutMs = 60_000, wait = delay } = {},
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(run),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Database setup timed out after ${timeoutMs} ms`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      // Only known connection failures are safe to retry. A local deadline
      // does not cancel a Prisma write, so it must fail rather than replay it.
      const isNetworkError = [
        'P1001',
        'P1002',
        'P1017',
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
      ].includes(error.code);
      if (isNetworkError && !tenantHit(String(error)) && attempt < 2) {
        clearTimeout(timer);
        await wait(1_000 * 2 ** attempt);
        continue;
      }
      const failure = new Error(`${label}: ${error}`);
      failure.record = {
        method: 'DB',
        path: label,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        phase: 'fixture',
      };
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fixtureResults(tasks) {
  const results = await Promise.allSettled(tasks);
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return results.map((result) => result.value);
}

export async function seedFixture(sendRequest, prisma) {
  const request = (actor, method, path, options = {}) =>
    sendRequest(actor, method, path, { ...options, phase: 'fixture' });
  async function signup(label) {
    const credentials = {
      email: `ci-cloud-${label.toLowerCase()}@example.invalid`,
      name: `CI Cloud ${label}`,
      password: 'ci-placeholder-password-for-ephemeral-test',
    };
    const response = await request(null, 'POST', '/v1/auth/sign-up/email', {
      body: credentials,
    });
    const signedUp = requireSuccess(response, `Sign up ${label}`);
    const userId = signedUp?.user?.id;
    if (!userId)
      throw Object.assign(
        new Error(`Sign up ${label}: missing canonical user id`),
        { record: response.record },
      );
    return { label, credentials, userId };
  }

  async function authenticate({ label, credentials, userId }) {
    // CLOUD keeps verification required. Sign-up returns a user but no session;
    // user.create.after awaits UserProvisioningListener before this response.
    // Only these ephemeral users are verified directly; no mailer runs in CI.
    // Elevate before sign-in/token resolution caches the platform role.
    await fixtureDatabase(`Verify/elevate ${label}`, () =>
      prisma.user.update({
        where: { id: userId },
        data: {
          emailVerified: true,
          ...(label === 'S' ? { platformRole: 'SUPERADMIN' } : {}),
        },
      }),
    );
    const signedIn = await request(null, 'POST', '/v1/auth/sign-in/email', {
      body: { email: credentials.email, password: credentials.password },
    });
    const session = requireSuccess(signedIn, `Sign in ${label}`);
    if (session?.user?.id !== userId)
      throw Object.assign(
        new Error(`Sign in ${label}: canonical user id mismatch`),
        { record: signedIn.record },
      );
    let cookie;
    try {
      cookie = sessionCookie(signedIn.headers);
    } catch (error) {
      error.record = signedIn.record;
      throw error;
    }
    const tokenResponse = await request(null, 'GET', '/v1/auth/token', {
      headers: { cookie },
    });
    const token = requireSuccess(tokenResponse, `JWT ${label}`)?.token;
    if (!token)
      throw Object.assign(new Error(`JWT ${label}: no token`), {
        record: tokenResponse.record,
      });
    return { label, token, userId };
  }

  async function workspace(actor) {
    const organizations = rows(
      requireSuccess(
        await request(actor, 'GET', '/v1/organizations?mine=true'),
        `Organizations ${actor.label}`,
      ),
    );
    const organization = organizations[0];
    if (!organization?.id)
      throw new Error(`No provisioned organization for ${actor.label}`);
    const brand = entity(
      requireSuccess(
        await request(
          actor,
          'GET',
          `/v1/brands?organizationId=${organization.id}`,
        ),
        `Brands ${actor.label}`,
      ),
      `Brand ${actor.label}`,
    );
    return {
      organizationId: organization.id,
      organizationSlug: organization.slug ?? organization.attributes?.slug,
      brandId: brand.id,
      userId: actor.userId,
    };
  }

  const authTasks = [];
  let authResults;
  try {
    // Serialize provisioning only. Verification/sign-in/token requests overlap
    // subsequent sign-ups, and all started work is drained before reporting.
    for (const label of ['A', 'B', 'M', 'M2', 'S']) {
      authTasks.push(authenticate(await signup(label)));
      authTasks.at(-1).catch(() => {});
    }
  } finally {
    authResults = await Promise.allSettled(authTasks);
  }
  const rejected = authResults.find((result) => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  const [userA, userB, member, member2, superadmin] = authResults.map(
    (result) => result.value,
  );
  const [orgA, orgB, orgS] = await fixtureResults([
    workspace(userA),
    workspace(userB),
    workspace(superadmin),
  ]);
  // This also proves that the IP-bound platform role survived middleware.
  requireSuccess(
    await request(superadmin, 'PATCH', '/v1/admin/platform-settings', {
      body: { flags: { agent: true } },
    }),
    'Configure CI platform settings',
  );
  orgS.personaId = entity(
    requireSuccess(
      await request(superadmin, 'POST', '/v1/personas', {
        body: {
          label: 'CI superadmin persona',
          handle: 'ci-superadmin-persona',
        },
      }),
      'Create S persona',
    ),
    'S persona',
  ).id;
  // Adding an existing user to an organization has no direct HTTP endpoint.
  // Reuse the provisioned admin role: M owns neither A nor B.
  const roles = rows(
    requireSuccess(
      await request(superadmin, 'GET', '/v1/roles'),
      'Role catalog',
    ),
  );
  const admin = roles.find(
    (row) => (row.attributes?.key ?? row.key) === 'admin',
  );
  const role = admin
    ? { ...admin.attributes, ...admin }
    : entity(
        requireSuccess(
          await request(superadmin, 'POST', '/v1/roles', {
            body: { key: 'admin', label: 'Admin' },
          }),
          'Create admin role',
        ),
        'Role',
      );
  await fixtureResults(
    [member, member2].map(async (actor) => {
      await fixtureResults(
        [orgA, orgB].map(async (organization) => {
          const membership = await fixtureDatabase(
            `Membership ${actor.label}/${organization.organizationId}`,
            () =>
              prisma.member.create({
                data: {
                  organizationId: organization.organizationId,
                  userId: actor.userId,
                  roleId: role.id,
                  roleKey: role.key,
                  currentBrandId: organization.brandId,
                  brands: { connect: { id: organization.brandId } },
                  isActive: true,
                  isDeleted: false,
                },
              }),
          );
          if (
            (actor === member && organization === orgA) ||
            (actor === member2 && organization === orgB)
          )
            organization.memberId = membership.id;
        }),
      );
      await fixtureDatabase(`Active organization ${actor.label}`, () =>
        prisma.user.update({
          where: { id: actor.userId },
          data: {
            lastUsedOrganizationId: (actor === member ? orgA : orgB)
              .organizationId,
          },
        }),
      );
    }),
  );
  const persona = entity(
    requireSuccess(
      await request(userA, 'POST', '/v1/personas', {
        body: { label: 'CI shared persona', handle: 'ci-shared-persona' },
      }),
      'Create persona',
    ),
    'Persona',
  );
  await activate(request, member, orgA);
  const grant = entity(
    requireSuccess(
      await request(member, 'POST', `/v1/personas/${persona.id}/grants`, {
        body: {
          recipientOrganizationId: orgB.organizationId,
          mode: 'ALL_BRANDS',
        },
      }),
      'Grant A to B',
    ),
    'Grant',
  );
  orgA.personaId = persona.id;
  orgB.personaId = persona.id;
  orgA.grantId = grant.id;
  orgB.grantId = grant.id;
  const available = rows(
    requireSuccess(
      await request(userB, 'GET', `/v1/personas?brandId=${orgB.brandId}`),
      'Read granted persona as B member',
    ),
  );
  if (!available.some((row) => row.id === persona.id))
    throw new Error('Granted persona is not available to Org B');

  return {
    userA,
    userB,
    member,
    member2,
    superadmin,
    orgA,
    orgB,
    orgS,
    personaId: persona.id,
    grantId: grant.id,
  };
}

export async function activate(request, actor, organization) {
  requireSuccess(
    await request(
      actor,
      'PATCH',
      `/v1/organizations/${organization.organizationId}/activate`,
    ),
    `Activate ${actor.label}`,
  );
}

export async function sweepOrganizationAndGrants(request, fixture) {
  const { member, superadmin, userA, userB, orgA, orgB, personaId, grantId } =
    fixture;
  for (const actor of [member, superadmin]) {
    await request(actor, 'GET', '/v1/organizations?mine=true');
    await request(actor, 'GET', '/v1/organizations');
    await request(actor, 'POST', '/v1/organizations', {
      body: { label: `CI extra ${actor.label}` },
    });
  }
  await activate(request, member, orgA);
  await activate(request, member, orgB);
  await activate(request, member, orgA);
  for (const actor of [userA, member]) {
    await request(actor, 'GET', '/v1/personas/grantable-organizations');
    await request(actor, 'GET', `/v1/personas/${personaId}/grants`);
  }
  // Read the grant as a member of its recipient, before the final revoke.
  await request(
    superadmin,
    'GET',
    `/v1/personas/${personaId}/grants?organizationId=${orgA.organizationId}`,
  );
  // Grant management is owner-only. The receiving member must see 404,
  // while their brand's persona collection must expose the granted identity.
  await request(userB, 'GET', `/v1/personas/${personaId}/grants`);
  await request(userB, 'GET', `/v1/personas?brandId=${orgB.brandId}`);
  await request(
    member,
    'DELETE',
    `/v1/personas/${personaId}/grants/${grantId}`,
  );
}

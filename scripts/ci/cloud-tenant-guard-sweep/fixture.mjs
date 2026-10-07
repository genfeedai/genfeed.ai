import { setTimeout as delay } from 'node:timers/promises';

import { createDeadline, tenantHit } from './core.mjs';
import {
  entity,
  hasSessionCookie,
  requireSuccess,
  rows,
  sessionCookie,
} from './http.mjs';
import {
  MAIL_LABELS,
  MAIL_REASONS,
  validateMailStats,
} from './local-mail-stub.mjs';

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
  _apiLog,
  write = (text) => process.stdout.write(text),
) {
  const record =
    error.record ??
    records
      .filter((record) => ['fixture', 'warmup'].includes(record.phase))
      .at(-1);
  write('Fixture failed: required setup proof unavailable\n');
  if (record)
    write(
      `Setup status=${record.status} duration=${record.durationMs ?? 0}ms\n`,
    );
}

export async function fixtureDatabase(
  label,
  run,
  { timeoutMs = 60_000, wait = delay, deadline } = {},
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    const attemptTimeout = Math.min(
      timeoutMs,
      deadline?.remaining() ?? Infinity,
    );
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(run),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Database setup timed out after ${attemptTimeout} ms`,
                ),
              ),
            attemptTimeout,
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
        await wait(1_000 * 2 ** attempt, undefined, {
          signal: deadline?.signal,
        });
        continue;
      }
      const failure = new Error('Fixture database operation failed');
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

export async function seedFixture(
  sendRequest,
  prisma,
  {
    deadline = createDeadline(240_000, { source: 'fixture/readiness' }),
    wait = delay,
    now = () => performance.now(),
    readMailStats,
  } = {},
) {
  if (typeof readMailStats !== 'function')
    throw new Error('Mail proof reader required');
  let mailStats = validateMailStats(await readMailStats());
  if (
    [
      ...Object.values(mailStats.accepted),
      ...Object.values(mailStats.rejected),
    ].some((value) => value !== 0)
  )
    throw new Error('Mail proof initial counters must be zero');
  async function beforeMail() {
    const before = validateMailStats(await readMailStats(), mailStats);
    if (
      MAIL_LABELS.some(
        (label) => before.accepted[label] !== mailStats.accepted[label],
      ) ||
      MAIL_REASONS.some(
        (reason) => before.rejected[reason] !== mailStats.rejected[reason],
      )
    )
      throw new Error('Mail proof changed outside an auth attempt');
    return before;
  }
  async function proveMail(label, before) {
    const after = validateMailStats(await readMailStats(), before);
    if (
      MAIL_LABELS.some(
        (actor) =>
          after.accepted[actor] !==
          before.accepted[actor] + (actor === label ? 1 : 0),
      ) ||
      MAIL_REASONS.some(
        (reason) => after.rejected[reason] !== before.rejected[reason],
      )
    )
      throw new Error(`Mail proof ${label}: exact acceptance delta required`);
    mailStats = after;
  }
  const request = (actor, method, path, options = {}) =>
    sendRequest(actor, method, path, {
      ...options,
      phase: 'fixture',
      abortSources: [...(options.abortSources ?? []), ...deadline.abortSources],
      signal: options.signal
        ? AbortSignal.any([options.signal, deadline.signal])
        : deadline.signal,
    });
  const database = (label, run) =>
    fixtureDatabase(label, run, {
      timeoutMs: Math.min(60_000, deadline.remaining()),
      wait,
      deadline,
    });
  async function signup(label) {
    const credentials = {
      email: `ci-cloud-${label.toLowerCase()}@example.invalid`,
      name: `CI Cloud ${label}`,
      password: 'ci-placeholder-password-for-ephemeral-test',
    };
    const before = await beforeMail();
    const response = await request(null, 'POST', '/v1/auth/sign-up/email', {
      body: credentials,
    });
    const signedUp = requireSuccess(response, `Sign up ${label}`);
    const userId = signedUp?.user?.id;
    if (typeof userId !== 'string' || !userId.trim())
      throw Object.assign(
        new Error(`Sign up ${label}: missing canonical user id`),
        { record: response.record },
      );
    if (signedUp.user.emailVerified !== false)
      throw Object.assign(
        new Error(
          `Sign up ${label}: fixture must remain unverified before explicit verification`,
        ),
        { record: response.record },
      );
    if (
      response.record.status !== 200 ||
      signedUp.token !== null ||
      hasSessionCookie(response.headers)
    )
      throw new Error(`Sign up ${label}: unverified session proof failed`);
    await proveMail(label, before);
    const blockedBefore = await beforeMail();
    const blocked = await request(null, 'POST', '/v1/auth/sign-in/email', {
      body: { email: credentials.email, password: credentials.password },
      allowSigninRetry: false,
    });
    if (
      blocked.record.status !== 403 ||
      blocked.record.hasTenantHit ||
      blocked.json?.token != null ||
      hasSessionCookie(blocked.headers)
    )
      throw new Error(
        `Unverified sign in ${label}: required denial proof failed`,
      );
    await proveMail(label, blockedBefore);
    return { label, credentials, userId };
  }

  async function authenticate({ label, credentials, userId }) {
    // CLOUD keeps verification required. Sign-up returns a user but no session;
    // user.create.after awaits UserProvisioningListener before this response.
    // Only these ephemeral users are verified directly after accepted mail proof.
    // Elevate before sign-in/token resolution caches the platform role.
    await database(`Verify/elevate ${label}`, () =>
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
    const readiness = createDeadline(Math.min(20_000, deadline.remaining()), {
      parentSignal: deadline.signal,
      parentAbortSources: deadline.abortSources,
      source: 'fixture/readiness',
      now,
    });
    while (true) {
      readiness.remaining();
      const organizations = rows(
        requireSuccess(
          await request(actor, 'GET', '/v1/organizations?mine=true', {
            signal: readiness.signal,
            abortSources: readiness.abortSources,
          }),
          `Organizations ${actor.label}`,
        ),
      );
      const organization = organizations.find((row) => row?.id);
      if (organization) {
        const brands = rows(
          requireSuccess(
            await request(
              actor,
              'GET',
              `/v1/brands?organizationId=${organization.id}`,
              { signal: readiness.signal },
            ),
            `Brands ${actor.label}`,
          ),
        );
        const brand = brands.find((row) => row?.id);
        if (brand)
          return {
            organizationId: organization.id,
            organizationSlug:
              organization.slug ?? organization.attributes?.slug,
            brandId: brand.id,
            userId: actor.userId,
          };
      }
      await wait(Math.min(2_000, readiness.remaining()), undefined, {
        signal: readiness.signal,
        abortSources: readiness.abortSources,
      });
    }
  }

  const actors = [];
  const organizations = [];
  for (const label of ['A', 'B', 'M', 'M2', 'S']) {
    deadline.remaining();
    const actor = await authenticate(await signup(label));
    organizations.push(await workspace(actor));
    actors.push(actor);
  }
  mailStats = validateMailStats(await readMailStats(), mailStats);
  if (
    MAIL_LABELS.some((label) => mailStats.accepted[label] !== 2) ||
    MAIL_REASONS.some((reason) => mailStats.rejected[reason] !== 0)
  )
    throw new Error('Final mail proof failed');
  const [userA, userB, member, member2, superadmin] = actors;
  const [orgA, orgB, , , orgS] = organizations;
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
          const membership = await database(
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
      await database(`Active organization ${actor.label}`, () =>
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
    proof: {
      verificationRequired: true,
      noUnverifiedSession: true,
      acceptedMail: true,
      verifiedAuthentication: true,
    },
    mailStats,
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

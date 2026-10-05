import { entity, requireSuccess, rows, sessionCookie } from './http.mjs';

export async function seedFixture(request, prisma) {
  async function signup(label, isSuperAdmin = false) {
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
    if (!userId) throw new Error(`Sign up ${label}: missing canonical user id`);
    // Must precede the first authenticated request: both identity and request
    // context cache the platform role. There is no HTTP elevation endpoint.
    if (isSuperAdmin)
      await prisma.user.update({
        where: { id: userId },
        data: { platformRole: 'SUPERADMIN' },
      });
    const token = requireSuccess(
      await request(null, 'GET', '/v1/auth/token', {
        headers: { cookie: sessionCookie(response.headers) },
      }),
      `JWT ${label}`,
    )?.token;
    if (!token) throw new Error(`JWT ${label}: no token`);
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

  const userA = await signup('A');
  const orgA = await workspace(userA);
  const userB = await signup('B');
  const orgB = await workspace(userB);
  const superadmin = await signup('S', true);
  const orgS = await workspace(superadmin);
  // This also proves that the IP-bound platform role survived middleware.
  requireSuccess(
    await request(superadmin, 'PATCH', '/v1/admin/platform-settings', {
      body: { isEmailVerificationRequired: false, flags: { agent: true } },
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
  const member = await signup('M');
  const member2 = await signup('M2');
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
  for (const actor of [member, member2]) {
    for (const organization of [orgA, orgB]) {
      const membership = await prisma.member.create({
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
      });
      if (
        (actor === member && organization === orgA) ||
        (actor === member2 && organization === orgB)
      )
        organization.memberId = membership.id;
    }
    await prisma.user.update({
      where: { id: actor.userId },
      data: {
        lastUsedOrganizationId: (actor === member ? orgA : orgB).organizationId,
      },
    });
  }
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

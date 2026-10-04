import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

const OWNER_ORG = 'org-owner';
const RECIPIENT_ORG = 'org-recipient';
const persona = {
  availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
  availableBrandIds: [] as string[],
  brandId: 'brand-a',
  handle: 'anna',
  id: 'persona-1',
};

function setup() {
  const queryRaw = vi.fn().mockResolvedValue([]);
  const tx = {
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-a' }) },
    persona: { findFirst: vi.fn().mockResolvedValue(persona) },
    personaGrant: {
      create: vi.fn().mockResolvedValue({ id: 'grant-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'grant-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    personaGrantAudit: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) =>
      work({ ...tx, $queryRaw: queryRaw }),
    ),
    brand: { findMany: vi.fn().mockResolvedValue([{ id: 'recipient-brand' }]) },
    member: { findMany: vi.fn().mockResolvedValue([]) },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: RECIPIENT_ORG }),
    },
    persona: { findFirst: vi.fn().mockResolvedValue(persona) },
    personaGrant: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  const roles = new Map<string, boolean>([
    [OWNER_ORG, true],
    [RECIPIENT_ORG, true],
  ]);
  const personas = {
    assertNoHandleCollision: vi.fn().mockResolvedValue(undefined),
    isOrganizationOwnerOrAdmin: vi.fn(
      async (params: { organizationId: string }) =>
        roles.get(params.organizationId) ?? false,
    ),
    withHandleLock: vi.fn(
      async (_org: string, work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
    ),
  };
  const service = new PersonaGrantsService(prisma as never, personas as never);
  return { personas, prisma, queryRaw, roles, service, tx };
}

const base = {
  actorUserId: 'actor-1',
  brandId: 'brand-a',
  mode: PersonaAvailabilityMode.ALL_BRANDS as
    | PersonaAvailabilityMode.ALL_BRANDS
    | PersonaAvailabilityMode.SELECTED_BRANDS,
  organizationId: OWNER_ORG,
  personaId: 'persona-1',
  recipientOrganizationId: RECIPIENT_ORG,
};

describe('PersonaGrantsService (#6037)', () => {
  describe('grant', () => {
    it('is not found when the owning brand deletion won the lock', async () => {
      const { service, tx } = setup();
      tx.brand.findFirst.mockResolvedValue(null);

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.personaGrant.create).not.toHaveBeenCalled();
    });

    it('creates one active grant and audits it under the recipient handle lock', async () => {
      const { personas, queryRaw, service, tx } = setup();

      await expect(service.grant(base)).resolves.toEqual({ id: 'grant-1' });

      // Owner and recipient org locks, in sorted org-id order.
      expect(queryRaw.mock.calls.map((call) => call[1])).toEqual(
        [OWNER_ORG, RECIPIENT_ORG].sort().map((org) => `persona-handle:${org}`),
      );
      expect(personas.assertNoHandleCollision).toHaveBeenCalledWith(
        expect.objectContaining({
          excludePersonaId: 'persona-1',
          handle: 'anna',
          organizationId: RECIPIENT_ORG,
          owningBrandId: null,
        }),
      );
      expect(tx.personaGrant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          grantedByUserId: 'actor-1',
          ownerOrganizationId: OWNER_ORG,
          personaId: 'persona-1',
          recipientOrganizationId: RECIPIENT_ORG,
        }),
      });
      expect(tx.personaGrantAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'granted',
          actorUserId: 'actor-1',
          newMode: PersonaAvailabilityMode.ALL_BRANDS,
          previousMode: null,
        }),
      });
    });

    it('updates the existing active grant instead of creating a second', async () => {
      const { service, tx } = setup();
      tx.personaGrant.findFirst.mockResolvedValue({
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        availableBrandIds: [],
        id: 'grant-1',
      });

      await service.grant({
        ...base,
        brandIds: ['recipient-brand'],
        mode: PersonaAvailabilityMode.SELECTED_BRANDS,
      });

      expect(tx.personaGrant.create).not.toHaveBeenCalled();
      expect(tx.personaGrant.update).toHaveBeenCalledWith({
        data: {
          availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          availableBrandIds: ['recipient-brand'],
        },
        where: { id: 'grant-1' },
      });
      expect(tx.personaGrantAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'updated',
          previousMode: PersonaAvailabilityMode.ALL_BRANDS,
        }),
      });
    });

    it('refuses a member of either organization who is not owner or admin', async () => {
      for (const weak of [OWNER_ORG, RECIPIENT_ORG]) {
        const { roles, service, tx } = setup();
        roles.set(weak, false);

        await expect(service.grant(base)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(tx.personaGrant.create).not.toHaveBeenCalled();
      }
    });

    it('checks the role with the API key scopes of the acting key', async () => {
      const { personas, service } = setup();
      const apiKeyContext = { isApiKey: true, scopes: ['read'] };

      await service.grant({ ...base, apiKeyContext });

      expect(personas.isOrganizationOwnerOrAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyContext, organizationId: OWNER_ORG }),
      );
      expect(personas.isOrganizationOwnerOrAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyContext,
          organizationId: RECIPIENT_ORG,
        }),
      );
    });

    it('refuses an organization the actor does not administer or a self grant', async () => {
      const { roles, service } = setup();
      roles.delete(RECIPIENT_ORG);

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.grant({ ...base, recipientOrganizationId: OWNER_ORG }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('only grants a character of the acting organization, never one it merely received', async () => {
      const { prisma, service } = setup();
      prisma.persona.findFirst.mockResolvedValue(null);

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.persona.findFirst).toHaveBeenCalledWith({
        where: { id: 'persona-1', isDeleted: false, organizationId: OWNER_ORG },
      });
    });

    it('is not found for a character the active brand cannot use', async () => {
      const { prisma, service } = setup();
      prisma.persona.findFirst.mockResolvedValue({
        ...persona,
        brandId: 'brand-z',
      });

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a handle collision before writing', async () => {
      const { personas, service, tx } = setup();
      personas.assertNoHandleCollision.mockRejectedValue(
        new ValidationException('A character with the handle @anna exists'),
      );

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(tx.personaGrant.create).not.toHaveBeenCalled();
    });

    it('requires selected brands to belong to the receiving organization', async () => {
      const { prisma, service } = setup();
      prisma.brand.findMany.mockResolvedValue([]);

      await expect(
        service.grant({
          ...base,
          brandIds: ['foreign-brand'],
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
        }),
      ).rejects.toBeInstanceOf(ValidationException);
      await expect(
        service.grant({
          ...base,
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('is not found for a deleted or unknown receiving organization', async () => {
      const { prisma, service } = setup();
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(service.grant(base)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('revoke', () => {
    const revokeParams = {
      actorUserId: 'actor-1',
      brandId: 'brand-a',
      grantId: 'grant-1',
      organizationId: OWNER_ORG,
      personaId: 'persona-1',
    };

    it('revokes with immediate effect and audits the previous state', async () => {
      const { prisma, service, tx } = setup();
      prisma.personaGrant.findFirst.mockResolvedValue({
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        availableBrandIds: [],
        id: 'grant-1',
        recipientOrganizationId: RECIPIENT_ORG,
      });

      await service.revoke(revokeParams);

      expect(tx.personaGrant.updateMany).toHaveBeenCalledWith({
        data: {
          revokedAt: expect.any(Date),
          revokedByUserId: 'actor-1',
        },
        where: {
          id: 'grant-1',
          ownerOrganizationId: OWNER_ORG,
          revokedAt: null,
        },
      });
      expect(tx.personaGrantAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'revoked',
          newMode: null,
          previousMode: PersonaAvailabilityMode.ALL_BRANDS,
        }),
      });
    });

    it('refuses a non-admin of the owning organization and an unknown grant', async () => {
      const { prisma, roles, service } = setup();
      roles.set(OWNER_ORG, false);
      await expect(service.revoke(revokeParams)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      roles.set(OWNER_ORG, true);
      prisma.personaGrant.findFirst.mockResolvedValue(null);
      await expect(service.revoke(revokeParams)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listGrantableOrganizations', () => {
    it('lists only other organizations the actor owns or administers, with their brands', async () => {
      const { prisma, service } = setup();
      prisma.member.findMany.mockResolvedValue([
        {
          organization: { id: 'org-2', label: 'Show' },
          organizationId: 'org-2',
          role: { key: 'admin' },
        },
        {
          organization: { id: 'org-3', label: 'Other' },
          organizationId: 'org-3',
          role: { key: 'creator' },
        },
      ]);
      prisma.brand.findMany.mockResolvedValue([
        { id: 'b1', label: 'Podcast', organizationId: 'org-2' },
      ]);

      await expect(
        service.listGrantableOrganizations({
          organizationId: OWNER_ORG,
          userId: 'actor-1',
        }),
      ).resolves.toEqual([
        {
          brands: [{ id: 'b1', label: 'Podcast' }],
          id: 'org-2',
          label: 'Show',
        },
      ]);
      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: { not: OWNER_ORG },
            userId: 'actor-1',
          }),
        }),
      );
    });

    it('caps the role of an API key by its scopes', async () => {
      const { prisma, service } = setup();
      prisma.member.findMany.mockResolvedValue([
        {
          organization: { id: 'org-2', label: 'Show' },
          organizationId: 'org-2',
          role: { key: 'owner' },
        },
      ]);

      await expect(
        service.listGrantableOrganizations({
          apiKeyContext: { isApiKey: true, scopes: ['read'] },
          organizationId: OWNER_ORG,
          userId: 'actor-1',
        }),
      ).resolves.toEqual([]);
    });
  });
});

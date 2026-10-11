import { revokePersonaGrantsForRelocation } from '@api/collections/personas/utils/persona-grant-revocation.util';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function client(overrides: {
  grants?: unknown[];
  personas?: unknown[];
  revoked?: number;
}) {
  return {
    persona: {
      findMany: vi.fn().mockResolvedValue(overrides.personas ?? []),
    },
    personaGrant: {
      findMany: vi.fn().mockResolvedValue(overrides.grants ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: overrides.revoked ?? 0 }),
    },
    personaGrantAudit: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

const params = {
  actorUserId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-source',
};

describe('revokePersonaGrantsForRelocation', () => {
  it('does nothing when the brand owns no character', async () => {
    const tx = client({});

    await expect(
      revokePersonaGrantsForRelocation(
        tx as unknown as Prisma.TransactionClient,
        params,
      ),
    ).resolves.toBe(0);
    expect(tx.persona.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { brandId: 'brand-1', organizationId: 'org-source' },
    });
    expect(tx.personaGrant.findMany).not.toHaveBeenCalled();
  });

  it('revokes only active grants the source organization issued on the brand characters', async () => {
    const tx = client({
      grants: [
        {
          availabilityMode: 'SELECTED_BRANDS',
          availableBrandIds: ['recipient-brand'],
          id: 'grant-1',
          personaId: 'persona-1',
          recipientOrganizationId: 'org-recipient',
        },
      ],
      personas: [{ id: 'persona-1' }, { id: 'persona-2' }],
      revoked: 1,
    });

    await expect(
      revokePersonaGrantsForRelocation(
        tx as unknown as Prisma.TransactionClient,
        params,
      ),
    ).resolves.toBe(1);

    expect(tx.personaGrant.findMany).toHaveBeenCalledWith({
      where: {
        ownerOrganizationId: 'org-source',
        personaId: { in: ['persona-1', 'persona-2'] },
        revokedAt: null,
      },
    });
    expect(tx.personaGrant.updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date), revokedByUserId: 'user-1' },
      where: {
        id: { in: ['grant-1'] },
        ownerOrganizationId: 'org-source',
        revokedAt: null,
      },
    });
  });

  it('writes the same revoked audit row as a manual revoke, with what was revoked', async () => {
    const tx = client({
      grants: [
        {
          availabilityMode: 'SELECTED_BRANDS',
          availableBrandIds: ['recipient-brand'],
          id: 'grant-1',
          personaId: 'persona-1',
          recipientOrganizationId: 'org-recipient',
        },
      ],
      personas: [{ id: 'persona-1' }],
      revoked: 1,
    });

    await revokePersonaGrantsForRelocation(
      tx as unknown as Prisma.TransactionClient,
      params,
    );

    expect(tx.personaGrantAudit.createMany).toHaveBeenCalledWith({
      data: [
        {
          action: 'revoked',
          actorUserId: 'user-1',
          grantId: 'grant-1',
          newBrandIds: [],
          newMode: null,
          ownerOrganizationId: 'org-source',
          personaId: 'persona-1',
          previousBrandIds: ['recipient-brand'],
          previousMode: 'SELECTED_BRANDS',
          recipientOrganizationId: 'org-recipient',
        },
      ],
    });
  });

  it('attributes a move by an operator without a user id to the relocation itself', async () => {
    const tx = client({
      grants: [
        {
          availabilityMode: 'ALL_BRANDS',
          availableBrandIds: [],
          id: 'grant-1',
          personaId: 'persona-1',
          recipientOrganizationId: 'org-recipient',
        },
      ],
      personas: [{ id: 'persona-1' }],
      revoked: 1,
    });

    await revokePersonaGrantsForRelocation(
      tx as unknown as Prisma.TransactionClient,
      { ...params, actorUserId: '' },
    );

    expect(tx.personaGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { revokedAt: expect.any(Date), revokedByUserId: null },
      }),
    );
    expect(tx.personaGrantAudit.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ actorUserId: 'system:brand-relocation' }),
      ],
    });
  });

  it('leaves the audit alone when every grant was already revoked', async () => {
    const tx = client({ personas: [{ id: 'persona-1' }] });

    await expect(
      revokePersonaGrantsForRelocation(
        tx as unknown as Prisma.TransactionClient,
        params,
      ),
    ).resolves.toBe(0);
    expect(tx.personaGrant.updateMany).not.toHaveBeenCalled();
    expect(tx.personaGrantAudit.createMany).not.toHaveBeenCalled();
  });
});

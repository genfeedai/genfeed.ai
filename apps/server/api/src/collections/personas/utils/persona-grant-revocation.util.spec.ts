import {
  RELOCATION_SYSTEM_ACTOR,
  revokePersonaGrantsForRelocation,
} from '@api/collections/personas/utils/persona-grant-revocation.util';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it } from 'vitest';

interface PersonaRow {
  brandId: string;
  id: string;
  organizationId: string;
}

interface GrantRow {
  availabilityMode: string;
  availableBrandIds: string[];
  id: string;
  ownerOrganizationId: string;
  personaId: string;
  recipientOrganizationId: string;
  revokedAt: Date | null;
  revokedByUserId?: string | null;
}

type Where = Record<string, unknown>;

const matches = (row: object, where: Where) =>
  Object.entries(where).every(([key, expected]) => {
    const actual = (row as Record<string, unknown>)[key];
    if (expected && typeof expected === 'object' && 'in' in expected) {
      return (expected as { in: unknown[] }).in.includes(actual);
    }
    return actual === expected;
  });

const params = {
  actorUserId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-source',
};

describe('revokePersonaGrantsForRelocation', () => {
  let personas: PersonaRow[];
  let grants: GrantRow[];
  let audit: Array<Record<string, unknown>>;
  let tx: Prisma.TransactionClient;

  const grant = (id: string, overrides: Partial<GrantRow> = {}): GrantRow => ({
    availabilityMode: 'SELECTED_BRANDS',
    availableBrandIds: ['recipient-brand'],
    id,
    ownerOrganizationId: 'org-source',
    personaId: 'persona-1',
    recipientOrganizationId: 'org-recipient',
    revokedAt: null,
    ...overrides,
  });

  const revokedIds = () =>
    grants.filter((row) => row.revokedAt !== null).map(({ id }) => id);

  beforeEach(() => {
    personas = [
      { brandId: 'brand-1', id: 'persona-1', organizationId: 'org-source' },
      { brandId: 'brand-1', id: 'persona-2', organizationId: 'org-source' },
      {
        brandId: 'brand-2',
        id: 'persona-other-brand',
        organizationId: 'org-source',
      },
    ];
    grants = [];
    audit = [];

    tx = {
      persona: {
        findMany: async ({ where }: { where: Where }) =>
          personas
            .filter((row) => matches(row, where))
            .map(({ id }) => ({ id })),
      },
      personaGrant: {
        findMany: async ({ where }: { where: Where }) =>
          grants
            .filter((row) => matches(row, where))
            .map((row) => ({ ...row })),
        updateMany: async ({
          data,
          where,
        }: {
          data: Partial<GrantRow>;
          where: Where;
        }) => {
          const targets = grants.filter((row) => matches(row, where));
          for (const row of targets) {
            Object.assign(row, data);
          }
          return { count: targets.length };
        },
      },
      personaGrantAudit: {
        createMany: async ({
          data,
        }: {
          data: Array<Record<string, unknown>>;
        }) => {
          audit.push(...data);
          return { count: data.length };
        },
      },
    } as unknown as Prisma.TransactionClient;
  });

  it('does nothing when the brand owns no character', async () => {
    personas = [];
    grants = [grant('grant-1')];

    await expect(revokePersonaGrantsForRelocation(tx, params)).resolves.toBe(0);
    expect(revokedIds()).toEqual([]);
    expect(audit).toEqual([]);
  });

  it('revokes only active grants the source organization issued on the brand characters', async () => {
    const earlier = new Date('2026-10-01T00:00:00.000Z');
    grants = [
      grant('grant-1'),
      grant('grant-2', { personaId: 'persona-2' }),
      grant('other-brand', { personaId: 'persona-other-brand' }),
      grant('other-owner', { ownerOrganizationId: 'org-recipient' }),
      grant('already-revoked', { revokedAt: earlier }),
    ];

    await expect(revokePersonaGrantsForRelocation(tx, params)).resolves.toBe(2);

    expect(revokedIds()).toEqual(['grant-1', 'grant-2', 'already-revoked']);
    expect(grants.find(({ id }) => id === 'already-revoked')?.revokedAt).toBe(
      earlier,
    );
    expect(grants.find(({ id }) => id === 'grant-1')?.revokedByUserId).toBe(
      'user-1',
    );
  });

  it('writes the same revoked audit row as a manual revoke, with what was revoked', async () => {
    grants = [grant('grant-1')];

    await revokePersonaGrantsForRelocation(tx, params);

    expect(audit).toEqual([
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
    ]);
  });

  it('attributes a move by an operator without a user id to the relocation itself', async () => {
    grants = [
      grant('grant-1', {
        availabilityMode: 'ALL_BRANDS',
        availableBrandIds: [],
      }),
    ];

    await revokePersonaGrantsForRelocation(tx, { ...params, actorUserId: '' });

    expect(grants[0]?.revokedByUserId).toBeNull();
    expect(audit).toEqual([
      expect.objectContaining({ actorUserId: RELOCATION_SYSTEM_ACTOR }),
    ]);
  });

  it('leaves the audit alone when every grant was already revoked', async () => {
    grants = [
      grant('grant-1', { revokedAt: new Date('2026-10-01T00:00:00.000Z') }),
    ];

    await expect(revokePersonaGrantsForRelocation(tx, params)).resolves.toBe(0);
    expect(audit).toEqual([]);
  });
});

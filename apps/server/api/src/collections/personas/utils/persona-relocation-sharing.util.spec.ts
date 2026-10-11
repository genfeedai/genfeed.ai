import {
  findSharedBrandPersonas,
  resetPersonaSharingForRelocation,
} from '@api/collections/personas/utils/persona-relocation-sharing.util';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const scope = { brandId: 'brand-1', organizationId: 'org-source' };

const allBrands = {
  availabilityMode: 'ALL_BRANDS',
  availableBrandIds: [],
  handle: 'mira',
  id: 'persona-all',
  label: 'Mira',
};
const listed = {
  availabilityMode: 'SELECTED_BRANDS',
  availableBrandIds: ['brand-2', 'brand-3'],
  handle: null,
  id: 'persona-list',
  label: 'Kai',
};
const staleList = {
  availabilityMode: 'OWNING_BRAND',
  availableBrandIds: ['brand-2'],
  handle: null,
  id: 'persona-stale',
  label: 'Leftover',
};

function client(rows: unknown[]) {
  return {
    persona: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: rows.length }),
    },
    personaAvailabilityAudit: {
      createMany: vi.fn().mockResolvedValue({ count: rows.length }),
    },
  };
}

const asTx = (tx: ReturnType<typeof client>) =>
  tx as unknown as Prisma.TransactionClient;

describe('findSharedBrandPersonas', () => {
  it('reads only live characters of the brand shared beyond it', async () => {
    const tx = client([allBrands, listed]);

    const result = await findSharedBrandPersonas(asTx(tx), scope);

    expect(tx.persona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          OR: [
            { availabilityMode: { not: 'OWNING_BRAND' } },
            { availableBrandIds: { isEmpty: false } },
          ],
          organizationId: 'org-source',
        },
      }),
    );
    expect(result).toEqual([
      {
        availabilityMode: 'ALL_BRANDS',
        availableBrandCount: 0,
        handle: 'mira',
        id: 'persona-all',
        label: 'Mira',
      },
      {
        availabilityMode: 'SELECTED_BRANDS',
        availableBrandCount: 2,
        handle: null,
        id: 'persona-list',
        label: 'Kai',
      },
    ]);
  });
});

describe('resetPersonaSharingForRelocation', () => {
  it('writes nothing when no character is shared beyond the brand', async () => {
    const tx = client([]);

    await expect(
      resetPersonaSharingForRelocation(asTx(tx), {
        ...scope,
        actorUserId: 'user-1',
      }),
    ).resolves.toEqual([]);
    expect(tx.persona.updateMany).not.toHaveBeenCalled();
    expect(tx.personaAvailabilityAudit.createMany).not.toHaveBeenCalled();
  });

  it('resets an all-brands character and a listed one to the owning brand with the list cleared', async () => {
    const tx = client([allBrands, listed]);

    const reset = await resetPersonaSharingForRelocation(asTx(tx), {
      ...scope,
      actorUserId: 'user-1',
    });

    expect(reset.map(({ id }) => id)).toEqual(['persona-all', 'persona-list']);
    expect(tx.persona.updateMany).toHaveBeenCalledOnce();
    expect(tx.persona.updateMany).toHaveBeenCalledWith({
      data: { availabilityMode: 'OWNING_BRAND', availableBrandIds: [] },
      where: {
        brandId: 'brand-1',
        id: { in: ['persona-all', 'persona-list'] },
        isDeleted: false,
        organizationId: 'org-source',
      },
    });
  });

  it('also clears a leftover brand list on an owning-brand character', async () => {
    const tx = client([staleList]);

    await resetPersonaSharingForRelocation(asTx(tx), {
      ...scope,
      actorUserId: 'user-1',
    });

    expect(tx.persona.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { availabilityMode: 'OWNING_BRAND', availableBrandIds: [] },
      }),
    );
    expect(tx.personaAvailabilityAudit.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          previousBrandIds: ['brand-2'],
          previousMode: 'OWNING_BRAND',
        }),
      ],
    });
  });

  it('audits the previous sharing of each character under the source organization', async () => {
    const tx = client([allBrands, listed]);

    await resetPersonaSharingForRelocation(asTx(tx), {
      ...scope,
      actorUserId: 'user-1',
    });

    expect(tx.personaAvailabilityAudit.createMany).toHaveBeenCalledWith({
      data: [
        {
          actorUserId: 'user-1',
          newBrandIds: [],
          newMode: 'OWNING_BRAND',
          organizationId: 'org-source',
          personaId: 'persona-all',
          previousBrandIds: [],
          previousMode: 'ALL_BRANDS',
        },
        {
          actorUserId: 'user-1',
          newBrandIds: [],
          newMode: 'OWNING_BRAND',
          organizationId: 'org-source',
          personaId: 'persona-list',
          previousBrandIds: ['brand-2', 'brand-3'],
          previousMode: 'SELECTED_BRANDS',
        },
      ],
    });
  });

  it('records the system actor when the move has no user id', async () => {
    const tx = client([allBrands]);

    await resetPersonaSharingForRelocation(asTx(tx), {
      ...scope,
      actorUserId: null,
    });

    expect(tx.personaAvailabilityAudit.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ actorUserId: 'system:brand-relocation' }),
      ],
    });
  });
});

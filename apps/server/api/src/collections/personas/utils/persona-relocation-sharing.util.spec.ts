import {
  findSharedBrandPersonas,
  resetPersonaSharingForRelocation,
} from '@api/collections/personas/utils/persona-relocation-sharing.util';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const scope = { brandId: 'brand-1', organizationId: 'org-source' };

// A small Prisma `where` interpreter for the persona filters in use.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') {
      return (expected as Where[]).some((part) => matches(row, part));
    }
    const value = row[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const filter = expected as {
        in?: unknown[];
        isEmpty?: boolean;
        not?: unknown;
      };
      if ('in' in filter) return filter.in?.includes(value) ?? false;
      if ('not' in filter) return value !== filter.not;
      return ((value as unknown[]).length === 0) === filter.isEmpty;
    }
    return value === expected;
  });
}

const persona = (row: Row): Row => ({
  brandId: 'brand-1',
  handle: null,
  isDeleted: false,
  organizationId: 'org-source',
  ...row,
});

const allBrands = persona({
  availabilityMode: 'ALL_BRANDS',
  availableBrandIds: [],
  handle: 'mira',
  id: 'persona-all',
  label: 'Mira',
});
const listed = persona({
  availabilityMode: 'SELECTED_BRANDS',
  availableBrandIds: ['brand-2', 'brand-3'],
  id: 'persona-list',
  label: 'Kai',
});
const staleList = persona({
  availabilityMode: 'OWNING_BRAND',
  availableBrandIds: ['brand-2'],
  id: 'persona-stale',
  label: 'Leftover',
});
// Rows the relocation must never touch.
const bystanders = [
  persona({
    availabilityMode: 'OWNING_BRAND',
    availableBrandIds: [],
    id: 'persona-private',
    label: 'Private',
  }),
  persona({
    availabilityMode: 'ALL_BRANDS',
    availableBrandIds: [],
    id: 'persona-deleted',
    isDeleted: true,
    label: 'Deleted',
  }),
  persona({
    availabilityMode: 'ALL_BRANDS',
    availableBrandIds: [],
    brandId: 'brand-9',
    id: 'persona-other-brand',
    label: 'Other brand',
  }),
  persona({
    availabilityMode: 'ALL_BRANDS',
    availableBrandIds: [],
    id: 'persona-other-org',
    label: 'Other org',
    organizationId: 'org-other',
  }),
];

describe('persona relocation sharing', () => {
  let audits: Record<string, unknown>[];
  let personas: Map<string, Row>;

  const seed = (...rows: Row[]) => {
    personas = new Map(
      [...bystanders, ...rows].map((row) => [row.id, structuredClone(row)]),
    );
  };
  const tx = () =>
    ({
      persona: {
        findMany: async ({ where }: { where: Where }) =>
          [...personas.values()].filter((row) => matches(row, where)),
        updateMany: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Where;
        }) => {
          const hits = [...personas.values()].filter((row) =>
            matches(row, where),
          );
          for (const row of hits) Object.assign(row, data);
          return { count: hits.length };
        },
      },
      personaAvailabilityAudit: {
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          audits.push(...data);
          return { count: data.length };
        },
      },
    }) as unknown as Prisma.TransactionClient;
  const sharing = (id: string) => {
    const row = personas.get(id) as Row;
    return [row.availabilityMode, row.availableBrandIds];
  };

  beforeEach(() => {
    audits = [];
    seed();
  });

  describe('findSharedBrandPersonas', () => {
    it('reads only live characters of the brand shared beyond it', async () => {
      seed(allBrands, listed);

      await expect(findSharedBrandPersonas(tx(), scope)).resolves.toEqual([
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
      await expect(
        resetPersonaSharingForRelocation(tx(), {
          ...scope,
          actorUserId: 'user-1',
        }),
      ).resolves.toEqual([]);
      expect(audits).toEqual([]);
      expect(sharing('persona-other-brand')).toEqual(['ALL_BRANDS', []]);
    });

    it('resets an all-brands character and a listed one to the owning brand with the list cleared', async () => {
      seed(allBrands, listed);

      const reset = await resetPersonaSharingForRelocation(tx(), {
        ...scope,
        actorUserId: 'user-1',
      });

      expect(reset.map(({ id }) => id)).toEqual([
        'persona-all',
        'persona-list',
      ]);
      expect(sharing('persona-all')).toEqual(['OWNING_BRAND', []]);
      expect(sharing('persona-list')).toEqual(['OWNING_BRAND', []]);
      expect(sharing('persona-deleted')).toEqual(['ALL_BRANDS', []]);
      expect(sharing('persona-other-brand')).toEqual(['ALL_BRANDS', []]);
      expect(sharing('persona-other-org')).toEqual(['ALL_BRANDS', []]);
    });

    it('also clears a leftover brand list on an owning-brand character', async () => {
      seed(staleList);

      await resetPersonaSharingForRelocation(tx(), {
        ...scope,
        actorUserId: 'user-1',
      });

      expect(sharing('persona-stale')).toEqual(['OWNING_BRAND', []]);
      expect(audits).toEqual([
        expect.objectContaining({
          personaId: 'persona-stale',
          previousBrandIds: ['brand-2'],
          previousMode: 'OWNING_BRAND',
        }),
      ]);
    });

    it('audits the previous sharing of each character under the source organization', async () => {
      seed(allBrands, listed);

      await resetPersonaSharingForRelocation(tx(), {
        ...scope,
        actorUserId: 'user-1',
      });

      expect(audits).toEqual([
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
      ]);
    });

    it('records the system actor when the move has no user id', async () => {
      seed(allBrands);

      await resetPersonaSharingForRelocation(tx(), {
        ...scope,
        actorUserId: null,
      });

      expect(audits).toEqual([
        expect.objectContaining({ actorUserId: 'system:brand-relocation' }),
      ]);
    });
  });
});

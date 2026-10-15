import { PersonaReferencesService } from '@api/collections/personas/services/persona-references.service';
import { orderedReferenceIdsFromRow } from '@api/collections/personas/utils/persona-references.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { MAX_CHARACTER_REFERENCES } from '@genfeedai/contracts/constants';

const ORG = 'org-1';
const BRAND = 'brand-a';
const PERSONA = 'persona-1';

interface StoredRow {
  ingredientId: string;
  position: number;
}

interface FakeState {
  availabilityMode: PersonaAvailabilityMode;
  avatarIngredientId: string | null;
  deleted: Set<string>;
  references: StoredRow[];
  validImages: Set<string>;
}

function setup(
  initial: {
    availabilityMode?: PersonaAvailabilityMode;
    avatarIngredientId?: string | null;
    deleted?: string[];
    references?: StoredRow[];
    validImages?: string[];
  } = {},
) {
  const state: FakeState = {
    availabilityMode:
      initial.availabilityMode ?? PersonaAvailabilityMode.OWNING_BRAND,
    avatarIngredientId: initial.avatarIngredientId ?? null,
    deleted: new Set(initial.deleted ?? []),
    references: (initial.references ?? []).map((row) => ({ ...row })),
    validImages: new Set(initial.validImages ?? []),
  };
  const personaRow = () => ({
    availabilityMode: state.availabilityMode,
    availableBrandIds: [] as string[],
    avatarIngredientId: state.avatarIngredientId,
    brandId: BRAND,
    handle: 'anna' as string | null,
    id: PERSONA,
    label: 'Anna',
    references: [...state.references]
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        ...row,
        ingredient: { isDeleted: state.deleted.has(row.ingredientId) },
      })),
  });
  const client = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    ingredient: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in
          .filter((id) => state.validImages.has(id))
          .map((id) => ({ id })),
      ),
    },
    persona: {
      findFirst: vi.fn(async () => personaRow()),
      findMany: vi.fn(async () => [personaRow()]),
      update: vi.fn(
        async (args: { data: { avatarIngredientId: string | null } }) => {
          state.avatarIngredientId = args.data.avatarIngredientId;
          return personaRow();
        },
      ),
    },
    personaReference: {
      createMany: vi.fn(
        async (args: {
          data: Array<
            StoredRow & { organizationId: string; personaId: string }
          >;
        }) => {
          for (const row of args.data) {
            if (
              !state.references.some(
                (stored) => stored.ingredientId === row.ingredientId,
              )
            ) {
              state.references.push({
                ingredientId: row.ingredientId,
                position: row.position,
              });
            }
          }
          return { count: args.data.length };
        },
      ),
      deleteMany: vi.fn(async (args: { where: { ingredientId: string } }) => {
        state.references = state.references.filter(
          (row) => row.ingredientId !== args.where.ingredientId,
        );
        return { count: 1 };
      }),
      updateMany: vi.fn(
        async (args: {
          data: { position: number };
          where: { ingredientId: string };
        }) => {
          const row = state.references.find(
            (stored) => stored.ingredientId === args.where.ingredientId,
          );
          if (row) {
            row.position = args.data.position;
          }
          return { count: row ? 1 : 0 };
        },
      ),
    },
  };
  const prisma = {
    ...client,
    $transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) =>
      work(client),
    ),
  };
  const personas = {
    assertCanManageSharing: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { debug: vi.fn(), warn: vi.fn() };
  const service = new PersonaReferencesService(
    prisma as never,
    logger as never,
    personas as never,
  );
  const storedOrder = () =>
    [...state.references]
      .sort((a, b) => a.position - b.position)
      .map((row) => row.ingredientId);
  return { client, personas, prisma, service, state, storedOrder };
}

const scope = {
  actor: { userId: 'user-1' },
  brandId: BRAND,
  organizationId: ORG,
  personaId: PERSONA,
};

function rows(...ids: string[]): StoredRow[] {
  return ids.map((ingredientId, position) => ({ ingredientId, position }));
}

describe('PersonaReferencesService', () => {
  describe('orderedReferenceIdsFromRow', () => {
    it('orders by position and skips trashed assets', () => {
      expect(
        orderedReferenceIdsFromRow({
          avatarIngredientId: 'img-b',
          references: [
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-c',
              position: 2,
            },
            {
              ingredient: { isDeleted: true },
              ingredientId: 'img-a',
              position: 0,
            },
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-b',
              position: 1,
            },
          ],
        }),
      ).toEqual(['img-b', 'img-c']);
    });

    it('falls back to the avatar for a character without reference rows', () => {
      expect(
        orderedReferenceIdsFromRow({
          avatarIngredientId: 'img-a',
          references: [],
        }),
      ).toEqual(['img-a']);
      expect(
        orderedReferenceIdsFromRow({ avatarIngredientId: 'img-a' }),
      ).toEqual(['img-a']);
      expect(orderedReferenceIdsFromRow({ avatarIngredientId: null })).toEqual(
        [],
      );
    });

    it('does not fall back to the avatar when every reference is trashed', () => {
      expect(
        orderedReferenceIdsFromRow({
          avatarIngredientId: 'img-a',
          references: [
            {
              ingredient: { isDeleted: true },
              ingredientId: 'img-a',
              position: 0,
            },
          ],
        }),
      ).toEqual([]);
    });
  });

  describe('getOrderedReferenceIds', () => {
    it('maps each persona to its ordered live references, with the avatar fallback', async () => {
      const { prisma, service } = setup();
      prisma.persona.findMany.mockResolvedValue([
        {
          ...(await prisma.persona.findFirst()),
          id: 'persona-1',
          references: [
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-2',
              position: 1,
            },
            {
              ingredient: { isDeleted: true },
              ingredientId: 'img-x',
              position: 0,
            },
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-1',
              position: 2,
            },
          ],
        },
        {
          ...(await prisma.persona.findFirst()),
          avatarIngredientId: 'legacy-avatar',
          id: 'persona-2',
          references: [],
        },
      ]);

      const result = await service.getOrderedReferenceIds(ORG, [
        'persona-1',
        'persona-2',
      ]);

      expect(result.get('persona-1')).toEqual(['img-2', 'img-1']);
      expect(result.get('persona-2')).toEqual(['legacy-avatar']);
      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['persona-1', 'persona-2'] },
            isDeleted: false,
            organizationId: ORG,
          },
        }),
      );
    });

    it('skips the query for no personas', async () => {
      const { prisma, service } = setup();
      await expect(service.getOrderedReferenceIds(ORG, [])).resolves.toEqual(
        new Map(),
      );
      expect(prisma.persona.findMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists live references with contiguous positions', async () => {
      const { service } = setup({
        avatarIngredientId: 'img-1',
        deleted: ['img-2'],
        references: rows('img-1', 'img-2', 'img-3'),
      });
      await expect(
        service.list({
          brandId: BRAND,
          organizationId: ORG,
          personaId: PERSONA,
        }),
      ).resolves.toEqual([
        { ingredientId: 'img-1', position: 0 },
        { ingredientId: 'img-3', position: 1 },
      ]);
    });

    it('is not found for a brand the character is not available to', async () => {
      const { service } = setup({ references: rows('img-1') });
      await expect(
        service.list({
          brandId: 'brand-other',
          organizationId: ORG,
          personaId: PERSONA,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('add', () => {
    it('appends in order, skips ids already referenced and keeps the primary', async () => {
      const { client, service, state, storedOrder } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1'),
        validImages: ['img-1', 'img-2', 'img-3'],
      });

      const result = await service.add({
        ...scope,
        ingredientIds: ['img-3', 'img-1', 'img-2'],
      });

      expect(result.map((item) => item.ingredientId)).toEqual([
        'img-1',
        'img-3',
        'img-2',
      ]);
      expect(storedOrder()).toEqual(['img-1', 'img-3', 'img-2']);
      expect(client.personaReference.createMany).toHaveBeenCalledWith({
        data: [
          {
            ingredientId: 'img-3',
            organizationId: ORG,
            personaId: PERSONA,
            position: 1,
          },
          {
            ingredientId: 'img-2',
            organizationId: ORG,
            personaId: PERSONA,
            position: 2,
          },
        ],
        skipDuplicates: true,
      });
      expect(state.avatarIngredientId).toBe('img-1');
      expect(client.$queryRaw).toHaveBeenCalled();
    });

    it('is idempotent: repeating the same add writes nothing new', async () => {
      const { client, service, storedOrder } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1'),
        validImages: ['img-1', 'img-2'],
      });

      await service.add({ ...scope, ingredientIds: ['img-2'] });
      client.personaReference.createMany.mockClear();
      const again = await service.add({ ...scope, ingredientIds: ['img-2'] });

      expect(again.map((item) => item.ingredientId)).toEqual([
        'img-1',
        'img-2',
      ]);
      expect(storedOrder()).toEqual(['img-1', 'img-2']);
      expect(client.personaReference.createMany).not.toHaveBeenCalled();
    });

    it('stores a legacy avatar-only character image as its primary row first', async () => {
      const { service, state, storedOrder } = setup({
        avatarIngredientId: 'legacy',
        validImages: ['img-2'],
      });

      await service.add({ ...scope, ingredientIds: ['img-2'] });

      expect(storedOrder()).toEqual(['legacy', 'img-2']);
      expect(state.avatarIngredientId).toBe('legacy');
    });

    it('sets the primary when the character had no reference yet', async () => {
      const { service, state } = setup({ validImages: ['img-1'] });

      await service.add({ ...scope, ingredientIds: ['img-1'] });

      expect(state.avatarIngredientId).toBe('img-1');
    });

    it(`rejects going over ${MAX_CHARACTER_REFERENCES} references without writing`, async () => {
      const existing = Array.from(
        { length: MAX_CHARACTER_REFERENCES - 1 },
        (_, index) => `img-${index}`,
      );
      const { client, service } = setup({
        avatarIngredientId: 'img-0',
        references: rows(...existing),
        validImages: [...existing, 'new-1', 'new-2'],
      });

      await expect(
        service.add({ ...scope, ingredientIds: ['new-1', 'new-2'] }),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(client.personaReference.createMany).not.toHaveBeenCalled();

      await expect(
        service.add({ ...scope, ingredientIds: ['new-1'] }),
      ).resolves.toHaveLength(MAX_CHARACTER_REFERENCES);
    });

    it('does not count trashed references against the cap', async () => {
      const existing = Array.from(
        { length: MAX_CHARACTER_REFERENCES },
        (_, index) => `img-${index}`,
      );
      const { service } = setup({
        avatarIngredientId: 'img-1',
        deleted: ['img-0'],
        references: rows(...existing),
        validImages: ['new-1'],
      });

      await expect(
        service.add({ ...scope, ingredientIds: ['new-1'] }),
      ).resolves.toHaveLength(MAX_CHARACTER_REFERENCES);
    });

    it('rejects images that are not completed images of this brand, before any write', async () => {
      const { client, prisma, service } = setup({
        references: rows('img-1'),
        validImages: ['img-2'],
      });

      await expect(
        service.add({ ...scope, ingredientIds: ['img-2', 'foreign'] }),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(client.ingredient.findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: BRAND,
          category: { in: ['IMAGE', 'IMAGE_EDIT'] },
          id: { in: ['img-2', 'foreign'] },
          isDeleted: false,
          organizationId: ORG,
          status: { in: ['GENERATED', 'UPLOADED', 'VALIDATED'] },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('limits editing a shared character to owners and admins', async () => {
      const { personas, service } = setup({
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        references: rows('img-1'),
        validImages: ['img-2'],
      });
      personas.assertCanManageSharing.mockRejectedValue(new Error('forbidden'));

      await expect(
        service.add({ ...scope, ingredientIds: ['img-2'] }),
      ).rejects.toThrow('forbidden');
      expect(personas.assertCanManageSharing).toHaveBeenCalledWith({
        apiKeyContext: undefined,
        isSuperAdmin: undefined,
        organizationId: ORG,
        userId: 'user-1',
      });
    });

    it('is not found without an active brand', async () => {
      const { service } = setup({ validImages: ['img-1'] });
      await expect(
        service.add({ ...scope, brandId: null, ingredientIds: ['img-1'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reorder', () => {
    it('rejects a set that differs from the current references', async () => {
      const { client, service } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2', 'img-3'),
      });

      for (const ingredientIds of [
        ['img-2', 'img-1'],
        ['img-2', 'img-1', 'img-3', 'img-4'],
        ['img-2', 'img-1', 'img-4'],
        ['img-2', 'img-2', 'img-1'],
      ]) {
        await expect(
          service.reorder({ ...scope, ingredientIds }),
        ).rejects.toBeInstanceOf(ValidationException);
      }
      expect(client.personaReference.updateMany).not.toHaveBeenCalled();
    });

    it('rewrites positions and mirrors the new primary', async () => {
      const { client, service, state, storedOrder } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2', 'img-3'),
      });

      const result = await service.reorder({
        ...scope,
        ingredientIds: ['img-3', 'img-1', 'img-2'],
      });

      expect(result).toEqual([
        { ingredientId: 'img-3', position: 0 },
        { ingredientId: 'img-1', position: 1 },
        { ingredientId: 'img-2', position: 2 },
      ]);
      expect(storedOrder()).toEqual(['img-3', 'img-1', 'img-2']);
      expect(state.avatarIngredientId).toBe('img-3');
      expect(client.persona.update).toHaveBeenCalledWith({
        data: { avatarIngredientId: 'img-3' },
        where: { id: PERSONA, isDeleted: false, organizationId: ORG },
      });
    });

    it('keeps trashed references after the live ones', async () => {
      const { service, storedOrder } = setup({
        avatarIngredientId: 'img-2',
        deleted: ['img-1'],
        references: rows('img-1', 'img-2', 'img-3'),
      });

      await service.reorder({ ...scope, ingredientIds: ['img-3', 'img-2'] });

      expect(storedOrder()).toEqual(['img-3', 'img-2', 'img-1']);
    });
  });

  describe('remove', () => {
    it('deletes the row, closes the gap and promotes the next reference', async () => {
      const { client, service, state } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2', 'img-3'),
      });

      const result = await service.remove({ ...scope, ingredientId: 'img-1' });

      expect(client.personaReference.deleteMany).toHaveBeenCalledWith({
        where: {
          ingredientId: 'img-1',
          organizationId: ORG,
          personaId: PERSONA,
        },
      });
      expect(state.references).toEqual(
        expect.arrayContaining([
          { ingredientId: 'img-2', position: 0 },
          { ingredientId: 'img-3', position: 1 },
        ]),
      );
      expect(result.map((item) => item.ingredientId)).toEqual([
        'img-2',
        'img-3',
      ]);
      expect(state.avatarIngredientId).toBe('img-2');
    });

    it('clears the primary when the last reference is removed', async () => {
      const { service, state } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1'),
      });

      await expect(
        service.remove({ ...scope, ingredientId: 'img-1' }),
      ).resolves.toEqual([]);
      expect(state.avatarIngredientId).toBeNull();
    });

    it('is not found for an image that is not a reference', async () => {
      const { service } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1'),
      });

      await expect(
        service.remove({ ...scope, ingredientId: 'img-9' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setPrimary', () => {
    it('moves an existing reference to position 0', async () => {
      const { service, state, storedOrder } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2', 'img-3'),
        validImages: ['img-3'],
      });

      await service.setPrimary({ ...scope, ingredientId: 'img-3' });

      expect(storedOrder()).toEqual(['img-3', 'img-1', 'img-2']);
      expect(state.avatarIngredientId).toBe('img-3');
    });

    it('inserts a new image at position 0', async () => {
      const { service, state, storedOrder } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2'),
        validImages: ['img-new'],
      });

      await service.setPrimary({ ...scope, ingredientId: 'img-new' });

      expect(storedOrder()).toEqual(['img-new', 'img-1', 'img-2']);
      expect(state.avatarIngredientId).toBe('img-new');
    });
  });

  describe('syncPrimary', () => {
    it('mirrors the first live reference, skipping a trashed primary', async () => {
      const { client, service, state } = setup({
        avatarIngredientId: 'img-1',
        deleted: ['img-1'],
        references: rows('img-1', 'img-2'),
      });

      await expect(
        service.syncPrimary(client as never, ORG, PERSONA),
      ).resolves.toBe('img-2');
      expect(state.avatarIngredientId).toBe('img-2');

      state.deleted.clear();
      await service.syncPrimary(client as never, ORG, PERSONA);
      expect(state.avatarIngredientId).toBe('img-1');
    });

    it('stores a legacy avatar before clearing it when that asset is trashed', async () => {
      const { client, service, state, storedOrder } = setup({
        avatarIngredientId: 'legacy',
        deleted: ['legacy'],
      });

      await expect(
        service.syncPrimary(client as never, ORG, PERSONA),
      ).resolves.toBeNull();
      expect(storedOrder()).toEqual(['legacy']);
      expect(state.avatarIngredientId).toBeNull();

      state.deleted.clear();
      await service.syncPrimary(client as never, ORG, PERSONA);
      expect(state.avatarIngredientId).toBe('legacy');
    });

    it('writes nothing when the mirror is already right', async () => {
      const { client, service } = setup({
        avatarIngredientId: 'img-1',
        references: rows('img-1', 'img-2'),
      });

      await service.syncPrimary(client as never, ORG, PERSONA);

      expect(client.persona.update).not.toHaveBeenCalled();
    });
  });

  describe('resyncForIngredients', () => {
    it('re-syncs every character using the assets, scoped to the organization', async () => {
      const { prisma, service, state } = setup({
        avatarIngredientId: 'img-1',
        deleted: ['img-1'],
        references: rows('img-1', 'img-2'),
      });

      await service.resyncForIngredients(ORG, ['img-1', 'img-1']);

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          OR: [
            { avatarIngredientId: { in: ['img-1'] } },
            { references: { some: { ingredientId: { in: ['img-1'] } } } },
          ],
          isDeleted: false,
          organizationId: ORG,
        },
      });
      expect(state.avatarIngredientId).toBe('img-2');
    });

    it('does nothing without ids', async () => {
      const { prisma, service } = setup();
      await service.resyncForIngredients(ORG, []);
      expect(prisma.persona.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findReferenceUsage', () => {
    it('names the live characters using each asset, including avatar-only characters', async () => {
      const { prisma, service } = setup();
      prisma.persona.findMany.mockResolvedValue([
        {
          ...(await prisma.persona.findFirst()),
          avatarIngredientId: 'img-1',
          handle: 'anna',
          id: 'persona-1',
          label: 'Anna',
          references: [
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-1',
              position: 0,
            },
            {
              ingredient: { isDeleted: false },
              ingredientId: 'img-2',
              position: 1,
            },
          ],
        },
        {
          ...(await prisma.persona.findFirst()),
          avatarIngredientId: 'img-2',
          handle: null,
          id: 'persona-2',
          label: 'Bob',
          references: [],
        },
      ]);

      const usage = await service.findReferenceUsage(ORG, [
        'img-2',
        'img-1',
        'img-3',
      ]);

      expect(usage).toEqual([
        {
          characters: [
            { handle: 'anna', id: 'persona-1', label: 'Anna' },
            { handle: null, id: 'persona-2', label: 'Bob' },
          ],
          ingredientId: 'img-2',
        },
        {
          characters: [{ handle: 'anna', id: 'persona-1', label: 'Anna' }],
          ingredientId: 'img-1',
        },
        { characters: [], ingredientId: 'img-3' },
      ]);
      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            organizationId: ORG,
          }),
        }),
      );
    });
  });
});

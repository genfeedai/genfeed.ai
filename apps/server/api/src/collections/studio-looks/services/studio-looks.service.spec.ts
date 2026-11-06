vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { StudioLooksService } from '@api/collections/studio-looks/services/studio-looks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { RouterPriority } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const scope = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
};

const createDto = {
  assetType: 'video' as const,
  camera: 'camera-1',
  cameraMovement: 'move-1',
  label: 'Cinematic',
  lens: 'lens-1',
  lighting: 'lighting-1',
  mood: 'mood-1',
  promptTemplate: 'preset-1',
  scene: 'scene-1',
  style: 'style-1',
};

const setupFieldsDto = {
  ...createDto,
  aspectRatio: '16:9',
  brandingMode: 'brand' as const,
  duration: 5,
  modelKey: 'replicate/model-key',
  outputs: 4,
  prioritize: RouterPriority.QUALITY,
  resolution: '1080p',
};

const matches = (row: Row, where: Where) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

describe('StudioLooksService', () => {
  let brands: Row[];
  let looks: Row[];
  let service: StudioLooksService;

  const look = (id: string, fields: Partial<Row> = {}): Row => ({
    ...createDto,
    brandId: 'brand-1',
    createdAt: new Date(`2026-11-0${id.slice(-1)}T00:00:00Z`),
    id,
    isDeleted: false,
    organizationId: 'org-1',
    ...fields,
  });

  beforeEach(() => {
    brands = [
      { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      { id: 'brand-2', isDeleted: false, organizationId: 'org-2' },
    ];
    looks = [];

    const live = (where: Where) => looks.filter((row) => matches(row, where));
    const newestFirst = (rows: Row[]) =>
      [...rows].sort(
        (a, b) =>
          (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
      );
    const prisma = {
      brand: {
        findFirst: async ({ where }: { where: Where }) =>
          brands.find((row) => matches(row, where)) ?? null,
      },
      studioLook: {
        count: async ({ where }: { where: Where }) => live(where).length,
        create: async ({ data }: { data: Row }) => {
          const row = {
            ...data,
            createdAt: new Date(),
            id: `look-${looks.length + 1}`,
            isDeleted: false,
          };
          looks.push(row);
          return row;
        },
        findFirst: async ({ where }: { where: Where }) =>
          live(where)[0] ?? null,
        findMany: async ({
          skip = 0,
          take,
          where,
        }: {
          skip?: number;
          take?: number;
          where: Where;
        }) => newestFirst(live(where)).slice(skip, take && skip + take),
        updateMany: async ({ data, where }: { data: Row; where: Where }) => {
          const rows = live(where);
          for (const row of rows) {
            Object.assign(row, data);
          }
          return { count: rows.length };
        },
      },
    };

    service = new StudioLooksService(
      prisma as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
      } as unknown as LoggerService,
    );
  });

  describe('listScoped', () => {
    beforeEach(() => {
      looks.push(
        look('look-1'),
        look('look-2', { assetType: 'image', cameraMovement: null }),
        look('look-3'),
        look('look-4', { isDeleted: true }),
        look('look-5', { brandId: 'brand-other' }),
        look('look-6', { organizationId: 'org-2' }),
      );
    });

    it('lists live Looks of the organization and brand, newest first', async () => {
      const page = await service.listScoped(scope, undefined, {
        limit: 20,
        page: 1,
      });

      expect(page.docs.map(({ id }) => id)).toEqual([
        'look-3',
        'look-2',
        'look-1',
      ]);
      expect(page.totalDocs).toBe(3);
    });

    it('narrows to one asset type', async () => {
      const page = await service.listScoped(scope, 'video', {
        limit: 20,
        page: 1,
      });

      expect(page.docs.map(({ id }) => id)).toEqual(['look-3', 'look-1']);
    });

    it('pages through the scoped Looks', async () => {
      const page = await service.listScoped(scope, undefined, {
        limit: 2,
        page: 2,
      });

      expect(page).toMatchObject({ hasPrevPage: true, totalDocs: 3 });
      expect(page.docs.map(({ id }) => id)).toEqual(['look-1']);
    });
  });

  describe('createScoped', () => {
    it('creates under the server-owned scope and keeps video camera movement', async () => {
      await service.createScoped(createDto, scope);

      expect(looks).toEqual([
        expect.objectContaining({
          ...createDto,
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'opaque-user-id',
        }),
      ]);
    });

    it('persists the Generation Setup fields', async () => {
      await service.createScoped(setupFieldsDto, scope);

      expect(looks[0]).toMatchObject(setupFieldsDto);
    });

    it.each([
      ['an image Look', { assetType: 'image' as const }, null],
      [
        'a video Look without camera movement',
        { cameraMovement: undefined },
        '',
      ],
    ])('stores the camera movement of %s', async (_case, fields, expected) => {
      await service.createScoped({ ...createDto, ...fields }, scope);

      expect(looks[0]?.cameraMovement).toBe(expected);
    });

    it('refuses a brand outside the organization and creates nothing', async () => {
      await expect(
        service.createScoped(createDto, { ...scope, brandId: 'brand-2' }),
      ).rejects.toThrow(NotFoundException);
      expect(looks).toEqual([]);
    });
  });

  describe('updateScoped', () => {
    beforeEach(() => {
      looks.push(
        look('look-1'),
        look('look-2', { brandId: 'brand-other' }),
        look('look-3', { isDeleted: true }),
      );
    });

    it('updates a live Look in scope and returns it', async () => {
      await expect(
        service.updateScoped('look-1', { label: 'Updated' }, scope),
      ).resolves.toMatchObject({
        cameraMovement: 'move-1',
        id: 'look-1',
        label: 'Updated',
      });
    });

    it('persists the Generation Setup fields', async () => {
      const patch = {
        aspectRatio: '9:16',
        modelKey: '',
        outputs: 1,
        prioritize: RouterPriority.SPEED,
      };

      await service.updateScoped('look-1', patch, scope);

      expect(looks[0]).toMatchObject(patch);
    });

    it('clears camera movement when the Look becomes an image', async () => {
      await service.updateScoped('look-1', { assetType: 'image' }, scope);

      expect(looks[0]).toMatchObject({
        assetType: 'image',
        cameraMovement: null,
      });
    });

    it.each([
      ['another brand', 'look-2'],
      ['a deleted Look', 'look-3'],
      ['a missing Look', 'look-9'],
    ])('leaves %s alone', async (_case, id) => {
      await expect(
        service.updateScoped(id, { label: 'Updated' }, scope),
      ).resolves.toBeNull();
      expect(looks.map(({ label }) => label)).toEqual([
        'Cinematic',
        'Cinematic',
        'Cinematic',
      ]);
    });
  });

  describe('removeScoped', () => {
    beforeEach(() => {
      looks.push(look('look-1'), look('look-2', { organizationId: 'org-2' }));
    });

    it('soft-deletes a live Look in scope', async () => {
      await expect(service.removeScoped('look-1', scope)).resolves.toBe(true);
      expect(looks.map(({ isDeleted }) => isDeleted)).toEqual([true, false]);
    });

    it('leaves another organization Look alone', async () => {
      await expect(service.removeScoped('look-2', scope)).resolves.toBe(false);
      expect(looks.map(({ isDeleted }) => isDeleted)).toEqual([false, false]);
    });
  });
});

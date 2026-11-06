import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

type Row = Record<string, unknown> & { id: string };
type Include = Record<string, unknown> | undefined;

// Related rows the ingredient table joins in only when the query includes them.
const relations: Record<string, Record<string, unknown>> = {
  brand: { id: 'brand-1', label: 'Brand' },
  metadata: { id: 'metadata-1', label: 'Focus' },
  prompt: { id: 'prompt-1', original: 'Ambient focus track' },
};

const withIncluded = (row: Row, include: Include) => ({
  ...row,
  ...Object.fromEntries(
    Object.keys(include ?? {}).map((key) => [key, relations[key]]),
  ),
});

describe('MusicsService', () => {
  const sourceId = 'cmingredient000000000000001';
  const tagId = 'cmtag000000000000000000001';
  let marked: string[];
  let rows: Map<string, Row>;
  let service: MusicsService;

  beforeEach(async () => {
    marked = [];
    rows = new Map([
      [
        'music-1',
        {
          id: 'music-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'PROCESSING',
        },
      ],
    ]);

    const delegate = {
      create: async ({
        data,
        include,
      }: {
        data: Record<string, unknown>;
        include?: Include;
      }) => {
        const row = {
          isDeleted: false,
          organizationId: 'org-1',
          ...data,
          id: `music-new-${rows.size}`,
        };
        rows.set(row.id, row);
        return withIncluded(row, include);
      },
      findFirst: async ({
        include,
        where,
      }: {
        include?: Include;
        where: { id?: string };
      }) => {
        const row = where.id ? rows.get(where.id) : undefined;
        return row ? withIncluded(row, include) : null;
      },
      update: async ({
        data,
        include,
        where,
      }: {
        data: Record<string, unknown>;
        include?: Include;
        where: { id: string };
      }) => {
        const row = rows.get(where.id);
        if (!row) {
          throw new Error('Record to update not found');
        }
        return withIncluded(Object.assign(row, data), include);
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        MusicsService,
        {
          provide: PrismaService,
          useValue: { ingredient: delegate } as unknown as PrismaService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: () => undefined,
            error: () => undefined,
            warn: () => undefined,
          },
        },
        {
          provide: AssetGateService,
          useValue: {
            markFirstAssetGenerated: async (organizationId: string) => {
              marked.push(organizationId);
            },
          },
        },
      ],
    }).compile();

    service = module.get<MusicsService>(MusicsService);
  });

  it('marks the organization when music reaches GENERATED', async () => {
    await service.patch('music-1', { status: IngredientStatus.GENERATED });

    expect(rows.get('music-1')?.status).toBe(IngredientStatus.GENERATED);
    expect(marked).toEqual(['org-1']);
  });

  it('stores tags as a replacement set without marking a non-GENERATED update', async () => {
    await service.patch('music-1', {
      status: IngredientStatus.PROCESSING,
      tags: [tagId],
    });

    expect(rows.get('music-1')?.tags).toEqual({ set: [{ id: tagId }] });
    expect(marked).toEqual([]);
  });

  it('stores sources and tags as relation connects on a non-GENERATED create', async () => {
    const created = await service.create({
      origin: IngredientOrigin.GENERATED,
      sources: [sourceId],
      status: IngredientStatus.PROCESSING,
      tags: [tagId],
      text: 'Ambient focus track',
    });

    expect(rows.get(String(created.id))).toMatchObject({
      sources: { connect: [{ id: sourceId }] },
      tags: { connect: [{ id: tagId }] },
    });
    expect(marked).toEqual([]);
  });

  it('returns a GENERATED create with its brand, metadata and prompt', async () => {
    const created = await service.create({
      origin: IngredientOrigin.GENERATED,
      status: IngredientStatus.GENERATED,
      text: 'Ambient focus track',
    });

    expect(created).toMatchObject({
      brand: relations.brand,
      metadata: relations.metadata,
      prompt: relations.prompt,
    });
    expect(marked).toEqual(['org-1']);
  });

  it('returns a GENERATED update with the requested population', async () => {
    const updated = await service.patch(
      'music-1',
      { status: IngredientStatus.GENERATED },
      ['metadata'],
    );

    expect(updated).toMatchObject({ metadata: relations.metadata });
    expect(updated).not.toHaveProperty('prompt');
  });
});

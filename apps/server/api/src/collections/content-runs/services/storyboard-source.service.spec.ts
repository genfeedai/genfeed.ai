import type { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import type { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const updatedAt = new Date('2026-09-30T12:00:00.000Z');
  const prisma = {
    ingredient: {
      findFirst: vi.fn(async () => ({
        id: 'video-1',
        metadata: { label: 'Owned footage' },
        updatedAt,
      })),
      findMany: vi.fn(),
    },
    asset: { findMany: vi.fn() },
  };
  const planning = {
    resolveSource: vi.fn(),
    assertConnectedCredential: vi.fn(),
  };
  const videos = {
    libraryAsset: vi.fn(async () => ({
      sourceAssetId: 'video-1',
      assetUpdatedAt: updatedAt.toISOString(),
      url: 'https://private.example/video',
      durationSeconds: 15,
      sizeBytes: 1234,
    })),
  };
  const personas = personasServiceStub();
  return {
    personas,
    prisma,
    planning,
    videos,
    service: new StoryboardSourceService(
      prisma as unknown as PrismaService,
      planning as unknown as BrandRemixRunPlanningService,
      videos as unknown as BrandRemixSceneSourceService,
      personas,
    ),
  };
}
describe('Storyboard source snapshots', () => {
  it('brief sources do not resolve or probe video sources', async () => {
    const { service, planning, videos } = setup();
    const result = await service.resolve('org-1', 'brand-1', {
      kind: 'brief',
      brief: 'A new idea',
    });
    expect(result.selector.kind).toBe('brief');
    expect(videos.libraryAsset).not.toHaveBeenCalled();
    expect(planning.resolveSource).not.toHaveBeenCalled();
  });
  it('uploads reuse existing owned Library validation and store real metadata without URLs/social fields', async () => {
    const { service, videos } = setup();
    const result = await service.resolve('org-1', 'brand-1', {
      kind: 'uploaded_video',
      assetId: 'video-1',
    });
    expect(videos.libraryAsset).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'video-1',
    );
    expect(result).toMatchObject({
      title: 'Owned footage',
      durationSeconds: 15,
      sizeBytes: 1234,
    });
    expect(result).not.toHaveProperty('platform');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('metrics');
  });
  it('refuses changed source versions before the caller can quote or dispatch', async () => {
    const { service, videos, prisma } = setup();
    const snapshot = await service.resolve('org-1', 'brand-1', {
      kind: 'uploaded_video',
      assetId: 'video-1',
    });
    const changed = new Date('2026-09-30T12:01:00.000Z');
    videos.libraryAsset.mockResolvedValue({
      sourceAssetId: 'video-1',
      assetUpdatedAt: changed.toISOString(),
      url: 'https://private.example/video',
      durationSeconds: 15,
      sizeBytes: 1234,
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'video-1',
      metadata: { label: 'Owned footage' },
      updatedAt: changed,
    });
    await expect(
      service.revalidate('org-1', 'brand-1', snapshot),
    ).rejects.toThrow('Select it again');
  });
  it('requires owned scoped live image assets for seeded drafts', async () => {
    const { service, prisma } = setup();
    await service.resolve('org-1', 'brand-1', {
      kind: 'brief',
      brief: '',
      seedImageAssetId: 'image-1',
    });
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          id: 'image-1',
          isDeleted: false,
          category: 'IMAGE',
          scope: 'USER',
        }),
      }),
    );
  });
});

describe('Storyboard plan character admission (#6040)', () => {
  const plan = {
    cast: [{ avatarAssetId: 'avatar-1', referenceAssetIds: [] }],
    shots: [],
    styleReferenceAssetIds: ['style-1'],
  } as never;

  it('refuses a plan whose character the brand can no longer use', async () => {
    const { personas, prisma, service } = setup();
    vi.mocked(personas.resolveCharacterReferences).mockRejectedValueOnce(
      new NotFoundException('Reference image'),
    );

    await expect(
      service.validatePlanAssets('org-1', 'brand-1', plan),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(personas.resolveCharacterReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        ingredientIds: expect.arrayContaining(['avatar-1', 'style-1']),
        organizationId: 'org-1',
        path: 'storyboard',
      }),
    );
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });

  it('admits a shared character avatar that belongs to its owning brand', async () => {
    const { personas, prisma, service } = setup();
    vi.mocked(personas.resolveCharacterReferences).mockResolvedValueOnce({
      availableAvatarIds: new Set(['avatar-1']),
      grantedAvatarOwners: new Map(),
      personaId: 'persona-1',
      personaIdByAssetId: new Map(),
    });
    prisma.ingredient.findMany.mockResolvedValue([
      { category: 'IMAGE', id: 'avatar-1' },
      { category: 'IMAGE', id: 'style-1' },
    ]);
    prisma.asset.findMany.mockResolvedValue([]);

    await expect(
      service.validatePlanAssets('org-1', 'brand-1', plan),
    ).resolves.toBeUndefined();

    const where = prisma.ingredient.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toContainEqual({ id: { in: ['avatar-1'] } });
  });
});

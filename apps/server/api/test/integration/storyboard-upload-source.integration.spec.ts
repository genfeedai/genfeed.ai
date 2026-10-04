import { randomUUID } from 'node:crypto';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { noCharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('Storyboard upload creation against real Prisma metadata', () => {
  let prisma: PrismaClient;
  let source: StoryboardSourceService;
  let runs: StoryboardRunsService;
  const prefix = `5724-${randomUUID()}`;
  const userId = `${prefix}-user`;
  const organizationId = `${prefix}-org`;
  const brandId = `${prefix}-brand`;
  const videoId = `${prefix}-video`;
  const metadataId = `${prefix}-metadata`;
  beforeAll(async () => {
    const url =
      process.env.STORYBOARD_DISPOSABLE_DATABASE_URL ??
      process.env.DATABASE_URL;
    const database = url ? new URL(url) : null;
    const local =
      database && ['localhost', '127.0.0.1'].includes(database.hostname);
    if (
      !url ||
      !local ||
      !(
        database.pathname.startsWith('/storyboard_5724_disposable') ||
        (process.env.CI === 'true' && database.pathname === '/test')
      )
    )
      throw new Error('Requires a disposable local Storyboard test database');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await prisma.user.create({ data: { id: userId, handle: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        userId,
        label: 'Fixture org',
        slug: organizationId,
      },
    });
    await prisma.brand.create({
      data: {
        id: brandId,
        userId,
        organizationId,
        label: 'Fixture brand',
        slug: brandId,
      },
    });
    await prisma.metadata.create({
      data: {
        id: metadataId,
        label: 'Owned uploaded footage',
        extension: MetadataExtension.MP4,
      },
    });
    const asset = await prisma.ingredient.create({
      data: {
        id: videoId,
        organizationId,
        brandId,
        userId,
        metadataId,
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.UPLOADED,
      },
    });
    const planning = {
      resolveBrandContext: vi.fn(async () => ({
        brandKit: { references: [], products: [], logos: [], avatars: [] },
      })),
    };
    const videos = {
      libraryAsset: vi.fn(async () => ({
        sourceAssetId: videoId,
        assetUpdatedAt: asset.updatedAt.toISOString(),
        url: 'https://fixture.invalid/video',
        durationSeconds: 15,
        sizeBytes: 1000,
      })),
    };
    source = new StoryboardSourceService(
      prisma as never,
      planning as never,
      videos as never,
      {
        resolveCharacterReferences: vi.fn(async () => noCharacterAdmission()),
      } as never,
    );
    runs = new StoryboardRunsService(
      prisma as never,
      planning as never,
      source,
      {} as never,
      {} as never,
      { warn: vi.fn() } as never,
    );
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.contentRun.deleteMany({ where: { organizationId, brandId } });
    await prisma.ingredient.deleteMany({
      where: { organizationId, brandId, id: videoId },
    });
    await prisma.metadata.deleteMany({ where: { id: metadataId } });
    await prisma.brand.deleteMany({ where: { organizationId, id: brandId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  it('reads Metadata.label through the actual relation and creates one retry-safe draft', async () => {
    const input = {
      clientRequestId: randomUUID(),
      source: { kind: 'uploaded_video', assetId: videoId },
    };
    const first = await runs.create(organizationId, brandId, userId, input);
    const retry = await runs.create(organizationId, brandId, userId, input);
    expect(first.id).toBe(retry.id);
    expect(first.config.sourceSnapshot).toMatchObject({
      title: 'Owned uploaded footage',
      assetId: videoId,
      durationSeconds: 15,
      sizeBytes: 1000,
    });
    expect(first.config.plan?.runtimeBudgetSeconds).toBe(15);
    expect(
      await prisma.contentRun.count({ where: { organizationId, brandId } }),
    ).toBe(1);
  });
  it('does not project a live asset from a different tenant or a deleted asset', async () => {
    const input = { kind: 'uploaded_video' as const, assetId: videoId };
    await expect(source.resolve('other-org', brandId, input)).rejects.toThrow();
    await prisma.ingredient.update({
      where: { id: videoId },
      data: { isDeleted: true },
    });
    await expect(
      source.resolve(organizationId, brandId, input),
    ).rejects.toThrow();
  });
});

import { randomUUID } from 'node:crypto';
import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, Status } from '@genfeedai/contracts';
import type { IEvaluation } from '@genfeedai/contracts/interfaces';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
const scores = {
  technical: { overall: 60 },
  brand: {
    overall: 60,
    styleAlignment: 60,
    messageAlignment: 60,
    toneAlignment: 60,
  },
  engagement: {
    overall: 60,
    viralityPotential: 60,
    emotionalAppeal: 60,
    shareability: 60,
    platformFit: 60,
  },
  persuasion: {
    overall: 999,
    demandFit: 20,
    hookStrength: 40,
    openLoopIntegrity: 60,
    ctaNaturalness: 80,
  },
};
const parent = {
  id: 'same-id',
  organizationId: 'org',
  brandId: 'brand',
  category: 'VIDEO',
  isDeleted: false,
};
const row: IEvaluation = {
  id: 'eval',
  organizationId: 'org',
  userId: 'canonical-user',
  contentType: IngredientCategory.VIDEO,
  contentId: 'same-id',
  isDeleted: false,
  createdAt: new Date(0),
  updatedAt: new Date(1),
  data: {
    brandId: 'brand',
    status: Status.COMPLETED,
    overallScore: 60,
    scores,
    analysis: {
      strengths: ['Saved observation'],
      weaknesses: [],
      suggestions: [],
      aiModel: 'fixture',
    },
  },
};

describe('ContentEvaluationProjectionService batching and copies', () => {
  it('uses one parameterized query for deduplicated authorized targets and preserves page metadata', async () => {
    const query = vi.fn().mockResolvedValue([row]);
    const service = new ContentEvaluationProjectionService({
      $queryRaw: query,
    } as unknown as PrismaService);
    const page = {
      docs: [parent, { ...parent }],
      totalDocs: 2,
      page: 3,
      limit: 2,
    };
    const result = await service.attachToPage(page, { brandId: 'brand' });
    expect(query).toHaveBeenCalledTimes(1);
    const sql: Prisma.Sql = query.mock.calls[0][0];
    expect(sql.values).toEqual([
      'org',
      IngredientCategory.VIDEO,
      'same-id',
      'brand',
      'brand',
    ]);
    expect(sql.sql).toContain('ROW_NUMBER()');
    expect(sql.sql).not.toContain('same-id');
    expect(sql.sql).not.toMatch(/LIMIT|userId.*=/);
    expect(result).toMatchObject({ totalDocs: 2, page: 3, limit: 2 });
    expect(result.docs[0]?.evaluation).toMatchObject({
      id: 'eval',
      userId: 'canonical-user',
      data: { scores: { persuasion: { overall: 50 } } },
    });
    expect(row.data.scores?.persuasion?.overall).toBe(999);
    expect(parent).not.toHaveProperty('evaluation');
    expect(result.docs[0]).not.toBe(parent);
  });
  it('does not query unsupported, deleted, default or malformed targets', async () => {
    const query = vi.fn();
    const service = new ContentEvaluationProjectionService({
      $queryRaw: query,
    } as unknown as PrismaService);
    const result = await service.attachToItems(
      [
        { ...parent, category: 'AUDIO' },
        { ...parent, isDeleted: true },
        { ...parent, organizationId: null },
        { id: 42, organizationId: 'org' },
        {},
      ],
      { brandId: 'brand' },
    );
    expect(query).not.toHaveBeenCalled();
    expect(result.every((item) => item.evaluation === null)).toBe(true);
    await service.attachToItems([], { contentType: 'post' });
    expect(query).not.toHaveBeenCalled();
  });
  it('propagates query failures instead of presenting missing analysis', async () => {
    const error = new Error('database unavailable');
    const service = new ContentEvaluationProjectionService({
      $queryRaw: vi.fn().mockRejectedValue(error),
    } as unknown as PrismaService);
    await expect(
      service.attachToItem(parent, { brandId: 'brand' }),
    ).rejects.toBe(error);
  });
  it('does not rewrite failed attempt data with leftover persuasion', async () => {
    const failed = { ...row, data: { ...row.data, status: Status.FAILED } };
    const service = new ContentEvaluationProjectionService({
      $queryRaw: vi.fn().mockResolvedValue([failed]),
    } as unknown as PrismaService);
    expect(
      (await service.attachToItem(parent, { brandId: 'brand' })).evaluation
        ?.data,
    ).toEqual(failed.data);
  });
});

// Existing CI provisions this isolated migrated database. Never use DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'Persisted evaluation projection PostgreSQL (#4616)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const guarded = connectionString
      ? new PrismaService({
          get: (key: string) =>
            key === 'DATABASE_URL' ? connectionString : undefined,
          mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
        } as unknown as ConfigService)
      : null;
    const db = () => {
      if (!prisma) throw new Error('Isolated test database required');
      return prisma;
    };
    const projector = () => {
      if (!guarded) throw new Error('Isolated test database required');
      return new ContentEvaluationProjectionService(guarded);
    };
    let userId: string;
    let orgA: string;
    let orgB: string;
    let brandA: string;
    let brandB: string;
    const time = new Date('2026-09-01T00:00:00Z');
    const completed = (brandId: string) => ({
      status: 'completed',
      brandId,
      overallScore: 0,
      scores,
    });
    const save = (
      id: string,
      data: Prisma.InputJsonValue,
      extra: Partial<Prisma.EvaluationUncheckedCreateInput> = {},
    ) =>
      db().evaluation.create({
        data: {
          id: `${userId}-${id}`,
          organizationId: orgA,
          userId,
          contentType: IngredientCategory.VIDEO,
          contentId: 'same-id',
          data,
          createdAt: time,
          updatedAt: time,
          ...extra,
        },
      });
    const target = (extra: object = {}) => ({
      ...parent,
      organizationId: orgA,
      brandId: brandA,
      ...extra,
    });
    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `ev-user-${suffix}`;
      orgA = `ev-org-a-${suffix}`;
      orgB = `ev-org-b-${suffix}`;
      brandA = `ev-brand-a-${suffix}`;
      brandB = `ev-brand-b-${suffix}`;
      await db().user.create({ data: { id: userId, handle: userId } });
      for (const id of [orgA, orgB])
        await db().organization.create({
          data: { id, label: id, slug: id, userId },
        });
    });
    afterEach(async () => {
      await db().evaluation.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await db().organization.deleteMany({
        where: { id: { in: [orgA, orgB] } },
      });
      await db().user.delete({ where: { id: userId } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      await guarded?.$disconnect();
    });
    it('isolates organization, brand, content type, deletion and canonical row data in a bounded batch', async () => {
      await save('a-video', completed(brandA));
      await save('b-video', completed(brandA), { organizationId: orgB });
      await save('wrong-brand', completed(brandB), {
        updatedAt: new Date(time.getTime() + 1000),
      });
      await save('a-image', completed(brandA), {
        contentType: IngredientCategory.IMAGE,
      });
      await save('a-post', completed(brandA), { contentType: 'post' });
      await save('deleted', completed(brandA), {
        isDeleted: true,
        updatedAt: new Date(time.getTime() + 2000),
      });
      const before = await db().evaluation.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      });
      const query = vi.spyOn(
        guarded ??
          (() => {
            throw new Error('Isolated test database required');
          })(),
        '$queryRaw',
      );
      const projected = await projector().attachToItems(
        [
          target(),
          target({ category: 'IMAGE' }),
          target({ organizationId: orgB }),
          target({ isDeleted: true }),
          target({ organizationId: null }),
          target({ brandId: null }),
        ],
        { brandId: brandA },
      );
      expect(query).toHaveBeenCalledTimes(1);
      query.mockRestore();
      expect(projected.map((item) => item.evaluation?.id ?? null)).toEqual([
        `${userId}-a-video`,
        `${userId}-a-image`,
        `${userId}-b-video`,
        `${userId}-a-video`,
      ]);
      expect(projected[0]?.evaluation).toMatchObject({
        organizationId: orgA,
        userId,
        contentId: 'same-id',
        contentType: IngredientCategory.VIDEO,
        data: { overallScore: 0, scores: { persuasion: { overall: 50 } } },
      });
      expect(
        (
          await projector().attachToItem(target(), {
            brandId: brandA,
            contentType: 'post',
          })
        ).evaluation?.id,
      ).toBe(`${userId}-a-post`);
      expect(
        await db().evaluation.findMany({
          where: { userId },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
    });
    it('selects the newest displayable attempt, skipping malformed completion and deterministic timestamp ties', async () => {
      await save('b', completed(brandA));
      await save('a', completed(brandA));
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation?.id,
      ).toBe(`${userId}-a`);
      for (const [index, data] of [
        [],
        { status: 'unknown' },
        { status: 'completed', overallScore: '90', scores: {} },
        { status: 'completed', overallScore: 101, scores: {} },
        { status: 'completed', overallScore: 80, scores: [] },
      ].entries()) {
        await save(`bad-${index}`, data, {
          updatedAt: new Date(time.getTime() + 1000 + index),
        });
      }
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation?.id,
      ).toBe(`${userId}-a`);
      await save(
        'processing',
        { status: 'processing', brandId: brandA },
        { updatedAt: new Date(time.getTime() + 3000) },
      );
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation?.data,
      ).toEqual({ status: 'processing', brandId: brandA });
      await save(
        'failed',
        { status: 'failed', brandId: brandA },
        { updatedAt: new Date(time.getTime() + 4000) },
      );
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation?.data.status,
      ).toBe('failed');
    });
    it('allows matching explicit legacy brands and excludes ambiguous brandless shared targets', async () => {
      await save('legacy', {
        status: 'completed',
        overallScore: 50,
        scores: { persuasion: { demandFit: 50 } },
      });
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation,
      ).toMatchObject({ data: { overallScore: 50, scores: {} } });
      expect(
        (
          await projector().attachToItem(target({ brandId: null }), {
            brandId: brandA,
          })
        ).evaluation,
      ).toBeNull();
      expect(
        (await projector().attachToItem(target(), { brandId: brandB }))
          .evaluation,
      ).toBeNull();
      await save(
        'null-brand',
        { status: 'failed', brandId: null },
        { updatedAt: new Date(time.getTime() + 1000) },
      );
      expect(
        (await projector().attachToItem(target(), { brandId: brandA }))
          .evaluation?.id,
      ).toBe(`${userId}-legacy`);
    });
  },
);

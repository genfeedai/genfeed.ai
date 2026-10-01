import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CacheService } from '@api/services/cache/cache.service';
import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  IngredientCategory,
  IngredientStatus,
  Status,
} from '@genfeedai/contracts';
import type { IEvaluationScores } from '@genfeedai/contracts/interfaces';
import { getDeserializer } from '@genfeedai/helpers';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
const databaseUrl = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
const redisUrl = process.env.EVALUATION_READ_TEST_REDIS_URL;
const outputPath = process.env.EVALUATION_READ_FIXTURE_OUTPUT;
const persuasion = {
  demandFit: 20,
  hookStrength: 90,
  openLoopIntegrity: 60,
  ctaNaturalness: 40,
  overall: 53,
};
const aiResult = {
  overallScore: 72,
  scores: {
    technical: { overall: 72 },
    brand: {
      overall: 72,
      styleAlignment: 72,
      messageAlignment: 72,
      toneAlignment: 72,
    },
    engagement: {
      overall: 72,
      viralityPotential: 72,
      emotionalAppeal: 72,
      shareability: 72,
      platformFit: 72,
    },
    persuasion,
  },
  analysis: {
    strengths: [
      'The opening contrasts a familiar editing delay with the demonstrated result.',
    ],
    weaknesses: [],
    suggestions: [],
    aiModel: 'isolated-fixture',
  },
};

interface FixtureEvaluatorResult
  extends Omit<typeof aiResult, 'analysis' | 'scores'> {
  analysis?: typeof aiResult.analysis;
  scores: IEvaluationScores;
}

// Explicit isolated databases only. Content adapters use the real BaseService/Prisma
// read implementation; evaluator, billing and unrelated domain dependencies stay test-only.
describe.skipIf(!databaseUrl || !redisUrl)(
  'Persisted evaluation real Nest/controller/DB/tagged-cache integration (#4616)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let redis: Redis;
    let cache: CacheService;
    let evaluations: EvaluationsService;
    let user: AuthenticatedUser;
    let foreignUser: AuthenticatedUser;
    const suffix = randomUUID();
    const ids = {
      user: `ev-api-user-${suffix}`,
      org: `ev-api-org-${suffix}`,
      foreignOrg: `ev-api-foreign-${suffix}`,
      brand: `ev-api-brand-${suffix}`,
      foreignBrand: `ev-api-foreign-brand-${suffix}`,
      video: `ev-api-video-${suffix}`,
      videoMetadata: `ev-api-video-meta-${suffix}`,
      imageMetadata: `ev-api-image-meta-${suffix}`,
      image: `ev-api-image-${suffix}`,
      post: `ev-api-post-${suffix}`,
      article: `ev-api-article-${suffix}`,
    };
    const ownCacheKeys = new Set<string>();
    const fixtures: Record<string, unknown> = {};
    const logger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const evaluator = vi.fn(
      async (): Promise<FixtureEvaluatorResult> => aiResult,
    );
    const operations = {
      evaluateImage: evaluator,
      evaluateVideo: evaluator,
      evaluateArticle: evaluator,
      evaluatePost: evaluator,
    };
    const credits = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
      deductCreditsFromOrganization: vi.fn(),
      refundOrganizationCredits: vi.fn(),
    };
    const websocket = { emit: vi.fn() };
    const get = (url: string) => request(app.getHttpServer()).get(url);
    const decoded = (body: Parameters<typeof getDeserializer>[0]) =>
      getDeserializer(body);
    beforeAll(async () => {
      if (!databaseUrl || !redisUrl)
        throw new Error('Explicit isolated DB/Redis URLs required');
      const parsed = new URL(redisUrl);
      if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname))
        throw new Error('Use a dedicated local test Redis instance');
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      await new Promise<void>((resolve, reject) => {
        redis.once('ready', resolve);
        redis.once('error', reject);
      });
      const config = {
        get: (key: string) =>
          key === 'DATABASE_URL' ? databaseUrl : undefined,
        mediaUrlConfig: { cdnUrl: 'https://fixture.test' },
        cdnUrl: 'https://fixture.test',
        ingredientsEndpoint: 'https://fixture.test',
      } as unknown as ConfigService;
      prisma = new PrismaService(config);
      const cacheClient = {
        instance: redis,
        get isReady() {
          return redis.status === 'ready';
        },
      } as unknown as CacheClientService;
      const tags = new CacheTagsService(
        cacheClient,
        logger as unknown as LoggerService,
      );
      cache = new CacheService(
        cacheClient,
        tags,
        logger as unknown as LoggerService,
      );
      const setTags = tags.setTags.bind(tags);
      vi.spyOn(tags, 'setTags').mockImplementation(async (key, names) => {
        ownCacheKeys.add(key);
        return setTags(key, names);
      });
      class FixtureReadService extends BaseService<object> {}
      const ingredients = new FixtureReadService(
        prisma,
        'ingredient',
        logger as unknown as LoggerService,
        config,
      );
      const articles = new FixtureReadService(
        prisma,
        'article',
        logger as unknown as LoggerService,
        config,
      );
      const posts = new FixtureReadService(
        prisma,
        'post',
        logger as unknown as LoggerService,
        config,
      );
      const postReads = {
        findOne: posts.findOne.bind(posts),
        findAll: posts.findAll.bind(posts),
        getChildren: (id: string) =>
          prisma.post.findMany({
            where: { parentId: id, organizationId: ids.org, isDeleted: false },
          }),
      };
      evaluations = new EvaluationsService(
        prisma,
        logger as unknown as LoggerService,
        operations as never,
        credits as never,
        websocket as never,
        { resolveDispatch: vi.fn().mockResolvedValue(undefined) } as never,
        ingredients as never,
        ingredients as never,
        articles as never,
        postReads as never,
        config,
        undefined,
        cache,
      );
      const module = await Test.createTestingModule({
        controllers: [
          ImagesController,
          VideosController,
          IngredientsController,
          PostsController,
          ArticlesController,
          EvaluationsController,
        ],
        providers: [
          ContentEvaluationProjectionService,
          RedisCacheInterceptor,
          Reflector,
          { provide: PrismaService, useValue: prisma },
          { provide: LoggerService, useValue: logger },
          { provide: ConfigService, useValue: config },
          { provide: CacheService, useValue: cache },
          { provide: EvaluationsService, useValue: evaluations },
          { provide: ImagesService, useValue: ingredients },
          { provide: VideosService, useValue: ingredients },
          { provide: IngredientsService, useValue: ingredients },
          { provide: ArticlesService, useValue: articles },
          { provide: PostsService, useValue: postReads },
          {
            provide: VotesService,
            useValue: { findOne: vi.fn().mockResolvedValue(null) },
          },
          {
            provide: PostAnalyticsService,
            useValue: {
              getPostAnalyticsSummary: vi.fn().mockResolvedValue(null),
            },
          },
        ],
      })
        .useMocker(() => ({}))
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication();
      user = {
        id: ids.user,
        userId: ids.user,
        organizationId: ids.org,
        brandId: ids.brand,
      };
      foreignUser = {
        ...user,
        id: `${ids.user}-foreign`,
        userId: `${ids.user}-foreign`,
        organizationId: ids.foreignOrg,
        brandId: ids.foreignBrand,
      };
      app.use(
        (
          req: Request & { user?: AuthenticatedUser },
          _res: Response,
          next: NextFunction,
        ) => {
          req.user = req.headers['x-test-foreign'] ? foreignUser : user;
          next();
        },
      );
      app.useGlobalPipes(new ValidationPipe({ transform: true }));
      app.useGlobalInterceptors(module.get(RedisCacheInterceptor));
      await app.init();
      await prisma.user.create({ data: { id: ids.user, handle: ids.user } });
      for (const id of [ids.org, ids.foreignOrg])
        await prisma.organization.create({
          data: { id, userId: ids.user, label: id, slug: id },
        });
      for (const [id, organizationId] of [
        [ids.brand, ids.org],
        [ids.foreignBrand, ids.foreignOrg],
      ])
        await prisma.brand.create({
          data: { id, organizationId, userId: ids.user, label: id, slug: id },
        });
      for (const [id, label, extension] of [
        [ids.videoMetadata, 'Persisted video', 'MP4'],
        [ids.imageMetadata, 'Persisted image', 'PNG'],
      ] as const) {
        await prisma.metadata.create({
          data: {
            id,
            label,
            extension,
            width: 108,
            height: 192,
            duration: 2,
            result: `https://fixture.test/${extension.toLowerCase()}`,
          },
        });
      }
      for (const [id, category] of [
        [ids.video, 'VIDEO'],
        [ids.image, 'IMAGE'],
      ] as const)
        await prisma.ingredient.create({
          data: {
            id,
            metadataId:
              category === 'VIDEO' ? ids.videoMetadata : ids.imageMetadata,
            category,
            status: IngredientStatus.GENERATED,
            organizationId: ids.org,
            brandId: ids.brand,
            userId: ids.user,
            s3Key: `fixtures/${id}`,
          },
        });
      await prisma.post.create({
        data: {
          id: ids.post,
          organizationId: ids.org,
          brandId: ids.brand,
          userId: ids.user,
          label: 'Saved post',
          description: 'Saved post content',
        },
      });
      await prisma.article.create({
        data: {
          id: ids.article,
          organizationId: ids.org,
          brandId: ids.brand,
          userId: ids.user,
          label: 'Saved article',
          content: 'Saved article content',
        },
      });
    }, 60_000);
    afterAll(async () => {
      if (prisma) {
        await prisma.evaluation.deleteMany({
          where: { organizationId: { in: [ids.org, ids.foreignOrg] } },
        });
        await prisma.ingredient.deleteMany({
          where: { organizationId: ids.org },
        });
        await prisma.metadata.deleteMany({
          where: { id: { startsWith: `ev-api-`, endsWith: suffix } },
        });
        await prisma.post.deleteMany({ where: { id: ids.post } });
        await prisma.article.deleteMany({ where: { id: ids.article } });
        await prisma.brand.deleteMany({
          where: { id: { in: [ids.brand, ids.foreignBrand] } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: [ids.org, ids.foreignOrg] } },
        });
        await prisma.user.deleteMany({ where: { id: ids.user } });
      }
      if (redis) {
        for (const key of ownCacheKeys) {
          await redis.del(key);
          for (const tag of [
            'images',
            'videos',
            'ingredients',
            'posts',
            'articles',
          ])
            await redis.srem(`tag:${tag}`, key);
        }
        await redis.quit();
      }
      await app?.close();
      await prisma?.$disconnect();
    });
    it('persists through actual evaluation endpoints then reopens all detail/list serializers', async () => {
      for (const route of [
        `/videos/${ids.video}`,
        '/videos?lightweight=true',
        '/ingredients',
      ]) {
        fixtures[`initial:${route}`] = (await get(route).expect(200)).body;
      }
      for (const [route, type, id] of [
        ['images', IngredientCategory.IMAGE, ids.image],
        ['videos', IngredientCategory.VIDEO, ids.video],
        ['articles', 'article', ids.article],
        ['posts', 'post', ids.post],
      ] as const) {
        const created = await request(app.getHttpServer())
          .post(`/evaluations/${route}/${id}`)
          .send({})
          .expect(201);
        const saved = await prisma.evaluation.findFirstOrThrow({
          where: {
            contentType: type,
            contentId: id,
            organizationId: ids.org,
            isDeleted: false,
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (type === 'post')
          await vi.waitFor(async () => {
            const latest = await prisma.evaluation.findUniqueOrThrow({
              where: { id: saved.id },
            });
            expect((latest.data as Record<string, unknown>).status).toBe(
              Status.COMPLETED,
            );
          });
        const current = await prisma.evaluation.findUniqueOrThrow({
          where: { id: saved.id },
        });
        const reopened = await get(`/${route}/${id}`).expect(200);
        expect(decoded(reopened.body)).toMatchObject({
          id,
          evaluation: {
            id: saved.id,
            contentType: type,
            contentId: id,
            data: current.data,
          },
        });
        fixtures[`/${route}/${id}`] = reopened.body;
        fixtures[`/evaluations/${route}/${id}`] = created.body;
      }
      for (const route of [
        '/videos?lightweight=true',
        '/videos?latest=true',
        '/images?latest=true',
        '/ingredients',
        '/posts',
      ]) {
        const response = await get(route).expect(200);
        const data = decoded(response.body);
        expect(data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              evaluation: expect.objectContaining({
                id: expect.any(String),
                data: expect.objectContaining({ status: 'completed' }),
              }),
            }),
          ]),
        );
        fixtures[route] = response.body;
      }
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });
    it('warms actual response tags then observes committed new, failed, review and authorized soft-delete winners', async () => {
      const urls = [
        `/videos/${ids.video}`,
        '/videos?lightweight=true',
        '/ingredients',
      ];
      for (const url of urls) await get(url).expect(200);
      const videoKeys = await redis.smembers('tag:videos');
      const ingredientKeys = await redis.smembers('tag:ingredients');
      expect(videoKeys.length).toBeGreaterThan(0);
      expect(ingredientKeys.length).toBeGreaterThan(0);
      const created = await request(app.getHttpServer())
        .post(`/evaluations/videos/${ids.video}`)
        .send({})
        .expect(201);
      const id = created.body.data.id as string;
      expect(await redis.smembers('tag:videos')).toEqual([]);
      expect(await redis.smembers('tag:ingredients')).toEqual([]);
      for (const url of urls)
        expect(JSON.stringify((await get(url).expect(200)).body)).toContain(id);
      await evaluations.recordReviewerFeedback(id, ids.org, ids.user, {
        comment: 'Saved reviewer update',
      });
      expect(await redis.smembers('tag:videos')).toEqual([]);
      expect(
        decoded((await get(`/videos/${ids.video}`).expect(200)).body),
      ).toMatchObject({
        evaluation: {
          id,
          data: { review: { comment: 'Saved reviewer update' } },
        },
      });
      await evaluations.patch(id, {
        data: { brandId: ids.brand, status: 'failed' } as Prisma.InputJsonValue,
      });
      expect(
        decoded((await get(`/videos/${ids.video}`).expect(200)).body),
      ).toMatchObject({ evaluation: { id, data: { status: 'failed' } } });
      const before = await prisma.evaluation.findUniqueOrThrow({
        where: { id },
      });
      await request(app.getHttpServer())
        .delete(`/evaluations/${id}`)
        .set('x-test-foreign', 'true');
      expect(
        await prisma.evaluation.findUniqueOrThrow({ where: { id } }),
      ).toEqual(before);
      await request(app.getHttpServer())
        .delete(`/evaluations/${id}`)
        .expect(200);
      expect(
        (await prisma.evaluation.findUniqueOrThrow({ where: { id } }))
          .isDeleted,
      ).toBe(true);
      const remaining = await prisma.evaluation.findFirstOrThrow({
        where: {
          organizationId: ids.org,
          contentId: ids.video,
          contentType: 'video',
          isDeleted: false,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      });
      expect(
        decoded((await get(`/videos/${ids.video}`).expect(200)).body),
      ).toMatchObject({ evaluation: { id: remaining.id } });
    });
    it('exports API-shaped persisted fixtures for the actual-route browser lineage test', async () => {
      if (!outputPath) return;
      for (const variant of [
        'score-only',
        'no-persuasion',
        'failed',
        'processing',
      ] as const) {
        const id = `ev-api-${variant}-${suffix}`;
        const metadataId = `ev-api-meta-${variant}-${suffix}`;
        await prisma.metadata.create({
          data: {
            id: metadataId,
            label: `Persisted ${variant}`,
            extension: 'MP4',
            width: 108,
            height: 192,
            duration: 2,
            result: 'https://fixture.test/mp4',
          },
        });
        await prisma.ingredient.create({
          data: {
            id,
            metadataId,
            organizationId: ids.org,
            brandId: ids.brand,
            userId: ids.user,
            category: 'VIDEO',
            status: IngredientStatus.GENERATED,
            s3Key: `fixtures/${id}`,
          },
        });
        const { persuasion: _persuasion, ...withoutPersuasion } =
          aiResult.scores;
        evaluator.mockResolvedValueOnce({
          ...aiResult,
          analysis: undefined,
          scores:
            variant === 'no-persuasion' ? withoutPersuasion : aiResult.scores,
        });
        const created = await request(app.getHttpServer())
          .post(`/evaluations/videos/${id}`)
          .send({})
          .expect(201);
        if (variant === 'failed' || variant === 'processing') {
          await evaluations.patch(created.body.data.id, {
            data: {
              ...aiResult,
              brandId: ids.brand,
              status: variant,
            } as Prisma.InputJsonValue,
          });
        }
        fixtures[`/videos/${id}`] = (
          await get(`/videos/${id}`).expect(200)
        ).body;
      }
      fixtures['/videos?lightweight=true'] = (
        await get('/videos?lightweight=true').expect(200)
      ).body;
      fixtures['/ingredients'] = (await get('/ingredients').expect(200)).body;
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        JSON.stringify({ ids, user, persuasion, fixtures }, null, 2),
      );
    });
  },
);

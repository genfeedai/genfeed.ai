import 'reflect-metadata';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import type { EvaluationDocument } from '@api/collections/evaluations/schemas/evaluation.schema';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { CacheService } from '@api/services/cache/cache.service';
import { CacheClientService } from '@api/services/cache/cache-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  EvaluationType,
  IngredientCategory,
  Status,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Global, Module, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

function fixture(withCache = true) {
  const order: string[] = [];
  const evaluation: EvaluationDocument = {
    id: 'evaluation',
    organizationId: 'org',
    userId: 'user',
    contentType: IngredientCategory.VIDEO,
    contentId: 'content',
    data: {
      status: Status.COMPLETED,
      overallScore: 80,
      scores: { engagement: { overall: 80 } },
    },
    isDeleted: false,
    createdAt: new Date(0),
    updatedAt: new Date(1),
  };
  let persisted = evaluation;
  const create = vi.fn(async ({ data }: Prisma.EvaluationCreateArgs) => {
    order.push('write');
    persisted = { ...persisted, ...(data as Partial<EvaluationDocument>) };
    return persisted;
  });
  const update = vi.fn(async ({ data }: Prisma.EvaluationUpdateArgs) => {
    order.push(
      `update:${(data.data as Record<string, unknown> | undefined)?.status ?? 'patch'}`,
    );
    persisted = { ...persisted, ...(data as Partial<EvaluationDocument>) };
    return persisted;
  });
  const prisma = {
    evaluation: {
      create,
      update,
      findFirst: vi.fn(async () => persisted),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const logger = {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const cache = {
    invalidateByTags: vi.fn(async () => {
      order.push('cache');
    }),
  };
  const ai = { overallScore: 80, scores: { engagement: { overall: 80 } } };
  const evaluate = vi.fn(
    async (
      _content: unknown,
      _context: unknown,
      _organization: string,
      charge: (amount: number) => void,
    ) => {
      order.push('provider');
      charge(2);
      return ai;
    },
  );
  const operations = {
    evaluateVideo: evaluate,
    evaluateImage: evaluate,
    evaluateArticle: evaluate,
    evaluatePost: evaluate,
  };
  const credits = {
    deductCreditsFromOrganization: vi.fn(async () => {
      order.push('settle');
    }),
    refundOrganizationCredits: vi.fn(async () => {
      order.push('refund');
    }),
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
  };
  const websocket = {
    emit: vi.fn(async (_event: string, data: { status: Status }) => {
      order.push(`event:${data.status}`);
    }),
  };
  const content = {
    findOne: vi.fn().mockResolvedValue({
      id: 'content',
      s3Key: 'fixture',
      content: 'Saved article',
      label: 'Saved',
      text: 'Saved post',
      description: 'Saved post',
      category: 'text',
    }),
    getChildren: vi.fn().mockResolvedValue([]),
  };
  const dispatch = { resolveDispatch: vi.fn().mockResolvedValue(undefined) };
  const service = new EvaluationsService(
    prisma as never,
    logger as never,
    operations as never,
    credits as never,
    websocket as never,
    dispatch as never,
    content as never,
    content as never,
    content as never,
    content as never,
    undefined,
    undefined,
    withCache ? (cache as never) : undefined,
  );
  return {
    service,
    evaluation,
    prisma,
    logger,
    cache,
    operations,
    credits,
    websocket,
    content,
    dispatch,
    order,
  };
}
function rejectCache(f: ReturnType<typeof fixture>) {
  f.cache.invalidateByTags.mockImplementation(async () => {
    f.order.push('cache');
    throw new Error('cache offline');
  });
}

const run = (
  service: EvaluationsService,
  type: 'image' | 'video' | 'article',
) => {
  if (type === 'image')
    return service.evaluateImage(
      'content',
      EvaluationType.PRE_PUBLICATION,
      'org',
      'user',
      'brand',
    );
  if (type === 'article')
    return service.evaluateArticle(
      'content',
      EvaluationType.PRE_PUBLICATION,
      'org',
      'user',
      'brand',
    );
  return service.evaluateVideo(
    'content',
    EvaluationType.PRE_PUBLICATION,
    'org',
    'user',
    'brand',
  );
};

describe('Evaluation committed-content cache invalidation (#4616)', () => {
  it.each(['image', 'video', 'article'] as const)(
    'invalidates %s after write and before unchanged settlement',
    async (type) => {
      const f = fixture();
      const row = await run(f.service, type);
      expect(f.cache.invalidateByTags).toHaveBeenCalledWith(
        type === 'article' ? ['articles'] : [`${type}s`, 'ingredients'],
      );
      expect(f.order).toEqual(['provider', 'write', 'cache', 'settle']);
      expect(row).toBe(await f.prisma.evaluation.create.mock.results[0]?.value);
      expect(row.data).toMatchObject({ status: Status.COMPLETED });
    },
  );
  it.each(['image', 'video', 'article'] as const)(
    'contains cache rejection without repeating %s provider or charge',
    async (type) => {
      const f = fixture();
      rejectCache(f);
      const row = await run(f.service, type);
      expect((row.data as Record<string, unknown>).status).toBe(
        Status.COMPLETED,
      );
      expect(f.operations.evaluateVideo).toHaveBeenCalledTimes(1);
      expect(f.credits.deductCreditsFromOrganization).toHaveBeenCalledTimes(1);
      expect(f.credits.refundOrganizationCredits).not.toHaveBeenCalled();
      expect(f.prisma.evaluation.update).not.toHaveBeenCalled();
      expect(f.logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          evaluationId: row.id,
          contentType:
            type === 'article'
              ? 'article'
              : type === 'image'
                ? IngredientCategory.IMAGE
                : IngredientCategory.VIDEO,
          contentId: 'content',
        }),
      );
    },
  );
  it('does not invalidate when creation rejects', async () => {
    const f = fixture();
    f.prisma.evaluation.create.mockRejectedValue(new Error('write failed'));
    await expect(run(f.service, 'video')).rejects.toThrow('write failed');
    expect(f.cache.invalidateByTags).not.toHaveBeenCalled();
    expect(f.credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });
  it('publishes processing then completion, containing cache failure at both boundaries', async () => {
    const f = fixture();
    rejectCache(f);
    const row = await f.service.evaluatePost(
      'content',
      EvaluationType.PRE_PUBLICATION,
      'org',
      'user',
      'brand',
    );
    expect((row.data as Record<string, unknown>).status).toBe(
      Status.PROCESSING,
    );
    await vi.waitFor(() =>
      expect(f.websocket.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: Status.COMPLETED }),
      ),
    );
    expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(2);
    expect(f.cache.invalidateByTags).toHaveBeenCalledWith(['posts']);
    expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
    expect(f.credits.refundOrganizationCredits).not.toHaveBeenCalled();
    expect(f.operations.evaluatePost).toHaveBeenCalledTimes(1);
    expect(f.credits.deductCreditsFromOrganization).toHaveBeenCalledTimes(1);
    expect(f.order).toEqual([
      'write',
      'cache',
      'provider',
      'settle',
      'update:completed',
      'cache',
      'event:completed',
    ]);
  });
  it('keeps genuine failure/refund behavior once when completion persistence and failed-cache invalidation reject', async () => {
    const f = fixture();
    rejectCache(f);
    f.prisma.evaluation.update.mockRejectedValueOnce(
      new Error('completion write failed'),
    );
    await f.service.evaluatePost(
      'content',
      EvaluationType.PRE_PUBLICATION,
      'org',
      'user',
      'brand',
    );
    await vi.waitFor(() =>
      expect(f.websocket.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: Status.FAILED,
          error: 'completion write failed',
        }),
      ),
    );
    expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(2);
    expect(f.credits.refundOrganizationCredits).toHaveBeenCalledTimes(1);
    expect(f.operations.evaluatePost).toHaveBeenCalledTimes(1);
    expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(2);
    expect(f.order).toEqual([
      'write',
      'cache',
      'provider',
      'settle',
      'update:failed',
      'cache',
      'refund',
      'event:failed',
    ]);
  });
  it.each([
    ['post', ['posts']],
    ['article', ['articles']],
    [IngredientCategory.VIDEO, ['videos', 'ingredients']],
    [IngredientCategory.IMAGE, ['images', 'ingredients']],
  ] as const)(
    'runs the actual inherited patch once and uses committed %s identity',
    async (type, tags) => {
      const f = fixture();
      f.prisma.evaluation.update.mockResolvedValue({
        ...f.evaluation,
        contentType: type,
        isDeleted: true,
      });
      const result = await f.service.patch('evaluation', { isDeleted: true }, [
        'user',
      ]);
      expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
      expect(f.prisma.evaluation.update).toHaveBeenCalledWith({
        where: { id: 'evaluation' },
        data: { isDeleted: true },
        include: { user: true },
      });
      expect(f.cache.invalidateByTags).toHaveBeenCalledWith([...tags]);
      expect(result).toBe(
        await f.prisma.evaluation.update.mock.results[0]?.value,
      );
      expect(result.data).toEqual(f.evaluation.data);
      expect(Reflect.get(f.service, 'cacheService')).toBeUndefined();
    },
  );
  it('preserves invalid patch, rejected persistence and unknown target semantics', async () => {
    const f = fixture();
    await expect(f.service.patch('', {})).rejects.toThrow();
    await expect(
      f.service.patch('evaluation', null as never),
    ).rejects.toThrow();
    expect(f.prisma.evaluation.update).not.toHaveBeenCalled();
    f.prisma.evaluation.update.mockRejectedValueOnce(new Error('missing row'));
    await expect(f.service.patch('missing', {})).rejects.toThrow('missing row');
    expect(f.cache.invalidateByTags).not.toHaveBeenCalled();
    f.prisma.evaluation.update.mockResolvedValue({
      ...f.evaluation,
      contentType: 'unsupported',
    });
    await f.service.patch('evaluation', {});
    expect(f.cache.invalidateByTags).not.toHaveBeenCalled();
  });
  it('invalidates review and performance writes without changing returned rows', async () => {
    const f = fixture();
    const reviewed = await f.service.recordReviewerFeedback(
      'evaluation',
      'org',
      'user',
      { comment: 'Saved reviewer observation' },
    );
    expect(reviewed).toBe(
      await f.prisma.evaluation.update.mock.results[0]?.value,
    );
    const synced = await f.service.syncPostPublicationPerformance(
      'evaluation',
      'org',
      { views: 100, likes: 5 },
    );
    expect(synced).toBe(
      await f.prisma.evaluation.update.mock.results[1]?.value,
    );
    expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(2);
  });

  it('awaits the processing cache attempt before starting background evaluation', async () => {
    const f = fixture();
    let release: () => void = () => {};
    f.cache.invalidateByTags.mockImplementationOnce(() => {
      f.order.push('cache:pending');
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = f.service.evaluatePost(
      'content',
      EvaluationType.PRE_PUBLICATION,
      'org',
      'user',
      'brand',
    );
    await vi.waitFor(() =>
      expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(1),
    );
    expect(f.order).toEqual(['write', 'cache:pending']);
    expect(f.operations.evaluatePost).not.toHaveBeenCalled();
    expect(f.websocket.emit).not.toHaveBeenCalled();
    release();
    await pending;
    await vi.waitFor(() => expect(f.websocket.emit).toHaveBeenCalledTimes(1));
    expect(f.order).toEqual([
      'write',
      'cache:pending',
      'provider',
      'settle',
      'update:completed',
      'cache',
      'event:completed',
    ]);
  });
  it.each([Status.COMPLETED, Status.FAILED])(
    'awaits the persisted %s cache attempt before its websocket event',
    async (status) => {
      const f = fixture();
      if (status === Status.FAILED)
        f.operations.evaluatePost.mockRejectedValueOnce(
          new Error('genuine provider failure'),
        );
      let rejectPending: (error: Error) => void = () => {};
      f.cache.invalidateByTags
        .mockImplementationOnce(async () => {
          f.order.push('cache:processing');
        })
        .mockImplementationOnce(() => {
          f.order.push(`cache:${status}:pending`);
          return new Promise<void>((_resolve, reject) => {
            rejectPending = reject;
          });
        });
      await f.service.evaluatePost(
        'content',
        EvaluationType.PRE_PUBLICATION,
        'org',
        'user',
        'brand',
      );
      await vi.waitFor(() =>
        expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(2),
      );
      expect(f.websocket.emit).not.toHaveBeenCalled();
      expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
      expect(f.order.at(-2)).toBe(`update:${status}`);
      expect(f.order.at(-1)).toBe(`cache:${status}:pending`);
      rejectPending(new Error('cache offline'));
      await vi.waitFor(() =>
        expect(f.websocket.emit).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ status }),
        ),
      );
      expect(f.order.at(-1)).toBe(`event:${status}`);
      expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
      expect(f.operations.evaluatePost).toHaveBeenCalledTimes(1);
      expect(f.credits.refundOrganizationCredits).not.toHaveBeenCalled();
    },
  );
  it('keeps a successful inherited patch unchanged when its content cache rejects', async () => {
    const f = fixture();
    rejectCache(f);
    const result = await f.service.patch('evaluation', { isDeleted: true }, [
      'user',
    ]);
    expect(result).toBe(
      await f.prisma.evaluation.update.mock.results[0]?.value,
    );
    expect(result.isDeleted).toBe(true);
    expect(f.order).toEqual(['update:patch', 'cache']);
    expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
    expect(f.credits.refundOrganizationCredits).not.toHaveBeenCalled();
    expect(f.operations.evaluateVideo).not.toHaveBeenCalled();
    expect(f.websocket.emit).not.toHaveBeenCalled();
  });
  it.each(['review', 'performance'] as const)(
    'keeps successful %s mutation unchanged when its cache rejects',
    async (kind) => {
      const f = fixture();
      rejectCache(f);
      const result =
        kind === 'review'
          ? await f.service.recordReviewerFeedback(
              'evaluation',
              'org',
              'user',
              { comment: 'Saved observation' },
            )
          : await f.service.syncPostPublicationPerformance(
              'evaluation',
              'org',
              { views: 100, likes: 5 },
            );
      expect(result).toBe(
        await f.prisma.evaluation.update.mock.results[0]?.value,
      );
      expect(f.order).toEqual(['update:completed', 'cache']);
      expect(f.prisma.evaluation.update).toHaveBeenCalledTimes(1);
      expect(f.cache.invalidateByTags).toHaveBeenCalledTimes(1);
      expect(f.credits.refundOrganizationCredits).not.toHaveBeenCalled();
      expect(f.credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
      expect(f.operations.evaluateVideo).not.toHaveBeenCalled();
      expect(f.websocket.emit).not.toHaveBeenCalled();
    },
  );
  it('retains legacy isolated construction without a cache dependency', async () => {
    const f = fixture(false);
    await expect(run(f.service, 'video')).resolves.toMatchObject({
      data: { status: Status.COMPLETED },
    });
    expect(f.cache.invalidateByTags).not.toHaveBeenCalled();
  });
  it('resolves the real CacheModule service through the actual EvaluationsModule import', async () => {
    const f = fixture();
    const dependencies = [
      { provide: PrismaService, useValue: f.prisma },
      { provide: LoggerService, useValue: f.logger },
      { provide: CreditsUtilsService, useValue: f.credits },
      { provide: NotificationsPublisherService, useValue: f.websocket },
      { provide: TextGenerationCreditsService, useValue: f.dispatch },
    ];
    @Global()
    @Module({
      providers: dependencies,
      exports: dependencies.map((provider) => provider.provide),
    })
    class IsolatedDependencies {}
    @Module({})
    class EmptyDependency {}
    const imports = Reflect.getMetadata('imports', EvaluationsModule) as Type[];
    expect(imports).toContain(CacheModule);
    let builder = Test.createTestingModule({
      imports: [IsolatedDependencies, EvaluationsModule],
    });
    for (const imported of imports)
      if (imported !== CacheModule)
        builder = builder.overrideModule(imported).useModule(EmptyDependency);
    const module = await builder
      .overrideProvider(EvaluationsOperationsService)
      .useValue(f.operations)
      .overrideProvider(CacheClientService)
      .useValue({ instance: { status: 'wait' } })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    try {
      const service = module.get(EvaluationsService);
      const cache = module.get(CacheService);
      expect(cache).toBeInstanceOf(CacheService);
      expect(Reflect.get(service, 'evaluationReadCache')).toBe(cache);
      expect(Reflect.get(service, 'cacheService')).toBeUndefined();
    } finally {
      await module.close();
    }
  });
});

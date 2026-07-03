// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Newsletter via the
// light @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime
// import required for BaseService's getModelMeta('newsletter') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

type MockDelegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

// Prisma Newsletter scalar fields after the 20260610010000_reconcile_newsletters
// migration. Writes using keys outside this set (e.g. the legacy Mongo aliases
// `organization`/`approvedByUser`, or pre-reconciliation columns like `title`)
// threw PrismaClientValidationError in production.
const NEWSLETTER_WRITE_FIELDS = new Set([
  'agentRunId',
  'angle',
  'approvedAt',
  'approvedByUserId',
  'brandId',
  'content',
  'contextNewsletterIds',
  'createdAt',
  'generationPrompt',
  'id',
  'isDeleted',
  'label',
  'mongoId',
  'organizationId',
  'publishedAt',
  'publishedByUserId',
  'scheduledFor',
  'sourceRefs',
  'status',
  'summary',
  'topic',
  'updatedAt',
  'userId',
]);

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function expectPrismaValidKeys(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    expect(NEWSLETTER_WRITE_FIELDS).toContain(key);
  }
}

describe('NewslettersService (Prisma schema reconciliation)', () => {
  let service: NewslettersService;
  let delegate: MockDelegate;

  const existingNewsletter = {
    approvedAt: null,
    approvedByUserId: null,
    brandId: ctx.brandId,
    content: 'Body',
    id: 'newsletter-1',
    isDeleted: false,
    label: 'Issue 1',
    organizationId: ctx.organizationId,
    status: 'draft',
    userId: ctx.userId,
  };

  beforeEach(async () => {
    delegate = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(existingNewsletter),
      findFirst: vi.fn().mockResolvedValue(existingNewsletter),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(existingNewsletter),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewslettersService,
        { provide: PrismaService, useValue: { newsletter: delegate } },
        {
          provide: LoggerService,
          useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
        },
        { provide: OpenRouterService, useValue: { chatCompletion: vi.fn() } },
        { provide: BrandsService, useValue: { findOne: vi.fn() } },
      ],
    }).compile();

    service = module.get(NewslettersService);
  });

  it('createScoped writes scalar FK keys, not legacy relation aliases', async () => {
    await service.createScoped(
      {
        content: 'Hello',
        label: 'Issue 1',
        topic: 'Launch',
      } as CreateNewsletterDto,
      ctx,
    );

    const { data } = delegate.create.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data).toMatchObject({
      brandId: ctx.brandId,
      label: 'Issue 1',
      organizationId: ctx.organizationId,
      topic: 'Launch',
      userId: ctx.userId,
    });
    expect(data.organization).toBeUndefined();
    expect(data.user).toBeUndefined();
    expect(data.brand).toBeUndefined();
  });

  it('approveScoped patches approvedByUserId with a valid lowercase status', async () => {
    await service.approveScoped('newsletter-1', ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('approved');
    expect(data.approvedByUserId).toBe(ctx.userId);
    expect(data.approvedByUser).toBeUndefined();
  });

  it('publishScoped patches publishedByUserId/publishedAt with a valid status', async () => {
    await service.publishScoped('newsletter-1', ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('published');
    expect(data.publishedByUserId).toBe(ctx.userId);
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.publishedByUser).toBeUndefined();
  });

  it('archiveScoped writes the archived status', async () => {
    await service.archiveScoped('newsletter-1', ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('archived');
  });

  it('recent published newsletters filter on the lowercase published status and publishedAt', async () => {
    await service.getContextPreview('newsletter-1', ctx);

    const recentQuery = delegate.findMany.mock.calls[0][0];
    expect(recentQuery.where.status).toBe('published');
    expect(recentQuery.orderBy).toEqual([
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });
});

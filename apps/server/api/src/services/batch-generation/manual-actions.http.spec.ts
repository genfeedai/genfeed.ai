import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxSuggestedReplyService } from '@api/collections/social-inbox/services/social-inbox-suggested-reply.service';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { BatchGenerationRewriteService } from '@api/services/batch-generation/batch-generation-rewrite.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { BatchRewriteCreditsGuard } from '@api/services/batch-generation/batch-rewrite-credits.guard';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BatchItemStatus, ReviewDecision } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const conversationId = 'cconversation00000000000001';
const date = new Date('2026-09-27T10:00:00Z');

describe('Manual actions HTTP routes', () => {
  let app: INestApplication;
  let hasCredits = true;
  const enhanceDescription = vi.fn().mockResolvedValue('Rewritten');
  const generateReply = vi.fn().mockResolvedValue('Suggested response');
  const applyRewrites = vi.fn().mockResolvedValue({ id: 'batch-1', items: [] });
  const approveItems = vi.fn().mockResolvedValue({ id: 'batch-1', items: [] });
  const credits = {
    admit: vi.fn(async () => {
      if (!hasCredits) throw new HttpException('Insufficient credits', 402);
      return true;
    }),
    canActivate: vi.fn(async () => {
      if (!hasCredits) throw new HttpException('Insufficient credits', 402);
      return true;
    }),
  };
  const db = {
    batch: {
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: { organizationId: string; isDeleted: boolean };
        }) =>
          where.organizationId === 'org-1' && where.isDeleted === false
            ? {
                id: 'batch-1',
                brandId: 'brand-1',
                updatedAt: date,
                items: [
                  {
                    id: 'item-1',
                    platform: 'linkedin',
                    caption: 'Old',
                    status: BatchItemStatus.COMPLETED,
                    reviewDecision: ReviewDecision.UNSET,
                  },
                ],
              }
            : null,
      ),
    },
    post: { findMany: vi.fn().mockResolvedValue([]) },
    socialConversation: {
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: { organizationId: string; isDeleted: boolean };
        }) =>
          where.organizationId === 'org-1' && where.isDeleted === false
            ? {
                id: conversationId,
                brandId: 'brand-1',
                platform: 'linkedin',
                conversationType: 'dm',
              }
            : null,
      ),
    },
    socialMessage: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { body: 'Hello', direction: 'inbound', senderName: 'Taylor' },
        ]),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BatchGenerationController, SocialInboxController],
      providers: [
        BatchGenerationRewriteService,
        BatchRewriteCreditsGuard,
        SocialInboxSuggestedReplyService,
        { provide: BatchGenerationService, useValue: { approveItems } },
        { provide: BatchGenerationWorkflowService, useValue: {} },
        { provide: BatchGenerationReviewService, useValue: { applyRewrites } },
        {
          provide: ActivityRecorderService,
          useValue: {
            record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
            update: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { publishBackgroundTaskUpdate: vi.fn() },
        },
        { provide: PostGenerationService, useValue: { enhanceDescription } },
        {
          provide: ReplyGenerationService,
          useValue: {
            generateReply,
            assertCreditsAvailable: async () => {
              if (!hasCredits)
                throw new HttpException('Insufficient credits', 402);
            },
          },
        },
        { provide: SocialInboxService, useValue: {} },
        { provide: SocialInboxSyncWorkflowService, useValue: {} },
        { provide: PrismaService, useValue: db },
        { provide: CreditsGuard, useValue: credits },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue(credits)
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();
    app = module.createNestApplication();
    app.use(
      (
        req: Request & { user?: AuthenticatedUser },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = {
          id: 'user-1',
          userId: 'user-1',
          organizationId: req.header('x-test-org') ?? 'org-1',
          brandId: 'other-ui-brand',
        };
        next();
      },
    );
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    hasCredits = true;
  });

  it('rewrites via the batch action route without approving', async () => {
    await request(app.getHttpServer())
      .post('/batches/batch-1/items/action')
      .send({ action: 'rewrite', itemIds: ['item-1'] })
      .expect(200);
    expect(enhanceDescription).toHaveBeenCalledOnce();
    expect(approveItems).not.toHaveBeenCalled();
    expect(applyRewrites).toHaveBeenCalledOnce();
    expect(credits.admit).toHaveBeenCalledWith(
      expect.objectContaining({ creditsOutputCount: 1 }),
      expect.objectContaining({
        source: 'post-enhance',
        isBodyModelIgnored: true,
      }),
    );
  });
  it('returns 404 across organizations for batch rewrite', async () => {
    await request(app.getHttpServer())
      .post('/batches/batch-1/items/action')
      .set('x-test-org', 'org-2')
      .send({ action: 'rewrite', itemIds: ['item-1'] })
      .expect(404);
    expect(enhanceDescription).not.toHaveBeenCalled();
  });
  it('guards rewrite credits while keeping approval free', async () => {
    hasCredits = false;
    await request(app.getHttpServer())
      .post('/batches/batch-1/items/action')
      .send({ action: 'rewrite', itemIds: ['item-1'] })
      .expect(402);
    expect(enhanceDescription).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/batches/batch-1/items/action')
      .send({ action: 'approve', itemIds: ['item-1'] })
      .expect(200);
    expect(approveItems).toHaveBeenCalledOnce();
  });
  it('returns a serialized suggested reply for the conversation brand', async () => {
    const response = await request(app.getHttpServer())
      .post(`/messages/${conversationId}/suggested-reply`)
      .send({})
      .expect(200);
    expect(response.body.data.attributes.draft).toBe('Suggested response');
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        platform: 'linkedin',
        conversationType: 'dm',
      }),
    );
  });
  it('returns 404 across organizations for suggested replies', async () => {
    await request(app.getHttpServer())
      .post(`/messages/${conversationId}/suggested-reply`)
      .set('x-test-org', 'org-2')
      .send({})
      .expect(404);
    expect(generateReply).not.toHaveBeenCalled();
  });
  it('blocks suggested replies without credits', async () => {
    hasCredits = false;
    await request(app.getHttpServer())
      .post(`/messages/${conversationId}/suggested-reply`)
      .send({})
      .expect(402);
    expect(generateReply).not.toHaveBeenCalled();
    expect(db.socialMessage.findMany).not.toHaveBeenCalled();
  });
});

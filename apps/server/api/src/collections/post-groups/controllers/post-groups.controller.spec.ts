import { NotFoundException } from '@api/exceptions/not-found.exception';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import type { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import { PostGroupBatchService } from '@api/collections/post-groups/services/post-group-batch.service';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, ReleaseStatus } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PostGroupsController', () => {
  let controller: PostGroupsController;
  let service: {
    cancel: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    moveCalendarPlacement: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    publishNow: ReturnType<typeof vi.fn>;
    republishAt: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    ensureReleaseForPost: ReturnType<typeof vi.fn>;
    publishTargetNow: ReturnType<typeof vi.fn>;
    publishTargetViaTikTokApp: ReturnType<typeof vi.fn>;
    scheduleTarget: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateTarget: ReturnType<typeof vi.fn>;
  };
  let recurrenceService: {
    cancelFuture: ReturnType<typeof vi.fn>;
    editFuture: ReturnType<typeof vi.fn>;
    pauseFuture: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
    resumeFuture: ReturnType<typeof vi.fn>;
  };

  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as User;
  const req = {} as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostGroupsController],
      providers: [
        {
          provide: PostGroupsService,
          useValue: {
            cancel: vi.fn().mockResolvedValue({ id: 'group-1' }),
            create: vi.fn().mockResolvedValue({ id: 'group-1' }),
            ensureReleaseForPost: vi.fn().mockResolvedValue({ id: 'group-1' }),
            getOne: vi.fn().mockResolvedValue({ id: 'group-1' }),
            moveCalendarPlacement: vi.fn().mockResolvedValue({ id: 'group-1' }),
            republishAt: vi.fn().mockResolvedValue({ id: 'group-2' }),
            list: vi.fn().mockResolvedValue({
              docs: [{ id: 'group-1' }],
              limit: 1,
              page: 1,
              totalDocs: 1,
              totalPages: 1,
            }),
            pause: vi.fn().mockResolvedValue({ id: 'group-1' }),
            publishNow: vi.fn().mockResolvedValue({ id: 'group-1' }),
            resume: vi.fn().mockResolvedValue({ id: 'group-1' }),
            publishTargetNow: vi.fn().mockResolvedValue({ id: 'group-1' }),
            publishTargetViaTikTokApp: vi
              .fn()
              .mockResolvedValue({ id: 'group-1' }),
            scheduleTarget: vi.fn().mockResolvedValue({ id: 'group-1' }),
            update: vi.fn().mockResolvedValue({ id: 'group-1' }),
            updateTarget: vi.fn().mockResolvedValue({ id: 'group-1' }),
          },
        },
        {
          provide: PostGroupBatchService,
          useValue: {
            assertBrandAccess: async (
              _org: string,
              _releases: unknown[],
              allowed?: string[],
            ) => {
              if (allowed?.[0] === 'brand-limited') {
                throw new NotFoundException('Brand');
              }
            },
            assertBatchShape: (releases: unknown) => {
              if (!Array.isArray(releases) || releases.length === 0) {
                throw new BadRequestException('releases must be non-empty');
              }
            },
            create: async (
              _org: string,
              _user: string,
              releases: unknown[],
              options: { keyBase: string },
            ) => ({
              created: releases.map((_, index) => ({
                index,
                releaseId: `${options.keyBase}:${index}`,
              })),
              errors: [],
            }),
            describe: async () => ({
              brandIds: [],
              brandLabel: null,
              posts: [],
            }),
            validate: async () => [{ index: 1, message: 'no channel' }],
          },
        },
        {
          provide: PostGroupRecurrenceService,
          useValue: {
            cancelFuture: vi.fn().mockResolvedValue({ id: 'group-1' }),
            editFuture: vi.fn().mockResolvedValue({ id: 'group-1' }),
            pauseFuture: vi.fn().mockResolvedValue({ id: 'group-1' }),
            preview: vi.fn().mockResolvedValue({ success: true }),
            resumeFuture: vi.fn().mockResolvedValue({ id: 'group-1' }),
          },
        },
      ],
    }).compile();

    controller = module.get(PostGroupsController);
    service = module.get(PostGroupsService);
    recurrenceService = module.get(PostGroupRecurrenceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates through the service with organization, user, and header idempotency key', async () => {
    const body = {
      baseContent: 'Launch note',
      status: ReleaseStatus.DRAFT,
      targets: [],
      timezone: 'UTC',
      title: 'Launch note',
    };

    const res114 = await controller.create(req, user, body, 'same-request');
    expect(res114).toEqual({ id: 'group-1' });

    expect(service.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      body,
      'same-request',
      undefined,
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('lists release groups through the organization-scoped service boundary', async () => {
    const query = {
      endDate: '2026-07-27T00:00:00.000Z',
      startDate: '2026-07-20T00:00:00.000Z',
    } as PostGroupsQueryDto;

    await expect(controller.findAll(req, user, query)).resolves.toEqual([
      { id: 'group-1' },
    ]);
    expect(service.list).toHaveBeenCalledWith('org-1', query);
  });

  it('routes target updates through the service', async () => {
    const res142 = await controller.updateTarget(
      req,
      user,
      'group-1',
      'target-1',
      {
        timezone: 'UTC',
      },
    );
    expect(res142).toEqual({ id: 'group-1' });

    expect(service.updateTarget).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      { timezone: 'UTC' },
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('routes target schedule through scheduleTarget so a version-bound approval is created', async () => {
    const res160 = await controller.updateTarget(
      req,
      user,
      'group-1',
      'target-1',
      {
        action: 'schedule',
        scheduledDate: '2026-09-01T10:00:00.000Z',
      },
    );
    expect(res160).toEqual({ id: 'group-1' });

    expect(service.scheduleTarget).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      '2026-09-01T10:00:00.000Z',
      { source: 'post-desk' },
    );
    expect(service.updateTarget).not.toHaveBeenCalled();
  });

  it('routes target publish-now through publishTargetNow without a client timestamp', async () => {
    const res177 = await controller.updateTarget(
      req,
      user,
      'group-1',
      'target-1',
      {
        action: 'publish-now',
      },
    );
    expect(res177).toEqual({ id: 'group-1' });

    expect(service.publishTargetNow).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      { source: 'post-desk' },
    );
    expect(service.scheduleTarget).not.toHaveBeenCalled();
    expect(service.updateTarget).not.toHaveBeenCalled();
  });

  it('routes the TikTok app handoff through the dedicated target action', async () => {
    const res193 = await controller.updateTarget(
      req,
      user,
      'group-1',
      'target-1',
      {
        action: 'publish-via-tiktok-app',
      },
    );
    expect(res193).toEqual({ id: 'group-1' });

    expect(service.publishTargetViaTikTokApp).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      { source: 'post-desk' },
    );
    expect(service.publishTargetNow).not.toHaveBeenCalled();
    expect(service.scheduleTarget).not.toHaveBeenCalled();
    expect(service.updateTarget).not.toHaveBeenCalled();
  });

  it.each(['publish-now', 'publish-via-tiktok-app'] as const)(
    'rejects API-key %s with schedule-only scope before publishing',
    async (action) => {
      await expect(
        controller.updateTarget(
          req,
          {
            ...user,
            isApiKey: true,
            scopes: [ApiKeyScope.POSTS_SCHEDULE],
          } as User,
          'group-1',
          'target-1',
          { action },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
          requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
        }),
      });
      expect(service.publishTargetNow).not.toHaveBeenCalled();
      expect(service.publishTargetViaTikTokApp).not.toHaveBeenCalled();
    },
  );

  it('rejects API-key scheduling with publish-only scope before scheduling', async () => {
    await expect(
      controller.updateTarget(
        req,
        {
          ...user,
          isApiKey: true,
          scopes: [ApiKeyScope.POSTS_PUBLISH],
        } as User,
        'group-1',
        'target-1',
        {
          action: 'schedule',
          scheduledDate: '2026-09-01T10:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });
    expect(service.scheduleTarget).not.toHaveBeenCalled();
  });

  it('wraps a desk post into a release group before schedule or publish-now', async () => {
    const res261 = await controller.ensureFromPost(req, user, {
      postId: 'post-1',
    });
    expect(res261).toEqual({ id: 'group-1' });

    expect(service.ensureReleaseForPost).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'post-1',
    );
  });

  it('routes calendar-move and republish through PATCH action bodies', async () => {
    const body = { scheduledDate: '2026-09-01T10:00:00.000Z' };

    const res273 = await controller.update(req, user, 'group-1', {
      action: 'calendar-move',
      ...body,
    });
    expect(res273).toEqual({ id: 'group-1' });
    const res277 = await controller.update(req, user, 'group-1', {
      action: 'republish',
      ...body,
    });
    expect(res277).toEqual({ id: 'group-2' });

    expect(service.moveCalendarPlacement).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      { action: 'calendar-move', ...body },
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(service.republishAt).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      { action: 'republish', ...body },
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(service.update).not.toHaveBeenCalled();
    expect(service.publishNow).not.toHaveBeenCalled();
  });

  it('routes publish-now through PATCH action body', async () => {
    const res307 = await controller.update(req, user, 'group-1', {
      action: 'publish-now',
    });
    expect(res307).toEqual({ id: 'group-1' });

    expect(service.publishNow).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
    );
  });

  it('routes recurrence preview and series lifecycle through PATCH actions', async () => {
    const previewBody = {
      recurrence: { frequency: 'weekly', interval: 1 },
      startAt: '2026-08-03T09:00:00.000Z',
      timezone: 'UTC',
    };

    const res323 = await controller.previewRecurrence(previewBody);
    expect(res323).toEqual({ success: true });
    const res324 = await controller.update(req, user, 'group-1', {
      action: 'series-pause',
    });
    expect(res324).toEqual({ id: 'group-1' });
    const res325 = await controller.update(req, user, 'group-1', {
      action: 'series-resume',
    });
    expect(res325).toEqual({ id: 'group-1' });
    const res326 = await controller.update(req, user, 'group-1', {
      action: 'series-cancel-future',
    });
    expect(res326).toEqual({ id: 'group-1' });
    const res329 = await controller.editFutureSeries(req, user, 'group-1', {
      scheduledDate: '2026-08-12T09:00:00.000Z',
    });
    expect(res329).toEqual({ id: 'group-1' });

    expect(recurrenceService.preview).toHaveBeenCalledWith(previewBody);
    expect(recurrenceService.pauseFuture).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
    );
    expect(recurrenceService.resumeFuture).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
    );
    expect(recurrenceService.cancelFuture).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
    );
    expect(recurrenceService.editFuture).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
      { scheduledDate: '2026-08-12T09:00:00.000Z' },
    );
  });

  describe('release batches', () => {
    it('names the releases a batch would be refused for, creating none', async () => {
      expect(
        await controller.validateBatch(user, { releases: [{}, {}] }),
      ).toEqual({ errors: [{ index: 1, message: 'no channel' }] });
    });

    it('creates every release under the caller key', async () => {
      expect(
        await controller.createBatch(user, {
          idempotencyKey: 'approval-1',
          releases: [{}, {}],
        }),
      ).toEqual({
        created: [
          { index: 0, releaseId: 'approval-1:0' },
          { index: 1, releaseId: 'approval-1:1' },
        ],
        errors: [],
      });
    });

    it('refuses every batch route to a key limited to other brands', async () => {
      const limited = { ...user, allowedBrandIds: ['brand-limited'] };
      await expect(
        controller.validateBatch(limited, { releases: [{}] }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.previewBatch(limited, { releases: [{}] }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.createBatch(limited, {
          idempotencyKey: 'k',
          releases: [{}],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a batch with no idempotency key, or no releases', async () => {
      await expect(
        controller.createBatch(user, { releases: [{}] }),
      ).rejects.toThrow('idempotencyKey is required for a batch.');
      await expect(
        controller.createBatch(user, { idempotencyKey: 'k', releases: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('declares fail-closed publishing scopes on consequential routes', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.create,
      ),
    ).toEqual([ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_SCHEDULE]);
    for (const route of [
      'validateBatch',
      'previewBatch',
      'createBatch',
    ] as const) {
      expect(
        Reflect.getMetadata(
          API_KEY_SCOPES_KEY,
          PostGroupsController.prototype[route],
        ),
      ).toEqual([ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_SCHEDULE]);
    }
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.update,
      ),
    ).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_SCHEDULE,
      ApiKeyScope.POSTS_PUBLISH,
    ]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.updateTarget,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE, ApiKeyScope.POSTS_PUBLISH]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.ensureFromPost,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.editFutureSeries,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.previewRecurrence,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE]);
  });
});

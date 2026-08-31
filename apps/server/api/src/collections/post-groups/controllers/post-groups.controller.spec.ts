vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, ReleaseStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { PostGroupsQueryDto } from '@server/collections/post-groups/dto/post-groups-query.dto';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
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

    await controller.create(req, user, body, 'same-request');

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
    await controller.updateTarget(req, user, 'group-1', 'target-1', {
      timezone: 'UTC',
    });

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
    await controller.updateTarget(req, user, 'group-1', 'target-1', {
      action: 'schedule',
      scheduledDate: '2026-09-01T10:00:00.000Z',
    });

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
    await controller.updateTarget(req, user, 'group-1', 'target-1', {
      action: 'publish-now',
    });

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
    await controller.updateTarget(req, user, 'group-1', 'target-1', {
      action: 'publish-via-tiktok-app',
    });

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
    await controller.ensureFromPost(req, user, { postId: 'post-1' });

    expect(service.ensureReleaseForPost).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'post-1',
    );
  });

  it('routes calendar-move and republish through PATCH action bodies', async () => {
    const body = { scheduledDate: '2026-09-01T10:00:00.000Z' };

    await controller.update(req, user, 'group-1', {
      action: 'calendar-move',
      ...body,
    });
    await controller.update(req, user, 'group-1', {
      action: 'republish',
      ...body,
    });

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
    await controller.update(req, user, 'group-1', { action: 'publish-now' });

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

    await controller.previewRecurrence(previewBody);
    await controller.update(req, user, 'group-1', { action: 'series-pause' });
    await controller.update(req, user, 'group-1', { action: 'series-resume' });
    await controller.update(req, user, 'group-1', {
      action: 'series-cancel-future',
    });
    await controller.editFutureSeries(req, user, 'group-1', {
      scheduledDate: '2026-08-12T09:00:00.000Z',
    });

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

  it('declares fail-closed publishing scopes on consequential routes', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.create,
      ),
    ).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_CREATE,
      ApiKeyScope.POSTS_SCHEDULE,
    ]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.update,
      ),
    ).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_CREATE,
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

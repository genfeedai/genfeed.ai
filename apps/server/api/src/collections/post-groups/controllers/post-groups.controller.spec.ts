vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: 'org-1',
    user: 'user-1',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import type { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, ReleaseStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PostGroupsController', () => {
  let controller: PostGroupsController;
  let service: {
    cancel: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    publishNow: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
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

  const user = { id: 'user-1' } as User;
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
            getOne: vi.fn().mockResolvedValue({ id: 'group-1' }),
            list: vi.fn().mockResolvedValue([{ id: 'group-1' }]),
            pause: vi.fn().mockResolvedValue({ id: 'group-1' }),
            publishNow: vi.fn().mockResolvedValue({ id: 'group-1' }),
            resume: vi.fn().mockResolvedValue({ id: 'group-1' }),
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
      expect.objectContaining({ organization: 'org-1', user: 'user-1' }),
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
      expect.objectContaining({ organization: 'org-1', user: 'user-1' }),
    );
  });

  it('routes publish-now through the service', async () => {
    await controller.publishNow(req, user, 'group-1');

    expect(service.publishNow).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'group-1',
    );
  });

  it('routes recurrence preview and series lifecycle through the scoped service', async () => {
    const previewBody = {
      recurrence: { frequency: 'weekly', interval: 1 },
      startAt: '2026-08-03T09:00:00.000Z',
      timezone: 'UTC',
    };

    await controller.previewRecurrence(previewBody);
    await controller.pauseSeries(req, user, 'group-1');
    await controller.resumeSeries(req, user, 'group-1');
    await controller.cancelFutureSeries(req, user, 'group-1');
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
    for (const handler of [
      PostGroupsController.prototype.cancel,
      PostGroupsController.prototype.cancelFutureSeries,
      PostGroupsController.prototype.editFutureSeries,
      PostGroupsController.prototype.pause,
      PostGroupsController.prototype.pauseSeries,
      PostGroupsController.prototype.previewRecurrence,
      PostGroupsController.prototype.resume,
      PostGroupsController.prototype.resumeSeries,
    ]) {
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([
        ApiKeyScope.POSTS_SCHEDULE,
      ]);
    }
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PostGroupsController.prototype.publishNow,
      ),
    ).toEqual([ApiKeyScope.POSTS_PUBLISH]);
  });
});

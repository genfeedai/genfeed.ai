vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: 'org-1',
    user: 'user-1',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { ReleaseStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PostGroupsController', () => {
  let controller: PostGroupsController;
  let service: {
    cancel: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    publishNow: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateTarget: ReturnType<typeof vi.fn>;
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
            pause: vi.fn().mockResolvedValue({ id: 'group-1' }),
            publishNow: vi.fn().mockResolvedValue({ id: 'group-1' }),
            resume: vi.fn().mockResolvedValue({ id: 'group-1' }),
            update: vi.fn().mockResolvedValue({ id: 'group-1' }),
            updateTarget: vi.fn().mockResolvedValue({ id: 'group-1' }),
          },
        },
      ],
    }).compile();

    controller = module.get(PostGroupsController);
    service = module.get(PostGroupsService);
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
    );
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
});

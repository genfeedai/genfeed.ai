import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ActionOrigin, ActivityKey, ActivitySource } from '@genfeedai/enums';
import { runWithActionOrigin } from '@genfeedai/server';

describe('ActivitiesService action origin', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const streaksService = {
    checkAndUpdate: vi.fn(),
    isQualifyingActivityKey: vi.fn().mockReturnValue(false),
  };

  function makeService() {
    const activity = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        createdAt: new Date(),
        id: 'activity-1',
        isDeleted: false,
        updatedAt: new Date(),
        ...data,
      })),
      findFirst: vi.fn(),
      update: vi.fn(),
    };
    return {
      activity,
      service: new ActivitiesService(
        { activity } as never,
        logger as never,
        streaksService as never,
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists only trusted origin and actor/key references', async () => {
    const { activity, service } = makeService();

    await runWithActionOrigin(
      {
        actorUserId: 'user-1',
        apiKeyId: 'key-1',
        origin: ActionOrigin.MCP,
      },
      () =>
        service.create({
          brand: 'brand-1',
          data: {
            origin: ActionOrigin.UI,
          },
          key: ActivityKey.IMAGE_GENERATED,
          organization: 'org-1',
          source: ActivitySource.IMAGE_GENERATION,
          user: 'user-1',
        } as never),
    );

    expect(activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: {
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          key: ActivityKey.IMAGE_GENERATED,
          origin: ActionOrigin.MCP,
          source: ActivitySource.IMAGE_GENERATION,
        },
      }),
    });
  });

  it('exposes legacy records with explicit unknown origin', async () => {
    const { activity, service } = makeService();
    activity.findFirst.mockResolvedValue({
      action: ActivityKey.POST_PUBLISHED,
      createdAt: new Date(),
      data: { source: ActivitySource.POST },
      id: 'activity-legacy',
      isDeleted: false,
      updatedAt: new Date(),
    });

    const activityRecord = await service.findOne({ id: 'activity-legacy' });

    expect(activityRecord).toMatchObject({
      actorUserId: null,
      apiKeyId: null,
      origin: ActionOrigin.UNKNOWN,
    });
  });

  it('preserves the original provenance on idempotent activity updates', async () => {
    const { activity, service } = makeService();
    activity.findFirst.mockResolvedValue({
      action: ActivityKey.IMAGE_GENERATED,
      data: {
        actorUserId: 'user-1',
        apiKeyId: 'key-1',
        origin: ActionOrigin.MCP,
      },
      id: 'activity-1',
      isDeleted: false,
    });
    activity.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'activity-1',
        ...data,
      }),
    );

    await service.patch('activity-1', { isRead: true });

    expect(activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: 'user-1',
            apiKeyId: 'key-1',
            isRead: true,
            origin: ActionOrigin.MCP,
          }),
        }),
      }),
    );
  });
});

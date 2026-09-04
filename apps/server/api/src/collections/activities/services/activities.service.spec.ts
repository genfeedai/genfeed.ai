import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { runWithActionOrigin } from '@api/index';
import {
  ActionOrigin,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';

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
          brandId: 'brand-1',
          data: {
            origin: ActionOrigin.UI,
          },
          key: ActivityKey.IMAGE_GENERATED,
          organizationId: 'org-1',
          source: ActivitySource.IMAGE_GENERATION,
          userId: 'user-1',
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

  it('preserves a deterministic activity identity', async () => {
    const { activity, service } = makeService();

    await service.create({
      id: 'post-published:post-1',
      key: ActivityKey.POST_PUBLISHED,
      organizationId: 'org-1',
      source: ActivitySource.POST,
      userId: 'user-1',
    } as never);

    expect(activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'post-published:post-1' }),
    });
  });

  it('exposes legacy records with explicit unknown origin', async () => {
    const { activity, service } = makeService();
    activity.findFirst.mockResolvedValue({
      action: ActivityKey.POST_PUBLISHED,
      createdAt: new Date(),
      data: {
        source: ActivitySource.POST,
        value: 'Published to x: https://x.com/1',
      },
      id: 'activity-legacy',
      isDeleted: false,
      updatedAt: new Date(),
    });

    const activityRecord = await service.findOne({ id: 'activity-legacy' });

    expect(activityRecord).toMatchObject({
      actorUserId: null,
      apiKeyId: null,
      // Promote Prisma action/data into the wire-facing key/value/source fields.
      isRead: false,
      key: ActivityKey.POST_PUBLISHED,
      origin: ActionOrigin.UNKNOWN,
      source: ActivitySource.POST,
      value: 'Published to x: https://x.com/1',
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

describe('ActivitiesService batched writes', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const streaksService = {
    checkAndUpdate: vi.fn(),
    isQualifyingActivityKey: vi.fn().mockReturnValue(true),
  };

  function makeService() {
    const activity = {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const $transaction = vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    return {
      $transaction,
      activity,
      service: new ActivitiesService(
        { $transaction, activity } as never,
        logger as never,
        streaksService as never,
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    streaksService.isQualifyingActivityKey.mockReturnValue(true);
  });

  describe('bulkUpdateScoped', () => {
    it('skips the database entirely for an empty id list', async () => {
      const { activity, service } = makeService();

      const result = await service.bulkUpdateScoped({
        ids: [],
        isRead: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(result).toEqual({ failed: [], updated: [] });
      expect(activity.findMany).not.toHaveBeenCalled();
    });

    it('partitions ids with a single owner-or-organization scoped read', async () => {
      const { activity, service } = makeService();
      activity.findMany.mockResolvedValue([
        { data: {}, id: 'activity-1' },
        { data: {}, id: 'activity-2' },
      ]);

      const result = await service.bulkUpdateScoped({
        ids: ['activity-1', 'activity-2', 'activity-foreign'],
        isDeleted: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(activity.findMany).toHaveBeenCalledTimes(1);
      expect(activity.findMany).toHaveBeenCalledWith({
        select: { data: true, id: true },
        where: {
          id: { in: ['activity-1', 'activity-2', 'activity-foreign'] },
          isDeleted: false,
          OR: [{ userId: 'user-1' }, { organizationId: 'org-1' }],
        },
      });
      expect(result).toEqual({
        failed: ['activity-foreign'],
        updated: ['activity-1', 'activity-2'],
      });
    });

    it('collapses a flag-only change to one updateMany', async () => {
      const { $transaction, activity, service } = makeService();
      activity.findMany.mockResolvedValue([
        { data: {}, id: 'activity-1' },
        { data: {}, id: 'activity-2' },
      ]);

      await service.bulkUpdateScoped({
        ids: ['activity-1', 'activity-2'],
        isDeleted: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(activity.updateMany).toHaveBeenCalledTimes(1);
      expect(activity.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          id: { in: ['activity-1', 'activity-2'] },
          isDeleted: false,
          OR: [{ userId: 'user-1' }, { organizationId: 'org-1' }],
        },
      });
      expect($transaction).not.toHaveBeenCalled();
    });

    it('merges isRead into existing data inside a single transaction', async () => {
      const { $transaction, activity, service } = makeService();
      activity.findMany.mockResolvedValue([
        {
          data: { key: ActivityKey.POST_PUBLISHED, origin: ActionOrigin.MCP },
          id: 'activity-1',
        },
      ]);

      await service.bulkUpdateScoped({
        ids: ['activity-1'],
        isRead: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(activity.update).toHaveBeenCalledTimes(1);
      expect(activity.update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            isRead: true,
            key: ActivityKey.POST_PUBLISHED,
            origin: ActionOrigin.MCP,
          }),
        },
        where: { id: 'activity-1' },
      });
      expect(activity.updateMany).not.toHaveBeenCalled();
    });

    it('deduplicates writes but still reports every requested id', async () => {
      const { activity, service } = makeService();
      activity.findMany.mockResolvedValue([{ data: {}, id: 'activity-1' }]);

      const result = await service.bulkUpdateScoped({
        ids: ['activity-1', 'activity-1'],
        isDeleted: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['activity-1'] } }),
        }),
      );
      expect(activity.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: expect.objectContaining({ id: { in: ['activity-1'] } }),
      });
      expect(result.updated).toEqual(['activity-1', 'activity-1']);
    });

    it('never writes when no id passes the scope check', async () => {
      const { $transaction, activity, service } = makeService();
      activity.findMany.mockResolvedValue([]);

      const result = await service.bulkUpdateScoped({
        ids: ['activity-foreign'],
        isDeleted: true,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(activity.updateMany).not.toHaveBeenCalled();
      expect($transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ failed: ['activity-foreign'], updated: [] });
    });
  });

  describe('createMany', () => {
    it('inserts every activity in one statement', async () => {
      const { activity, service } = makeService();
      activity.createMany.mockResolvedValue({ count: 2 });

      const created = await service.createMany([
        {
          entityId: 'post-1',
          key: ActivityKey.POST_PUBLISHED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          entityId: 'post-2',
          key: ActivityKey.POST_PUBLISHED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
      ] as never);

      expect(activity.createMany).toHaveBeenCalledTimes(1);
      expect(activity.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            entityId: 'post-1',
            organizationId: 'org-1',
            userId: 'user-1',
          }),
          expect.objectContaining({
            entityId: 'post-2',
            organizationId: 'org-1',
            userId: 'user-1',
          }),
        ],
      });
      expect(created).toBe(2);
    });

    it('checks streaks once per distinct organization and user pair', async () => {
      const { activity, service } = makeService();
      activity.createMany.mockResolvedValue({ count: 3 });

      await service.createMany([
        {
          key: ActivityKey.POST_PUBLISHED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          key: ActivityKey.POST_PUBLISHED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          key: ActivityKey.POST_PUBLISHED,
          organizationId: 'org-1',
          userId: 'user-2',
        },
      ] as never);

      expect(streaksService.checkAndUpdate).toHaveBeenCalledTimes(2);
      expect(streaksService.checkAndUpdate).toHaveBeenCalledWith(
        'user-1',
        'org-1',
        expect.any(Date),
      );
      expect(streaksService.checkAndUpdate).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        expect.any(Date),
      );
    });

    it('does not insert for an empty batch', async () => {
      const { activity, service } = makeService();

      const created = await service.createMany([]);

      expect(created).toBe(0);
      expect(activity.createMany).not.toHaveBeenCalled();
    });

    it('never lets a streak failure break the batch insert', async () => {
      const { activity, service } = makeService();
      activity.createMany.mockResolvedValue({ count: 1 });
      streaksService.checkAndUpdate.mockRejectedValueOnce(
        new Error('streaks unavailable'),
      );

      await expect(
        service.createMany([
          {
            key: ActivityKey.POST_PUBLISHED,
            organizationId: 'org-1',
            userId: 'user-1',
          },
        ] as never),
      ).resolves.toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to update streak after activity batch create',
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      );
    });
  });
});

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ActionOrigin, ActivityKey } from '@genfeedai/contracts';

describe('ActivitiesService action origin', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  function makeService() {
    const activity = {
      findFirst: vi.fn(),
      update: vi.fn(),
    };
    return {
      activity,
      service: new ActivitiesService({ activity } as never, logger as never),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
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

  function makeService() {
    const activity = {
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
      ),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
});

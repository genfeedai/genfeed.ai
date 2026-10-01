import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  ActionOrigin,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';

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

describe('ActivitiesService generation hydration', () => {
  it.each([
    ['org-1', 'foreign-org'],
    [null, 'foreign-org'],
    ['org-1', null],
  ])(
    'refuses a mismatched ingredient for organization %s',
    async (organizationId, foreignOrganizationId) => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          { id: 'asset-1', organizationId: foreignOrganizationId },
        ]);
      const service = new ActivitiesService(
        { ingredient: { findMany } } as never,
        { debug: vi.fn(), error: vi.fn() } as never,
      );
      const row = {
        id: 'activity-1',
        entityId: 'asset-1',
        key: ActivityKey.IMAGE_PROCESSING,
        organizationId,
      } as Parameters<typeof service.hydrateGenerationActivities>[0][number];
      expect(await service.hydrateGenerationActivities([row])).toEqual([row]);
      expect(findMany).toHaveBeenCalledWith({
        include: { metadata: true },
        where: {
          isDeleted: false,
          organizationId,
          id: { in: ['asset-1'] },
        },
      });
    },
  );

  it('deduplicates assets in one batch per exact organization, including null scope', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ActivitiesService(
      { ingredient: { findMany } } as never,
      { debug: vi.fn(), error: vi.fn() } as never,
    );
    const rows = [
      { entityId: 'asset-1', organizationId: 'org-1' },
      { entityId: 'asset-1', organizationId: 'org-1' },
      { entityId: 'asset-2', organizationId: 'org-1' },
      { entityId: 'asset-3', organizationId: 'org-2' },
      { entityId: 'asset-4', organizationId: null },
    ].map((scope, index) => ({
      ...scope,
      id: `activity-${index}`,
      key: ActivityKey.IMAGE_PROCESSING,
    })) as Parameters<typeof service.hydrateGenerationActivities>[0];

    expect(await service.hydrateGenerationActivities(rows)).toEqual(rows);
    expect(findMany).toHaveBeenCalledTimes(3);
    for (const [index, organizationId, ids] of [
      [1, 'org-1', ['asset-1', 'asset-2']],
      [2, 'org-2', ['asset-3']],
      [3, null, ['asset-4']],
    ] as const) {
      expect(findMany).toHaveBeenNthCalledWith(index, {
        include: { metadata: true },
        where: { organizationId, isDeleted: false, id: { in: ids } },
      });
    }
  });

  it('hydrates legacy self-hosted rows only from a null-organization ingredient', async () => {
    const ingredient = {
      id: 'asset-1',
      category: IngredientCategory.IMAGE,
      organizationId: null,
      status: IngredientStatus.GENERATED,
      metadata: null,
      updatedAt: new Date('2026-10-01T10:00:01Z'),
    };
    const findMany = vi.fn().mockResolvedValue([ingredient]);
    const service = new ActivitiesService(
      { ingredient: { findMany } } as never,
      { debug: vi.fn(), error: vi.fn() } as never,
    );
    const row = {
      id: 'activity-1',
      entityId: 'asset-1',
      key: ActivityKey.IMAGE_PROCESSING,
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
    } as Parameters<typeof service.hydrateGenerationActivities>[0][number];

    const [result] = await service.hydrateGenerationActivities([row]);
    expect(result).toMatchObject({
      key: ActivityKey.IMAGE_GENERATED,
      ingredient,
    });
    expect(findMany).toHaveBeenCalledWith({
      include: { metadata: true },
      where: {
        organizationId: null,
        isDeleted: false,
        id: { in: ['asset-1'] },
      },
    });
  });
  it('matches processing and terminal callbacks by exact ingredient and tenant', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new ActivitiesService(
      { activity: { findFirst } } as never,
      { debug: vi.fn(), error: vi.fn() } as never,
    );
    await service.findGenerationActivity(
      [ActivityKey.IMAGE_PROCESSING, ActivityKey.IMAGE_GENERATED],
      'asset-1',
      'user-1',
      'org-1',
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          isDeleted: false,
          action: {
            in: expect.arrayContaining([
              ActivityKey.IMAGE_PROCESSING,
              ActivityKey.IMAGE_GENERATED,
              ActivityKey.IMAGE_FAILED,
            ]),
          },
          OR: expect.arrayContaining([{ entityId: 'asset-1' }]),
        }),
      }),
    );
  });
});

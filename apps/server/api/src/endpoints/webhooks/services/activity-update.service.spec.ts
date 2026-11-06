import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityKey,
  IngredientCategory,
  parseActivityKey,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

interface Activity {
  createdAt?: Date;
  entityId: string;
  id: string;
  key: ActivityKey;
  organizationId: string | null;
  userId: string;
  value: string;
}

const INGREDIENT = 'ingredient-1';
const DB_USER = 'user-1';
const ORG = 'org-1';
const TIMING = {
  completedAt: '2026-09-08T18:52:19Z',
  startedAt: '2026-09-08T18:52:06Z',
};

const success = {
  brandId: 'brand-1',
  category: IngredientCategory.VIDEO,
  dbUserId: DB_USER,
  ingredientId: INGREDIENT,
  organizationId: ORG,
  userId: 'authProvider_abc',
  userRoom: 'user-authProvider_abc',
};
const failure = { ...success, errorMessage: 'GPU timeout' };

/** Every key of the same generation lifecycle, as the activities lookup widens it. */
const lifecycleOf = (key: ActivityKey) => {
  const { operation, subject } = parseActivityKey(key);
  return Object.values(ActivityKey).filter((candidate) => {
    const parsed = parseActivityKey(candidate);
    return parsed.subject === subject && parsed.operation === operation;
  });
};

describe('ActivityUpdateService', () => {
  // The activities table and the live updates sent to the user's room.
  let activities: Activity[];
  let published: Record<string, unknown>[];
  let service: ActivityUpdateService;

  const seed = (key: ActivityKey, value: Record<string, unknown> = {}) => {
    activities.push({
      createdAt: new Date('2026-09-08T18:52:00Z'),
      entityId: INGREDIENT,
      id: 'activity-1',
      key,
      organizationId: ORG,
      userId: DB_USER,
      value: JSON.stringify(value),
    });
  };
  const storedValue = (activity?: Activity) =>
    JSON.parse(activity?.value ?? '{}') as Record<string, unknown>;

  beforeEach(() => {
    activities = [];
    published = [];

    const store = {
      findGenerationActivity: async (
        keys: ActivityKey[],
        entityId: string,
        userId: string,
        organizationId?: string,
      ) =>
        activities.find(
          (row) =>
            [...keys, ...lifecycleOf(keys[0] as ActivityKey)].includes(
              row.key,
            ) &&
            row.entityId === entityId &&
            row.userId === userId &&
            row.organizationId === (organizationId ?? null),
        ) ?? null,
      record: async (input: Omit<Activity, 'id'>) => {
        const row = { ...input, id: `activity-${activities.length + 1}` };
        activities.push(row);
        return row;
      },
      update: async (existing: Activity, mutation: Partial<Activity>) =>
        Object.assign(existing, mutation),
    };

    service = new ActivityUpdateService(
      store as unknown as ActivitiesService,
      store as unknown as ActivityRecorderService,
      {
        publishBackgroundTaskUpdate: async (
          update: Record<string, unknown>,
        ) => {
          published.push(update);
        },
      } as unknown as NotificationsPublisherService,
    );
  });

  describe('updateSuccessActivity', () => {
    it('finishes the processing row of the generation', async () => {
      seed(ActivityKey.VIDEO_PROCESSING, { ingredientId: 'old' });

      await service.updateSuccessActivity(success);

      expect(activities).toEqual([
        expect.objectContaining({
          id: 'activity-1',
          key: ActivityKey.VIDEO_GENERATED,
        }),
      ]);
      expect(storedValue(activities[0])).toMatchObject({
        startedAt: '2026-09-08T18:52:00.000Z',
      });
    });

    it('reuses a finished row on repeated completion callbacks and preserves its timing', async () => {
      seed(ActivityKey.VIDEO_GENERATED, TIMING);

      await service.updateSuccessActivity(success);
      await service.updateSuccessActivity(success);

      expect(activities).toHaveLength(1);
      expect(storedValue(activities[0])).toMatchObject(TIMING);
    });

    it('finishes a recovered generation on the failed row instead of creating another activity', async () => {
      seed(ActivityKey.VIDEO_FAILED, TIMING);

      await service.updateSuccessActivity(success);

      expect(activities).toHaveLength(1);
      expect(activities[0]?.key).toBe(ActivityKey.VIDEO_GENERATED);
      expect(storedValue(activities[0])).toMatchObject({
        startedAt: TIMING.startedAt,
      });
      expect(storedValue(activities[0]).completedAt).not.toBe(
        TIMING.completedAt,
      );
    });

    it('records a new activity when the generation has none in this organization', async () => {
      seed(ActivityKey.VIDEO_PROCESSING);
      activities[0] = {
        ...(activities[0] as Activity),
        organizationId: 'org-2',
      };

      await service.updateSuccessActivity(success);

      expect(
        activities.map(({ key, organizationId }) => [key, organizationId]),
      ).toEqual([
        [ActivityKey.VIDEO_PROCESSING, 'org-2'],
        [ActivityKey.VIDEO_GENERATED, ORG],
      ]);
    });

    it.each([
      ['a video', {}, ActivityKey.VIDEO_GENERATED],
      [
        'a reframe',
        { transformations: ['reframed'] },
        ActivityKey.VIDEO_REFRAME_COMPLETED,
      ],
      [
        'an upscale',
        { transformations: ['upscaled'] },
        ActivityKey.VIDEO_UPSCALE_COMPLETED,
      ],
      [
        'an image',
        { category: IngredientCategory.IMAGE },
        ActivityKey.IMAGE_GENERATED,
      ],
      [
        'a music track',
        { category: IngredientCategory.MUSIC },
        ActivityKey.MUSIC_GENERATED,
      ],
    ])('records %s under its completion key', async (_case, fields, key) => {
      await service.updateSuccessActivity({ ...success, ...fields });

      expect(activities.map((row) => row.key)).toEqual([key]);
    });

    it('tells the user the task completed', async () => {
      await service.updateSuccessActivity(success);

      expect(published).toEqual([
        expect.objectContaining({
          activityId: 'activity-1',
          progress: 100,
          resultId: INGREDIENT,
          room: 'user-authProvider_abc',
          status: 'completed',
          taskId: INGREDIENT,
          userId: 'authProvider_abc',
        }),
      ]);
    });

    it('records nothing for an unsupported category', async () => {
      await service.updateSuccessActivity({
        ...success,
        category: 'unsupported',
      });

      expect(activities).toEqual([]);
      expect(published).toEqual([]);
    });

    it('records the activity but sends no live update without a user', async () => {
      await service.updateSuccessActivity({ ...success, userId: undefined });

      expect(activities).toHaveLength(1);
      expect(published).toEqual([]);
    });
  });

  describe('updateFailureActivity', () => {
    it('fails the processing row of the generation', async () => {
      seed(ActivityKey.VIDEO_PROCESSING, { ingredientId: 'old' });

      await service.updateFailureActivity(failure);

      expect(activities).toEqual([
        expect.objectContaining({
          id: 'activity-1',
          key: ActivityKey.VIDEO_FAILED,
        }),
      ]);
    });

    it.each([
      ['a video', IngredientCategory.VIDEO, ActivityKey.VIDEO_FAILED],
      ['an image', IngredientCategory.IMAGE, ActivityKey.IMAGE_FAILED],
    ])(
      'records a failed %s under its failure key',
      async (_case, category, key) => {
        await service.updateFailureActivity({ ...failure, category });

        expect(activities.map((row) => row.key)).toEqual([key]);
      },
    );

    it.each([
      ['the provider error', 'GPU timeout', 'GPU timeout'],
      ['a default message', undefined, 'Generation failed'],
    ])(
      'tells the user the task failed with %s',
      async (_case, errorMessage, error) => {
        await service.updateFailureActivity({ ...failure, errorMessage });

        expect(published).toEqual([
          expect.objectContaining({
            error,
            room: 'user-authProvider_abc',
            status: 'failed',
            taskId: INGREDIENT,
          }),
        ]);
      },
    );
  });
});

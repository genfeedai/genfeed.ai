import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import {
  type IngredientWorldRow,
  ingredientRowWorld,
} from '@api-test/fixtures/ingredient-row.world';
import {
  ActivityKey,
  ActivitySource,
  IngredientStatus,
} from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingredientId = 'ingredient-1';
const organizationId = 'org-1';
const userId = 'user-1';
const websocketUrl = '/videos/ingredient-1';

describe('FailedGenerationService', () => {
  let ingredient: IngredientWorldRow;
  let activities: Array<Record<string, unknown>>;
  let announced: Array<{ message: string; room?: string; url: string }>;
  let emitted: Array<{ payload: unknown; url: string }>;
  let service: FailedGenerationService;

  beforeEach(() => {
    ingredient = {
      generationError: null,
      id: ingredientId,
      isDeleted: false,
      organizationId,
      status: IngredientStatus.PROCESSING,
    };
    activities = [];
    announced = [];
    emitted = [];
    const activityStore = {
      findByActionValue: async () => null,
      record: async (activity: Record<string, unknown>) => {
        activities.push(activity);
      },
      update: async () => undefined,
    };
    const websocket = {
      emit: async (url: string, payload: unknown) => {
        emitted.push({ payload, url });
      },
      publishMediaFailed: async (
        url: string,
        message: string,
        _user: string,
        room?: string,
      ) => {
        announced.push({ message, room, url });
      },
    };
    service = new FailedGenerationService(
      activityStore as unknown as ActivitiesService,
      activityStore as unknown as ActivityRecorderService,
      websocket as unknown as NotificationsPublisherService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const world = () => ingredientRowWorld(ingredient);

  it.each([
    [
      'a generation in flight',
      { generationError: null, status: IngredientStatus.PROCESSING },
      { generationError: 'Processing failed', status: IngredientStatus.FAILED },
      1,
    ],
    [
      'a generation the processing-timeout cron failed',
      {
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
        status: IngredientStatus.FAILED,
      },
      { generationError: 'Processing failed', status: IngredientStatus.FAILED },
      1,
    ],
    [
      'a generation the user cancelled (#9735)',
      { generationError: 'Cancelled by user', status: IngredientStatus.FAILED },
      { generationError: 'Cancelled by user', status: IngredientStatus.FAILED },
      0,
    ],
    [
      'a generation that already finished (#9735)',
      { generationError: null, status: IngredientStatus.GENERATED },
      { generationError: null, status: IngredientStatus.GENERATED },
      0,
    ],
  ])(
    'fails %s and announces it only when it was still running',
    async (_label, before, after, announcements) => {
      Object.assign(ingredient, before);

      await service.handleFailedVideoGeneration(
        world(),
        ingredientId,
        organizationId,
        websocketUrl,
        userId,
        'room-1',
      );

      expect(ingredient).toMatchObject(after);
      expect(announced).toHaveLength(announcements);
    },
  );

  it('leaves an ingredient of another organization alone', async () => {
    await service.handleFailedVideoGeneration(
      world(),
      ingredientId,
      'org-other',
      websocketUrl,
      userId,
    );

    expect(ingredient.status).toBe(IngredientStatus.PROCESSING);
    expect(announced).toEqual([]);
  });

  it('announces a failed video with the processing message', async () => {
    await service.handleFailedVideoGeneration(
      world(),
      ingredientId,
      organizationId,
      websocketUrl,
      userId,
      'room-1',
    );

    expect(announced).toEqual([
      { message: 'Processing failed', room: 'room-1', url: websocketUrl },
    ]);
  });

  it('records the failure activity when activity details are given', async () => {
    await service.handleFailedGeneration(world(), {
      activityMetadata: {
        key: ActivityKey.VIDEO_FAILED,
        organizationId,
        source: ActivitySource.SCRIPT,
        userId,
        value: ingredientId,
      },
      ingredientId,
      websocketUrl,
    });

    expect(activities).toEqual([
      expect.objectContaining({
        key: ActivityKey.VIDEO_FAILED,
        organizationId,
        source: ActivitySource.SCRIPT,
        userId,
      }),
    ]);
  });

  it('emits the failed status after the delay by default', async () => {
    vi.useFakeTimers();

    await service.handleFailedGeneration(world(), {
      delay: 500,
      ingredientId,
      organizationId,
      websocketUrl,
    });
    const beforeDelay = [...emitted];
    vi.advanceTimersByTime(500);

    expect(beforeDelay).toEqual([]);
    expect(emitted).toEqual([
      {
        payload: { result: null, status: IngredientStatus.FAILED },
        url: websocketUrl,
      },
    ]);
    expect(activities).toEqual([]);
  });

  it.each([
    [undefined, 'Generation failed'],
    [
      'gen4_image_turbo requires at least one reference image',
      'gen4_image_turbo requires at least one reference image',
    ],
  ])(
    'stores and announces an image failure reason (%s)',
    async (reason, message) => {
      await service.handleFailedImageGeneration(
        world(),
        ingredientId,
        websocketUrl,
        { organizationId, userId },
        'room-1',
        ...(reason === undefined ? [] : [reason]),
      );

      expect(ingredient).toMatchObject({
        generationError: message,
        status: IngredientStatus.FAILED,
      });
      expect(announced).toEqual([
        { message, room: 'room-1', url: websocketUrl },
      ]);
      expect(activities).toEqual([
        expect.objectContaining({
          key: ActivityKey.IMAGE_FAILED,
          source: ActivitySource.SCRIPT,
        }),
      ]);
    },
  );

  it('keeps an image the user cancelled failed and silent (#9735)', async () => {
    Object.assign(ingredient, {
      generationError: 'Cancelled by user',
      status: IngredientStatus.FAILED,
    });

    await service.handleFailedImageGeneration(
      world(),
      ingredientId,
      websocketUrl,
      { organizationId, userId },
    );

    expect(ingredient.generationError).toBe('Cancelled by user');
    expect(announced).toEqual([]);
    expect(activities).toEqual([]);
  });

  it.each([
    [undefined, 'Generation failed'],
    [
      'Mureka rejected the request (HTTP 400: prompt is too short)',
      'Mureka rejected the request (HTTP 400: prompt is too short)',
    ],
  ])(
    'stores and announces a music failure reason (%s)',
    async (reason, message) => {
      await service.handleFailedMusicGeneration(
        world(),
        ingredientId,
        websocketUrl,
        userId,
        'room-1',
        {
          key: ActivityKey.MUSIC_FAILED,
          organizationId,
          source: ActivitySource.MUSIC_GENERATION,
          userId,
          value: JSON.stringify({ ingredientId }),
        },
        reason,
      );

      expect(ingredient).toMatchObject({
        generationError: message,
        status: IngredientStatus.FAILED,
      });
      expect(announced).toEqual([
        { message, room: 'room-1', url: websocketUrl },
      ]);
    },
  );
});

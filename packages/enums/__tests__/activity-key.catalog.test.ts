import { describe, expect, it } from 'vitest';
import { ActivityKey } from '../src/activity.enum';
import {
  formatActivityMessage,
  getActivityLifecycleStatus,
  getActivityMessageDescriptor,
  parseActivityKey,
} from '../src/activity-key.catalog';
import { ActivityKeys } from '../src/activity-keys.tree';

describe('parseActivityKey', () => {
  it('parses subject-lifecycle keys', () => {
    expect(parseActivityKey(ActivityKey.IMAGE_PROCESSING)).toEqual({
      key: 'image-processing',
      lifecycle: 'processing',
      operation: 'generate',
      subject: 'image',
    });
  });

  it('parses subject-operation-lifecycle keys', () => {
    expect(parseActivityKey(ActivityKey.VIDEO_REFRAME_PROCESSING)).toEqual({
      key: 'video-reframe-processing',
      lifecycle: 'processing',
      operation: 'reframe',
      subject: 'video',
    });
    expect(parseActivityKey(ActivityKey.IMAGE_UPSCALE_COMPLETED)).toEqual({
      key: 'image-upscale-completed',
      lifecycle: 'completed',
      operation: 'upscale',
      subject: 'image',
    });
  });

  it('parses multi-segment specials', () => {
    expect(parseActivityKey(ActivityKey.POST_PUBLISHED)).toMatchObject({
      lifecycle: 'published',
      operation: 'publish',
      subject: 'post',
    });
    expect(parseActivityKey(ActivityKey.MODELS_TRAINING_CREATED)).toMatchObject(
      {
        lifecycle: 'created',
        operation: 'train',
        subject: 'model',
      },
    );
  });

  it('preserves the established outputs for every special key family', () => {
    for (const key of [
      ActivityKey.CREDITS_ADD,
      ActivityKey.CREDITS_REMOVE,
      ActivityKey.CREDITS_REMOVE_ALL,
      ActivityKey.CREDITS_RESET,
    ]) {
      expect(parseActivityKey(key)).toEqual({
        key,
        lifecycle: 'completed',
        operation: 'credit',
        subject: 'credits',
      });
    }

    for (const [key, lifecycle] of [
      [ActivityKey.MODELS_TRAINING_CREATED, 'created'],
      [ActivityKey.MODELS_TRAINING_COMPLETED, 'completed'],
      [ActivityKey.MODELS_TRAINING_FAILED, 'failed'],
    ] as const) {
      expect(parseActivityKey(key)).toMatchObject({
        lifecycle,
        operation: 'train',
        subject: 'model',
      });
    }

    for (const [key, lifecycle] of [
      [ActivityKey.POST_PUBLISHED, 'published'],
      [ActivityKey.POST_SCHEDULED, 'scheduled'],
      [ActivityKey.POST_FAILED, 'failed'],
    ] as const) {
      expect(parseActivityKey(key)).toMatchObject({
        lifecycle,
        operation: 'publish',
        subject: 'post',
      });
    }

    expect(
      parseActivityKey(ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED),
    ).toMatchObject({
      lifecycle: 'disconnected',
      operation: 'connect',
      subject: 'integration',
    });

    expect(parseActivityKey('model-training-generated')).toMatchObject({
      lifecycle: 'processing',
      operation: 'train',
      subject: 'model',
    });
    expect(parseActivityKey('content-publish-generated')).toMatchObject({
      lifecycle: 'processing',
      operation: 'publish',
      subject: 'post',
    });
    expect(parseActivityKey('integration-social-completed')).toMatchObject({
      lifecycle: 'failed',
      operation: 'connect',
      subject: 'integration',
    });
  });
});

describe('formatActivityMessage', () => {
  it('uses templates instead of per-key copy', () => {
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.VIDEO_REFRAME_PROCESSING),
      ),
    ).toBe('Reframing a video...');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.IMAGE_GENERATED),
      ),
    ).toBe('Generated an image');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.PROMPT_ENHANCE_FAILED),
      ),
    ).toBe('Failed to enhance prompt');
  });

  it('covers credits and post ready', () => {
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.CREDITS_ADD),
      ),
    ).toBe('Credits added');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.POST_GENERATED),
      ),
    ).toBe('Content is ready for review');
  });
});

describe('getActivityLifecycleStatus', () => {
  it('maps phases for badges', () => {
    expect(getActivityLifecycleStatus(ActivityKey.IMAGE_PROCESSING)).toBe(
      'processing',
    );
    expect(getActivityLifecycleStatus(ActivityKey.VIDEO_FAILED)).toBe('failed');
    expect(getActivityLifecycleStatus(ActivityKey.IMAGE_GENERATED)).toBe(
      'completed',
    );
  });
});

describe('ActivityKeys tree', () => {
  it('mirrors wire enum values', () => {
    expect(ActivityKeys.video.reframe.processing).toBe(
      ActivityKey.VIDEO_REFRAME_PROCESSING,
    );
    expect(ActivityKeys.image.generate.completed).toBe(
      ActivityKey.IMAGE_GENERATED,
    );
  });
});

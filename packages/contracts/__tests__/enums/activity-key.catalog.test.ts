import { describe, expect, it } from 'vitest';
import { ActivityKey } from '../../src/enums/activity.enum';
import {
  formatActivityMessage,
  getActivityLifecycleStatus,
  getActivityMessageDescriptor,
  getCreditActivityChangeDescriptor,
  getCreditActivityKey,
  getCreditActivityMessageDescriptor,
  parseActivityKey,
  parseCreditActivityValue,
} from '../../src/enums/activity-key.catalog';
import { ActivityKeys } from '../../src/enums/activity-keys.tree';

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
    expect(
      parseActivityKey(ActivityKey.SOCIAL_HISTORY_IMPORT_COMPLETED),
    ).toMatchObject({
      lifecycle: 'completed',
      operation: 'import',
      subject: 'integration',
    });
    expect(
      parseActivityKey(ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED),
    ).toMatchObject({
      lifecycle: 'skipped',
      operation: 'import',
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

describe('parseCreditActivityValue', () => {
  it('reads a charge reason and amount independently', () => {
    expect(
      parseCreditActivityValue(
        JSON.stringify({ description: ' Onboarding preview image ', value: 1 }),
      ),
    ).toEqual({ amount: 1, description: 'Onboarding preview image' });
    expect(
      parseCreditActivityValue(
        JSON.stringify({
          description: 'Master prompt generation',
          value: 'invalid',
        }),
      ),
    ).toEqual({ amount: null, description: 'Master prompt generation' });
  });

  it.each(['1', '{"value":1}', '{"value":"1"}'])(
    'reads existing amounts: %s',
    (value) => {
      expect(parseCreditActivityValue(value)).toEqual({
        amount: 1,
        description: undefined,
      });
    },
  );

  it.each([
    '',
    ' ',
    'null',
    'true',
    '[]',
    '{}',
    '{"value":null}',
    '{"value":true}',
    '{"value":""}',
    'Infinity',
  ])('does not invent a numeric cost for %s', (value) => {
    expect(parseCreditActivityValue(value).amount).toBeNull();
  });

  it.each([' ', '{"internal":"payload"}', '[1,2]'])(
    'ignores non-descriptive text: %s',
    (description) => {
      expect(
        parseCreditActivityValue(JSON.stringify({ description, value: 0 })),
      ).toEqual({ amount: 0, description: undefined });
    },
  );
});

describe('credit transaction presentation', () => {
  it.each([
    [
      'add',
      'Onboarding welcome reward',
      'Onboarding welcome reward',
      '+1 credit',
    ],
    [
      'deduct',
      'AI brand profile generation',
      'AI brand profile generation',
      '−1 credit',
    ],
    [
      'refund',
      'Failed image generation',
      'Credit refund: Failed image generation',
      '+1 credit',
    ],
    [
      'expire',
      'Promotional grant expired',
      'Credits expired: Promotional grant expired',
      '−1 credit',
    ],
    [
      'rollover',
      'Unused subscription credits',
      'Credits rolled over: Unused subscription credits',
      '+1 credit',
    ],
    [
      'reset',
      'Subscription renewal',
      'Credit balance reset: Subscription renewal',
      'Balance set to 1 credit',
    ],
    [
      'byok-usage',
      '[BYOK] Image generation',
      'Image generation (your API key)',
      'No credits charged',
    ],
  ])(
    'explains %s without misrepresenting its balance effect',
    (category, description, title, amount) => {
      const key = getCreditActivityKey(category);
      if (!key) throw new Error('Missing credit activity key');
      const value = JSON.stringify({ category, description, value: 1 });
      expect(
        formatActivityMessage(
          getCreditActivityMessageDescriptor(key, value, 'system'),
        ),
      ).toBe(title);
      const change = getCreditActivityChangeDescriptor(key, value);
      if (!change) throw new Error('Missing credit amount descriptor');
      expect(formatActivityMessage(change)).toBe(amount);
    },
  );

  it('keeps unrecognized sources and malformed amounts honest', () => {
    expect(
      formatActivityMessage(
        getCreditActivityMessageDescriptor(
          ActivityKey.CREDITS_REMOVE,
          '1',
          'internal-operation-secret',
        ),
      ),
    ).toBe('Credit usage — details unavailable');
    expect(
      getCreditActivityChangeDescriptor(ActivityKey.CREDITS_REMOVE, '{}'),
    ).toBeNull();
    expect(getCreditActivityKey('unknown')).toBeUndefined();
  });
});

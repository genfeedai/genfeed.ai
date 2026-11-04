import {
  ActivityKey,
  ActivityKeys,
  getActivityMessageDescriptor,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { describe, expect, it, vi } from 'vitest';

import {
  formatActivityClock,
  formatActivityDayHeading,
  getActivityAssetId,
  getActivityCreditAmount,
  getActivityCreditsDelta,
  getActivityDayKey,
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivityIngredientPreviewUrl,
  getActivityLifecycleText,
  getActivityMediaPreviewUrl,
  getActivityRunDuration,
  getActivitySourceLabel,
  getActivityStatus,
  getActivityValueFields,
  getActivityVideoUrl,
  getGenerationCreditAmount,
} from './activities-list.utils';

describe('getActivityDescription', () => {
  it('delegates catalog-backed activity copy to the supplied formatter', () => {
    const activity = {
      key: ActivityKey.IMAGE_PROCESSING,
    } as IActivity;
    const formatter = vi.fn(() => 'Localized activity copy');

    expect(getActivityDescription(activity, formatter)).toBe(
      'Localized activity copy',
    );
    expect(formatter).toHaveBeenCalledWith(
      getActivityMessageDescriptor(ActivityKey.IMAGE_PROCESSING),
    );
  });

  it('keeps the English formatter as the non-app fallback', () => {
    const activity = {
      key: ActivityKey.VIDEO_REFRAME_PROCESSING,
    } as IActivity;

    expect(getActivityDescription(activity)).toBe('Reframing a video...');
  });

  it('passes credit context through the catalog descriptor', () => {
    const activity = {
      key: ActivityKey.CREDITS_REMOVE,
      source: 'image-generate',
      value: '1200',
    } as IActivity;
    const formatter = vi.fn(
      (descriptor) => `${descriptor.params.source}:${descriptor.params.amount}`,
    );

    expect(getActivityDescription(activity, formatter)).toBe(
      'Image generation:1,200',
    );
    expect(formatter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'activity.credits.remove',
        params: expect.objectContaining({
          amount: '1,200',
          source: 'Image generation',
        }),
      }),
    );
  });

  it('explains the charged action and keeps its amount separate', () => {
    const activity = {
      key: ActivityKey.CREDITS_REMOVE,
      source: 'system',
      value: JSON.stringify({
        description: 'AI brand profile generation',
        value: 1,
      }),
    } as IActivity;

    expect(getActivityDescription(activity)).toBe(
      'AI brand profile generation',
    );
    expect(getActivityCreditAmount(activity)).toBe(1);
  });

  it('uses known sources for old charges without guessing onboarding', () => {
    expect(
      getActivityDescription({
        key: ActivityKey.CREDITS_REMOVE,
        source: 'brand-interview',
        value: '1',
      } as IActivity),
    ).toBe('Brand context interview');
    expect(
      getActivityDescription({
        key: ActivityKey.CREDITS_REMOVE,
        source: 'system',
        value: '1',
      } as IActivity),
    ).toBe('Credit usage — details unavailable');
  });

  it('routes failed media and disconnected social accounts to the page you can act on', () => {
    expect(
      getActivityDestinationPath({
        entityId: 'ing-9',
        entityModel: 'Ingredient',
        key: ActivityKey.IMAGE_FAILED,
        value: JSON.stringify({ error: 'Provider timed out' }),
      } as IActivity),
    ).toBe('/library/images?asset=ing-9');
    expect(
      getActivityDestinationPath({
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        value: 'Twitter credential requires reconnection',
      } as IActivity),
    ).toBe('/settings/connected-accounts');
    expect(
      getActivityDestinationPath({
        entityId: 'exec-7',
        entityModel: 'WorkflowExecution',
        key: ActivityKey.WORKFLOW_EXECUTION_FAILED,
        value: 'Daily trends digest',
      } as IActivity),
    ).toBe('/automation/runs/exec-7');
    expect(
      getActivityDetailText({
        key: ActivityKey.IMAGE_FAILED,
        value: JSON.stringify({ error: 'Provider timed out' }),
      } as IActivity),
    ).toBeUndefined();
    expect(
      getActivityDetailText({
        key: ActivityKey.WORKFLOW_EXECUTION_FAILED,
        value: 'Daily trends digest',
      } as IActivity),
    ).toBe('Daily trends digest');
    expect(
      getActivityDetailText({
        entityId: 'exec-7',
        key: ActivityKey.WORKFLOW_EXECUTION_FAILED,
        value: 'GPT-4o',
      } as IActivity),
    ).toBe('GPT-4o');
    expect(
      getActivityDetailText({
        key: ActivityKey.IMAGE_PROCESSING,
        value: 'cmg1a2b3c0000xyz',
      } as IActivity),
    ).toBeUndefined();
  });

  it('keeps music labels accurate while omitting raw provider diagnostics from compact rows', () => {
    const activity = {
      key: ActivityKey.MUSIC_FAILED,
      value: JSON.stringify({
        label: 'Image Generation',
        error:
          'Prediction failed: {"ingredientId":"private-id","secret":"token"}',
      }),
    } as IActivity;
    expect(getActivityDescription(activity)).toBe('Failed to generate music');
    expect(getActivityDetailText(activity)).toBeUndefined();
  });

  it('exposes structured source and credit metadata for compact activity feeds', () => {
    const activity = {
      key: ActivityKey.CREDITS_REMOVE,
      source: 'prompt-create',
      value: JSON.stringify({ value: 1 }),
    } as IActivity;

    expect(getActivitySourceLabel(activity.source)).toBe('Prompt creation');
    expect(getActivityCreditAmount(activity)).toBe(1);
  });

  it('derives a CDN preview from the ingredient id when the row is not populated', () => {
    const activity = {
      entityId: 'ing-42',
      entityModel: 'Ingredient',
      key: ActivityKey.IMAGE_PROCESSING,
      value: JSON.stringify({ ingredientId: 'ing-42', type: 'generation' }),
    } as IActivity;

    expect(getActivityAssetId(activity)).toBe('ing-42');
    expect(getActivityMediaPreviewUrl(activity)).toBe(
      `${EnvironmentService.ingredientsEndpoint}/images/ing-42`,
    );
    expect(
      getActivityMediaPreviewUrl(activity, {
        resultType: IngredientCategory.VIDEO,
        status: 'completed',
      }),
    ).toBe(`${EnvironmentService.cdnUrl}/ingredients/thumbnails/ing-42`);
    expect(
      getActivityMediaPreviewUrl(activity, { status: 'failed' }),
    ).toBeUndefined();
  });
});

describe('generation credit amounts', () => {
  it('never treats credits in unrelated activity JSON as a generation charge', () => {
    expect(
      getGenerationCreditAmount({
        key: 'organization.update.completed',
        value: '{"credits":12}',
      }),
    ).toBeNull();
  });
  it('reads settled media generation charges only', () => {
    expect(
      getGenerationCreditAmount({
        key: ActivityKeys.image.generate.completed,
        value: '{"credits":12}',
      }),
    ).toBe(12);
    expect(
      getGenerationCreditAmount({
        key: ActivityKeys.image.generate.processing,
        value: '{"credits":12}',
      }),
    ).toBeNull();
    expect(
      getGenerationCreditAmount({
        key: ActivityKeys.image.upscale.completed,
        value: '{"credits":12}',
      }),
    ).toBeNull();
  });
});

describe('activity output and timing', () => {
  it('provides a completed video source even when its thumbnail is absent', () => {
    expect(
      getActivityVideoUrl({
        key: ActivityKey.VIDEO_GENERATED,
        entityId: 'video-1',
      } as IActivity),
    ).toBe(`${EnvironmentService.ingredientsEndpoint}/videos/video-1`);
    expect(
      getActivityVideoUrl({
        key: ActivityKey.VIDEO_PROCESSING,
        entityId: 'video-1',
      } as IActivity),
    ).toBeUndefined();
    expect(
      getActivityIngredientPreviewUrl(
        { id: 'video-1', thumbnailUrl: '/placeholders/portrait.jpg' },
        IngredientCategory.VIDEO,
      ),
    ).toBe(`${EnvironmentService.ingredientsEndpoint}/thumbnails/video-1`);
  });
  it('shows start and finish together and does not invent a finish for running work', () => {
    const activity = {
      key: ActivityKey.IMAGE_GENERATED,
      value: JSON.stringify({
        startedAt: '2026-09-08T18:52:06Z',
        completedAt: '2026-09-08T18:52:19Z',
      }),
    } as IActivity;
    expect(getActivityLifecycleText(activity)).toBe(
      'Started 9/8/2026, 6:52:06 PM UTC · Finished 9/8/2026, 6:52:19 PM UTC',
    );
    expect(
      getActivityLifecycleText({
        ...activity,
        value: JSON.stringify({ startedAt: '2026-09-08T18:52:06Z' }),
      }),
    ).not.toContain('Finished');
    expect(
      getActivityLifecycleText({
        key: ActivityKey.CREDITS_REMOVE,
      } as IActivity),
    ).toBeUndefined();
  });

  it('reads the readable fields from a stored value for the admin detail', () => {
    const fields = getActivityValueFields({
      value: JSON.stringify({
        completedAt: '2026-09-08T18:52:19Z',
        error: ' Provider timed out ',
        resultId: 'img-1',
        resultType: 'image',
        startedAt: '2026-09-08T18:52:06Z',
      }),
    });
    expect(fields).toMatchObject({
      completedAt: '2026-09-08T18:52:19Z',
      error: 'Provider timed out',
      resultId: 'img-1',
      resultType: 'image',
      startedAt: '2026-09-08T18:52:06Z',
    });
    expect(fields.raw).toContain('\n  "resultId": "img-1"');
    expect(getActivityValueFields({ value: 'plain text' })).toEqual({
      raw: 'plain text',
    });
  });
});

describe('getActivityCreditsDelta', () => {
  it('is the plain signed amount of a credit movement', () => {
    expect(
      getActivityCreditsDelta({
        key: ActivityKey.CREDITS_REMOVE,
        source: 'system',
        value: JSON.stringify({ description: 'Image generation', value: 4 }),
      } as IActivity),
    ).toBe('\u22124');
    expect(
      getActivityCreditsDelta({
        key: ActivityKey.CREDITS_ADD,
        source: 'system',
        value: '25',
      } as IActivity),
    ).toBe('+25');
  });

  it('has nothing for activities that move no credits', () => {
    expect(
      getActivityCreditsDelta({
        key: ActivityKey.POST_PUBLISHED,
        source: 'system',
        value: 'Published',
      } as IActivity),
    ).toBeNull();
  });
});

describe('getActivityStatus', () => {
  it('reports the state a post moved to for transition rows', () => {
    const activity = {
      key: ActivityKey.POST_LIFECYCLE_TRANSITION,
      value: JSON.stringify({ from: 'scheduled', to: 'Publishing' }),
    } as IActivity;

    expect(getActivityStatus(activity)).toBe('publishing');
  });

  it('is empty for audit rows that record no status', () => {
    expect(
      getActivityStatus({
        key: ActivityKey.POST_LIFECYCLE_TRANSITION,
        value: 'not json',
      } as IActivity),
    ).toBe('');
    expect(
      getActivityStatus({
        key: ActivityKey.BRAND_OS_EXPORT_DOWNLOAD,
      } as IActivity),
    ).toBe('');
  });

  it('keeps the stored status on other rows', () => {
    expect(
      getActivityStatus({
        key: ActivityKey.POST_PUBLISHED,
        status: 'completed',
      } as IActivity),
    ).toBe('completed');
  });
});

describe('getActivityRunDuration', () => {
  it('measures a run from its own timestamps', () => {
    expect(
      getActivityRunDuration({
        key: ActivityKey.VIDEO_GENERATED,
        value: JSON.stringify({
          completedAt: '2026-11-02T10:01:42.000Z',
          startedAt: '2026-11-02T10:00:00.000Z',
        }),
      } as IActivity),
    ).toBe('1m 42s');
  });

  it('is null when the row has no run', () => {
    expect(
      getActivityRunDuration({
        key: ActivityKey.POST_PUBLISHED,
        value: 'Published to instagram',
      } as IActivity),
    ).toBeNull();
  });
});

describe('activity time formatting', () => {
  it('reads the clock and day in UTC', () => {
    expect(formatActivityClock('2026-11-02T23:59:07.000Z')).toBe('23:59:07');
    expect(getActivityDayKey('2026-11-02T23:59:07.000Z')).toBe('2026-11-02');
    expect(formatActivityClock(undefined)).toBe('—');
    expect(getActivityDayKey(undefined)).toBe('unknown');
  });

  it('labels today, yesterday and older days', () => {
    const now = new Date('2026-11-02T12:00:00.000Z');

    expect(formatActivityDayHeading('2026-11-02', now)).toBe(
      'Today · Mon, Nov 2 · UTC',
    );
    expect(formatActivityDayHeading('2026-11-01', now)).toBe(
      'Yesterday · Sun, Nov 1 · UTC',
    );
    expect(formatActivityDayHeading('2026-10-30', now)).toBe(
      'Fri, Oct 30 · UTC',
    );
    expect(formatActivityDayHeading('unknown', now)).toBe('Unknown date');
  });
});

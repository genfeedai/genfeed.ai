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
  getActivityAssetId,
  getActivityCreditAmount,
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivityIngredientPreviewUrl,
  getActivityLifecycleText,
  getActivityMediaPreviewUrl,
  getActivitySourceLabel,
  getActivityTypeKind,
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
    ).toBe(
      '/library/assets?categories=IMAGE&categories=IMAGE_EDIT&asset=ing-9',
    );
    expect(
      getActivityDestinationPath({
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        value: 'Twitter credential requires reconnection',
      } as IActivity),
    ).toBe('/settings/integrations');
    expect(
      getActivityDestinationPath({
        entityId: 'exec-7',
        entityModel: 'WorkflowExecution',
        key: ActivityKey.WORKFLOW_EXECUTION_FAILED,
        value: 'Daily trends digest',
      } as IActivity),
    ).toBe('/automation/runs/exec-7');
    expect(
      getActivityTypeKind({
        key: ActivityKey.IMAGE_FAILED,
      } as IActivity),
    ).toBe('image');
    expect(
      getActivityTypeKind({
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      } as IActivity),
    ).toBe('social');
    expect(
      getActivityDetailText({
        key: ActivityKey.IMAGE_FAILED,
        value: JSON.stringify({ error: 'Provider timed out' }),
      } as IActivity),
    ).toBe('Provider timed out');
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
});

import {
  ActivityKey,
  getActivityMessageDescriptor,
} from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

import {
  getActivityCreditAmount,
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivitySourceLabel,
  getActivityTypeKind,
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
    ).toBe('/settings/integrations');
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
});

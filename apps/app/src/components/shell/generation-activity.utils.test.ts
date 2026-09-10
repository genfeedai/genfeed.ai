import { ActivityKey } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getGenerationActivityHref,
  getGenerationActivityStatus,
  isActiveGenerationActivity,
  mergeGenerationActivities,
} from './generation-activity.utils';

const scope = {
  organizationId: 'org-1',
  orgSlug: 'acme',
  brands: [{ id: 'brand-1', slug: 'coffee' }],
};
function fixture(overrides: Partial<IActivity> = {}): IActivity {
  return {
    id: 'activity-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    entityId: 'asset-1',
    entityModel: 'Ingredient',
    key: ActivityKey.IMAGE_GENERATED,
    value: '',
    updatedAt: '2026-09-09T10:00:00Z',
    ...overrides,
  } as IActivity;
}
describe('generation activity destinations', () => {
  it('opens the actual asset in its owning brand', () => {
    expect(getGenerationActivityHref(fixture(), scope)).toBe(
      '/acme/coffee/library/images?asset=asset-1',
    );
    expect(
      getGenerationActivityHref(
        fixture({ entityModel: 'Post', key: ActivityKey.POST_GENERATED }),
        scope,
      ),
    ).toBe('/acme/coffee/publishing/posts/asset-1');
    expect(
      getGenerationActivityHref(
        fixture({ entityModel: 'Article', key: ActivityKey.ARTICLE_GENERATED }),
        scope,
      ),
    ).toBe('/acme/coffee/publishing/posts/asset-1');
    expect(
      getGenerationActivityHref(
        fixture({
          entityId: undefined,
          entityModel: undefined,
          key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        }),
        scope,
      ),
    ).toBe('/acme/coffee/settings/integrations');
  });
  it('never sends another organization or inaccessible brand to the selected brand', () => {
    expect(
      getGenerationActivityHref(fixture({ organizationId: 'org-2' }), scope),
    ).toBeNull();
    expect(
      getGenerationActivityHref(fixture({ brandId: 'unavailable' }), scope),
    ).toBe('/acme/~/workspace/activity');
  });
  it('distinguishes user cancellation from failure', () => {
    expect(
      getGenerationActivityStatus(
        fixture({
          key: ActivityKey.IMAGE_FAILED,
          value: JSON.stringify({ error: 'Cancelled by user' }),
        }),
      ),
    ).toBe('cancelled');
  });
  it('counts only server-active generation keys as in flight', () => {
    expect(
      isActiveGenerationActivity(
        fixture({ key: ActivityKey.IMAGE_PROCESSING }),
      ),
    ).toBe(true);
    expect(
      isActiveGenerationActivity(
        fixture({ key: ActivityKey.MODELS_TRAINING_CREATED }),
      ),
    ).toBe(true);
    // Creating or scheduling a post is terminal for the bell: the lifecycle
    // mapping calls both "processing", but the server's activeOnly filter does
    // not, so the badge used to never clear.
    expect(
      isActiveGenerationActivity(fixture({ key: ActivityKey.POST_CREATED })),
    ).toBe(false);
    expect(
      isActiveGenerationActivity(fixture({ key: ActivityKey.POST_SCHEDULED })),
    ).toBe(false);
  });
  it('does not render created or scheduled posts as still generating', () => {
    expect(
      getGenerationActivityStatus(fixture({ key: ActivityKey.POST_CREATED })),
    ).toBe('ready');
    expect(
      getGenerationActivityStatus(fixture({ key: ActivityKey.POST_SCHEDULED })),
    ).toBe('ready');
    expect(
      getGenerationActivityStatus(
        fixture({ key: ActivityKey.IMAGE_PROCESSING }),
      ),
    ).toBe('generating');
    expect(
      getGenerationActivityStatus(fixture({ key: ActivityKey.IMAGE_FAILED })),
    ).toBe('failed');
  });
  it('keeps the newest durable status when active and recent queries overlap', () => {
    const complete = fixture({ updatedAt: '2026-09-09T10:01:00Z' });
    const processing = fixture({ key: ActivityKey.IMAGE_PROCESSING });
    expect(
      mergeGenerationActivities(
        [complete],
        [processing, fixture({ id: 'foreign', organizationId: 'org-2' })],
        'org-1',
      ),
    ).toEqual([complete]);
  });
});

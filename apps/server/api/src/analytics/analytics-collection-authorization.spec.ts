import {
  admitAnalyticsCollection,
  isAnalyticsCollectionAuthorizationFailure,
} from '@api/analytics/analytics-collection-authorization';
import { analyticsCollectionAuthorizationFixture } from '@api/analytics/analytics-collection-authorization.fixture';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

describe('native collector authorization closure', () => {
  it('holds missing authority and never substitutes a post/workflow creator', async () => {
    try {
      await admitAnalyticsCollection(undefined);
      throw new Error('missing rejection');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(isAnalyticsCollectionAuthorizationFailure(error)).toBe(true);
    }
  });
  it('preserves the actual native denial object so all batch catches can propagate it', async () => {
    const denied = new ForbiddenException('key_revoked');
    const admit = vi.fn(async () => {
      throw denied;
    });
    await expect(
      admitAnalyticsCollection({
        ...analyticsCollectionAuthorizationFixture,
        admit,
      }),
    ).rejects.toBe(denied);
    expect(isAnalyticsCollectionAuthorizationFailure(denied)).toBe(true);
    expect(
      isAnalyticsCollectionAuthorizationFailure(new Error('provider_failed')),
    ).toBe(false);
    expect(admit).toHaveBeenCalledOnce();
  });
  it('does not read authority from exposure or learning context data', async () => {
    await expect(
      admitAnalyticsCollection({
        initiatingActor:
          analyticsCollectionAuthorizationFixture.initiatingActor,
        metrics: { admit: true },
      } as unknown as Parameters<typeof admitAnalyticsCollection>[0]),
    ).rejects.toThrow('actor_required');
  });
  it('rejects a captured actor from another organization before invoking native admission', async () => {
    const admit = vi.fn(async () => {});
    await expect(
      admitAnalyticsCollection(
        { ...analyticsCollectionAuthorizationFixture, admit },
        'other-org',
      ),
    ).rejects.toThrow('actor_scope_changed');
    expect(admit).not.toHaveBeenCalled();
  });
});

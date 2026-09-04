import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  normalizeAgentAppHref,
  normalizeAgentAssetHref,
} from './normalize-agent-app-href';

const IMAGE_ID = testId('image');

describe('normalizeAgentAppHref', () => {
  it('returns undefined for empty hrefs', () => {
    expect(normalizeAgentAppHref(undefined)).toBeUndefined();
    expect(normalizeAgentAppHref(null)).toBeUndefined();
    expect(normalizeAgentAppHref('   ')).toBeUndefined();
  });

  it('rewrites bare legacy publish paths and preserves query/hash', () => {
    expect(normalizeAgentAppHref('/review?tab=failed')).toBe(
      `${APP_ROUTES.PUBLISHING.REVIEW}?tab=failed`,
    );
    expect(normalizeAgentAppHref('/calendar#week')).toBe(
      `${APP_ROUTES.PUBLISHING.CALENDAR}#week`,
    );
    expect(normalizeAgentAppHref('/calendar/posts')).toBe(
      APP_ROUTES.PUBLISHING.CALENDAR,
    );
    expect(normalizeAgentAppHref('/drafts')).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?publicationState=not-posted`,
    );
  });

  it('rewrites brand-scoped and org-scoped review paths', () => {
    expect(normalizeAgentAppHref('/acme/launch/review?q=1')).toBe(
      `/acme/launch${APP_ROUTES.PUBLISHING.REVIEW}?q=1`,
    );
    expect(normalizeAgentAppHref('/acme/~/review')).toBe(
      `/acme/~${APP_ROUTES.PUBLISHING.REVIEW}`,
    );
  });

  it('rewrites retired gallery asset paths to canonical Library deep links', () => {
    expect(normalizeAgentAppHref(`/g/image/${IMAGE_ID}`)).toBe(
      `/library/images?asset=${IMAGE_ID}`,
    );
    expect(normalizeAgentAppHref('/g/video/video-123#details')).toBe(
      '/library/videos?asset=video-123#details',
    );
    expect(normalizeAgentAppHref('/acme/launch/g/voice/voice-123')).toBe(
      '/acme/launch/library/voices?asset=voice-123',
    );
  });

  it('leaves already-valid and unknown paths unchanged', () => {
    expect(normalizeAgentAppHref(APP_ROUTES.PUBLISHING.REVIEW)).toBe(
      APP_ROUTES.PUBLISHING.REVIEW,
    );
    expect(normalizeAgentAppHref('/studio/images')).toBe('/studio/images');
  });
});

describe('normalizeAgentAssetHref', () => {
  it('repairs a persisted bare Library CTA with its exact asset id', () => {
    expect(
      normalizeAgentAssetHref('/library/assets', 'generated image/1'),
    ).toBe('/library/assets?asset=generated+image%2F1');
  });

  it('preserves scope, filters, and hash while replacing a stale asset id', () => {
    expect(
      normalizeAgentAssetHref(
        '/acme/launch/library/images?folder=hero&asset=old#details',
        IMAGE_ID,
      ),
    ).toBe(`/acme/launch/library/images?folder=hero&asset=${IMAGE_ID}#details`);
  });

  it('leaves non-Library CTAs unchanged', () => {
    expect(normalizeAgentAssetHref('/publishing/review', IMAGE_ID)).toBe(
      '/publishing/review',
    );
  });
});

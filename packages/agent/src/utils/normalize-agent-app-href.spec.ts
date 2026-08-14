import { APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { normalizeAgentAppHref } from './normalize-agent-app-href';

describe('normalizeAgentAppHref', () => {
  it('returns undefined for empty hrefs', () => {
    expect(normalizeAgentAppHref(undefined)).toBeUndefined();
    expect(normalizeAgentAppHref(null)).toBeUndefined();
    expect(normalizeAgentAppHref('   ')).toBeUndefined();
  });

  it('rewrites bare legacy publish paths and preserves query/hash', () => {
    expect(normalizeAgentAppHref('/review?tab=failed')).toBe(
      `${APP_ROUTES.PUBLISH.REVIEW}?tab=failed`,
    );
    expect(normalizeAgentAppHref('/calendar#week')).toBe(
      `${APP_ROUTES.PUBLISH.CALENDAR}#week`,
    );
    expect(normalizeAgentAppHref('/calendar/posts')).toBe(
      APP_ROUTES.PUBLISH.CALENDAR,
    );
    expect(normalizeAgentAppHref('/publish/drafts')).toBe(
      APP_ROUTES.PUBLISH.REVIEW,
    );
    expect(normalizeAgentAppHref('/drafts')).toBe(APP_ROUTES.PUBLISH.REVIEW);
  });

  it('rewrites brand-scoped and org-scoped review paths', () => {
    expect(normalizeAgentAppHref('/acme/launch/review?q=1')).toBe(
      `/acme/launch${APP_ROUTES.PUBLISH.REVIEW}?q=1`,
    );
    expect(normalizeAgentAppHref('/acme/~/review')).toBe(
      `/acme/~${APP_ROUTES.PUBLISH.REVIEW}`,
    );
  });

  it('leaves already-valid and unknown paths unchanged', () => {
    expect(normalizeAgentAppHref(APP_ROUTES.PUBLISH.REVIEW)).toBe(
      APP_ROUTES.PUBLISH.REVIEW,
    );
    expect(normalizeAgentAppHref('/studio/images')).toBe('/studio/images');
  });
});

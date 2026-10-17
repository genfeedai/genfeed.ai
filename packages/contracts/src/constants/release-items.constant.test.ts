import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATFORM_FLAGS,
  parsePlatformFlags,
} from './feature-flags.constant';
import {
  getReleaseFlagKey,
  isReleaseItemVisible,
  PLATFORM_RELEASE_FLAG_KEYS,
} from './release-items.constant';

const CLOUD = { hasOrganizationBilling: true, isReleasePreviewEnabled: false };

describe('release items', () => {
  it('stores each release as a release_<id> platform flag', () => {
    expect(getReleaseFlagKey('motion')).toBe('release_motion');
    expect(PLATFORM_RELEASE_FLAG_KEYS).toContain('release_campaigns');
    expect(PLATFORM_RELEASE_FLAG_KEYS).not.toContain('release_playground');
  });

  it('defaults every release to preview-only, unlike module flags', () => {
    expect(DEFAULT_PLATFORM_FLAGS.release_motion).toBe(false);
    expect(DEFAULT_PLATFORM_FLAGS.studio_motion).toBe(true);
    const parsed = parsePlatformFlags({
      release_turbo: true,
      release_clips: 'yes',
      studio: false,
    });
    expect(parsed.release_turbo).toBe(true);
    expect(parsed.release_clips).toBe(false);
    expect(parsed.release_motion).toBe(false);
    expect(parsed.studio).toBe(false);
    expect(parsed.library).toBe(true);
  });

  it('shows a cloud organization only what an operator released', () => {
    expect(isReleaseItemVisible('motion', CLOUD, {})).toBe(false);
    expect(
      isReleaseItemVisible('motion', CLOUD, { release_motion: true }),
    ).toBe(true);
    expect(
      isReleaseItemVisible('motion', CLOUD, { release_motion: 'true' }),
    ).toBe(false);
  });

  it('opens only the items granted to one organization', () => {
    const granted = { ...CLOUD, releasedItemIds: ['motion'] };
    expect(isReleaseItemVisible('motion', granted, {})).toBe(true);
    expect(isReleaseItemVisible('clips', granted, {})).toBe(false);
    expect(
      isReleaseItemVisible('clips', { ...CLOUD, releasedItemIds: 'clips' }, {}),
    ).toBe(false);
  });

  it('shows everything on release preview and self-hosted', () => {
    expect(
      isReleaseItemVisible(
        'campaigns',
        { hasOrganizationBilling: true, isReleasePreviewEnabled: true },
        {},
      ),
    ).toBe(true);
    expect(
      isReleaseItemVisible('campaigns', { hasOrganizationBilling: false }, {}),
    ).toBe(true);
  });

  it('never gates ids outside the release catalog', () => {
    expect(isReleaseItemVisible('playground', CLOUD, {})).toBe(true);
  });

  it('hides everything while organization settings are unknown', () => {
    expect(isReleaseItemVisible('playground', null, {})).toBe(false);
    expect(
      isReleaseItemVisible(
        'motion',
        { hasOrganizationBilling: 'true' },
        { release_motion: true },
      ),
    ).toBe(false);
  });
});

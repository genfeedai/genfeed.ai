import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  twitterAuthorizedSignalEvidenceKeys,
  twitterAuthorizedSignalsSnapshotSchema,
} from '../../src/api-types/contracts/twitter-authorized-signals.contract';

function makeEvidence(
  key: (typeof twitterAuthorizedSignalEvidenceKeys)[number],
) {
  const common = {
    fieldAvailability: { signal: 'available' as const },
    observedAt: '2026-08-14T08:00:00.000Z',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: 'available' as const,
  };

  switch (key) {
    case 'profile-completeness-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'profile-statistics-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-posts-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'publishing-capability-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'first-upload-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-post-metrics-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'native-account-age':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'genfeed-publish-activity':
      return {
        ...common,
        key,
        provenance: 'genfeed_observed' as const,
        value: { attempts: [] },
      };
    default:
      throw new Error(`Unsupported X evidence key: ${key}`);
  }
}

function makeSnapshot() {
  return {
    credentialId: 'credential-1',
    evidence: twitterAuthorizedSignalEvidenceKeys.map(makeEvidence),
    grantedScopes: [],
    platform: CredentialPlatform.TWITTER,
    refreshAttemptedAt: '2026-08-14T08:00:00.000Z',
    state: 'partial' as const,
  };
}

describe('X authorized signals contract', () => {
  it('accepts exactly the canonical platform and Genfeed evidence keys', () => {
    const parsed = twitterAuthorizedSignalsSnapshotSchema.parse(makeSnapshot());

    expect(parsed.platform).toBe(CredentialPlatform.TWITTER);
    expect(parsed.evidence.map((evidence) => evidence.key)).toEqual(
      twitterAuthorizedSignalEvidenceKeys,
    );
    expect(parsed.evidence.map((evidence) => evidence.provenance)).toEqual([
      'platform_verified',
      'platform_verified',
      'platform_verified',
      'platform_verified',
      'platform_verified',
      'platform_verified',
      'platform_verified',
      'genfeed_observed',
    ]);
  });

  it('rejects duplicate evidence that would leave a canonical check unmapped', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[1] = snapshot.evidence[0];

    expect(
      twitterAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });

  it('does not accept a TikTok platform on an X snapshot', () => {
    const snapshot = {
      ...makeSnapshot(),
      platform: CredentialPlatform.TIKTOK,
    };

    expect(
      twitterAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });
});

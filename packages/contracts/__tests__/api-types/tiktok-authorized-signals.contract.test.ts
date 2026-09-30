import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  tiktokAuthorizedSignalEvidenceKeys,
  tiktokAuthorizedSignalsSnapshotSchema,
} from '../../src/api-types/contracts/tiktok-authorized-signals.contract';

function makeEvidence(
  key: (typeof tiktokAuthorizedSignalEvidenceKeys)[number],
) {
  const common = {
    fieldAvailability: { signal: 'available' as const },
    observedAt: '2026-08-12T08:00:00.000Z',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: 'available' as const,
  };

  switch (key) {
    case 'profile-completeness-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'profile-statistics-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'public-videos-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'creator-capabilities-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'first-upload-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-post-metrics-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'genfeed-publish-activity':
      return {
        ...common,
        key,
        provenance: 'genfeed_observed' as const,
        value: { attempts: [] },
      };
    default:
      throw new Error(`Unsupported TikTok evidence key: ${key}`);
  }
}

function makeSnapshot() {
  return {
    credentialId: 'credential-1',
    evidence: tiktokAuthorizedSignalEvidenceKeys.map(makeEvidence),
    grantedScopes: [],
    platform: CredentialPlatform.TIKTOK,
    refreshAttemptedAt: '2026-08-12T08:00:00.000Z',
    state: 'partial' as const,
  };
}

describe('TikTok authorized signals contract', () => {
  it('accepts exactly the canonical platform and Genfeed evidence keys', () => {
    const parsed = tiktokAuthorizedSignalsSnapshotSchema.parse(makeSnapshot());

    expect(parsed.evidence.map((evidence) => evidence.key)).toEqual(
      tiktokAuthorizedSignalEvidenceKeys,
    );
  });

  it('rejects duplicate evidence that would leave a canonical check unmapped', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[1] = snapshot.evidence[0];

    expect(
      tiktokAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  instagramAuthorizedSignalEvidenceKeys,
  instagramAuthorizedSignalsSnapshotSchema,
} from '../../src/api-types/contracts/instagram-authorized-signals.contract';

function makeEvidence(
  key: (typeof instagramAuthorizedSignalEvidenceKeys)[number],
) {
  const common = {
    fieldAvailability: { signal: 'available' as const },
    observedAt: '2026-08-12T08:00:00.000Z',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: 'available' as const,
  };

  switch (key) {
    case 'profile-fields-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-media-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'publishing-capability-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'media-performance-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'first-publish-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'genfeed-publish-outcomes-observed':
      return {
        ...common,
        key,
        provenance: 'genfeed_observed' as const,
        value: { attempts: [] },
      };
    default:
      throw new Error(`Unsupported Instagram evidence key: ${key}`);
  }
}

function makeSnapshot() {
  return {
    credentialId: 'credential-1',
    evidence: instagramAuthorizedSignalEvidenceKeys.map(makeEvidence),
    grantedScopes: [],
    platform: CredentialPlatform.INSTAGRAM,
    refreshAttemptedAt: '2026-08-12T08:00:00.000Z',
    state: 'partial' as const,
  };
}

describe('Instagram authorized signals contract', () => {
  it('accepts exactly the canonical platform and Genfeed evidence keys', () => {
    const parsed = instagramAuthorizedSignalsSnapshotSchema.parse(
      makeSnapshot(),
    );

    expect(parsed.evidence.map((evidence) => evidence.key)).toEqual(
      instagramAuthorizedSignalEvidenceKeys,
    );
    expect(parsed.platform).toBe(CredentialPlatform.INSTAGRAM);
  });

  it('keeps native consumption evidence out of the authorized snapshot', () => {
    const parsed = instagramAuthorizedSignalsSnapshotSchema.parse(
      makeSnapshot(),
    );

    expect(parsed.evidence.map((evidence) => evidence.key)).not.toEqual(
      expect.arrayContaining([
        'niche-consumption-confirmed',
        'contextual-comments-confirmed',
        'selective-engagement-confirmed',
      ]),
    );
    expect(
      parsed.evidence.filter(
        (evidence) => evidence.provenance === 'user_confirmed',
      ),
    ).toEqual([]);
  });

  it('rejects duplicate evidence that would leave a canonical check unmapped', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[1] = snapshot.evidence[0];

    expect(
      instagramAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });

  it('accepts professional-account-limited as an actionable reason', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[2] = {
      ...snapshot.evidence[2],
      reason: 'professional_account_limited',
      status: 'permission_limited',
    };

    expect(
      instagramAuthorizedSignalsSnapshotSchema.parse(snapshot).evidence[2],
    ).toMatchObject({
      key: 'publishing-capability-snapshot',
      reason: 'professional_account_limited',
      status: 'permission_limited',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  youtubeAuthorizedSignalEvidenceKeys,
  youtubeAuthorizedSignalsSnapshotSchema,
} from '../../src/api-types/contracts/youtube-authorized-signals.contract';

function makeEvidence(
  key: (typeof youtubeAuthorizedSignalEvidenceKeys)[number],
) {
  const common = {
    fieldAvailability: { signal: 'available' as const },
    observedAt: '2026-08-24T08:00:00.000Z',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: 'available' as const,
  };

  switch (key) {
    case 'channel-fields-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-uploads-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'publishing-capability-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-video-analytics-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'first-upload-platform-signal':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'native-account-age':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'genfeed-publish-outcomes-observed':
      return {
        ...common,
        key,
        provenance: 'genfeed_observed' as const,
        value: { attempts: [] },
      };
    default:
      throw new Error(`Unsupported YouTube evidence key: ${key}`);
  }
}

function makeSnapshot() {
  return {
    credentialId: 'credential-1',
    evidence: youtubeAuthorizedSignalEvidenceKeys.map(makeEvidence),
    grantedScopes: [],
    platform: CredentialPlatform.YOUTUBE,
    refreshAttemptedAt: '2026-08-24T08:00:00.000Z',
    state: 'partial' as const,
  };
}

describe('YouTube authorized signals contract', () => {
  it('accepts exactly the canonical platform and Genfeed evidence keys', () => {
    const parsed = youtubeAuthorizedSignalsSnapshotSchema.parse(makeSnapshot());

    expect(parsed.evidence.map((evidence) => evidence.key)).toEqual(
      youtubeAuthorizedSignalEvidenceKeys,
    );
    expect(parsed.platform).toBe(CredentialPlatform.YOUTUBE);
  });

  it('keeps native watch, search, subscription, and homepage evidence out of the authorized snapshot', () => {
    const parsed = youtubeAuthorizedSignalsSnapshotSchema.parse(makeSnapshot());

    expect(parsed.evidence.map((evidence) => evidence.key)).not.toEqual(
      expect.arrayContaining([
        'watch-history-confirmed',
        'subscriptions-confirmed',
        'likes-confirmed',
        'comments-confirmed',
        'search-activity-confirmed',
        'homepage-tuning-confirmed',
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
      youtubeAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });

  it('accepts missing analytics and channel-selection as recoverable reasons', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[3] = {
      ...snapshot.evidence[3],
      reason: 'missing_scope',
      status: 'permission_limited',
    };
    snapshot.evidence[0] = {
      ...snapshot.evidence[0],
      reason: 'channel_selection_required',
      status: 'permission_limited',
    };

    const parsed = youtubeAuthorizedSignalsSnapshotSchema.parse(snapshot);

    expect(parsed.evidence[0]).toMatchObject({
      key: 'channel-fields-platform-signal',
      reason: 'channel_selection_required',
      status: 'permission_limited',
    });
    expect(parsed.evidence[3]).toMatchObject({
      key: 'owned-video-analytics-snapshot',
      reason: 'missing_scope',
      status: 'permission_limited',
    });
  });

  it('records Genfeed clip lineage without treating it as platform telemetry', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[6] = {
      ...snapshot.evidence[6],
      provenance: 'genfeed_observed',
      status: 'available',
      value: {
        attempts: [
          {
            attemptedAt: '2026-08-24T08:00:00.000Z',
            mediaType: 'short',
            outcome: 'published',
            postId: 'post-1',
            sourcePostId: 'source-post-1',
          },
        ],
      },
    };

    expect(
      youtubeAuthorizedSignalsSnapshotSchema.parse(snapshot).evidence[6],
    ).toMatchObject({
      key: 'genfeed-publish-outcomes-observed',
      provenance: 'genfeed_observed',
      value: {
        attempts: [{ sourcePostId: 'source-post-1', mediaType: 'short' }],
      },
    });
  });
});

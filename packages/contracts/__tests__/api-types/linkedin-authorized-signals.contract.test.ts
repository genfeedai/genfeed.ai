import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  linkedinAuthorizedSignalEvidenceKeys,
  linkedinAuthorizedSignalsSnapshotSchema,
} from '../../src/api-types/contracts/linkedin-authorized-signals.contract';

function makeEvidence(
  key: (typeof linkedinAuthorizedSignalEvidenceKeys)[number],
) {
  const common = {
    fieldAvailability: { signal: 'available' as const },
    observedAt: '2026-08-24T08:00:00.000Z',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: 'available' as const,
  };

  switch (key) {
    case 'member-profile-fields-platform-signal':
      return {
        ...common,
        key,
        provenance: 'platform_verified' as const,
        value: { accountKind: 'member' as const, id: 'member-1' },
      };
    case 'organization-page-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'member-publishing-capability-snapshot':
      return {
        ...common,
        key,
        provenance: 'platform_verified' as const,
        value: { accountKind: 'member' as const, canPublish: true },
      };
    case 'organization-publishing-capability-snapshot':
      return {
        ...common,
        key,
        provenance: 'platform_verified' as const,
        value: { accountKind: 'organization' as const, canPublish: false },
      };
    case 'owned-posts-snapshot':
      return { ...common, key, provenance: 'platform_verified' as const };
    case 'owned-post-performance-snapshot':
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
      throw new Error(`Unsupported LinkedIn evidence key: ${key}`);
  }
}

function makeSnapshot() {
  return {
    credentialId: 'credential-1',
    evidence: linkedinAuthorizedSignalEvidenceKeys.map(makeEvidence),
    grantedScopes: [],
    platform: CredentialPlatform.LINKEDIN,
    refreshAttemptedAt: '2026-08-24T08:00:00.000Z',
    state: 'partial' as const,
  };
}

describe('LinkedIn authorized signals contract', () => {
  it('accepts exactly the canonical member, organization, and Genfeed evidence keys', () => {
    const parsed = linkedinAuthorizedSignalsSnapshotSchema.parse(
      makeSnapshot(),
    );

    expect(parsed.evidence.map((evidence) => evidence.key)).toEqual(
      linkedinAuthorizedSignalEvidenceKeys,
    );
    expect(parsed.platform).toBe(CredentialPlatform.LINKEDIN);
  });

  it('keeps feed, connections, comments, reactions, saves, messages, and SSI out of the authorized snapshot', () => {
    const parsed = linkedinAuthorizedSignalsSnapshotSchema.parse(
      makeSnapshot(),
    );

    expect(parsed.evidence.map((evidence) => evidence.key)).not.toEqual(
      expect.arrayContaining([
        'feed-consumption-confirmed',
        'connection-requests-confirmed',
        'comments-confirmed',
        'reactions-confirmed',
        'saves-confirmed',
        'messages-confirmed',
        'ssi-score',
        'ssi-observation',
      ]),
    );
    expect(
      parsed.evidence.filter(
        (evidence) => evidence.provenance === 'user_confirmed',
      ),
    ).toEqual([]);
  });

  it('keeps member and organization publishing as separate readiness claims', () => {
    const parsed = linkedinAuthorizedSignalsSnapshotSchema.parse(
      makeSnapshot(),
    );
    const member = parsed.evidence.find(
      (evidence) => evidence.key === 'member-publishing-capability-snapshot',
    );
    const organization = parsed.evidence.find(
      (evidence) =>
        evidence.key === 'organization-publishing-capability-snapshot',
    );

    expect(member).toMatchObject({
      provenance: 'platform_verified',
      value: { accountKind: 'member', canPublish: true },
    });
    expect(organization).toMatchObject({
      provenance: 'platform_verified',
      value: { accountKind: 'organization', canPublish: false },
    });
  });

  it('rejects duplicate evidence that would leave a canonical check unmapped', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[1] = snapshot.evidence[0];

    expect(
      linkedinAuthorizedSignalsSnapshotSchema.safeParse(snapshot).success,
    ).toBe(false);
  });

  it('accepts missing organization scopes and page selection as recoverable reasons', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[1] = {
      ...snapshot.evidence[1],
      reason: 'missing_scope',
      status: 'permission_limited',
    };
    snapshot.evidence[3] = {
      ...snapshot.evidence[3],
      reason: 'organization_page_selection_required',
      status: 'permission_limited',
    };

    const parsed = linkedinAuthorizedSignalsSnapshotSchema.parse(snapshot);

    expect(parsed.evidence[1]).toMatchObject({
      key: 'organization-page-snapshot',
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(parsed.evidence[3]).toMatchObject({
      key: 'organization-publishing-capability-snapshot',
      reason: 'organization_page_selection_required',
      status: 'permission_limited',
    });
  });

  it('records Genfeed cadence without treating it as platform telemetry', () => {
    const snapshot = makeSnapshot();
    snapshot.evidence[7] = {
      ...snapshot.evidence[7],
      provenance: 'genfeed_observed',
      status: 'available',
      value: {
        attempts: [
          {
            attemptedAt: '2026-08-24T08:00:00.000Z',
            outcome: 'published',
            postId: 'post-1',
          },
        ],
      },
    };

    expect(
      linkedinAuthorizedSignalsSnapshotSchema.parse(snapshot).evidence[7],
    ).toMatchObject({
      key: 'genfeed-publish-outcomes-observed',
      provenance: 'genfeed_observed',
      value: {
        attempts: [{ outcome: 'published', postId: 'post-1' }],
      },
    });
  });
});

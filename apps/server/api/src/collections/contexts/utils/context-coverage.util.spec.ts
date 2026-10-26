import {
  deriveKnowledgeCoverageFamily,
  deriveSocialConnectionsCoverageFamily,
  describeContextCoverage,
  isContextCoverageIncomplete,
  type KnowledgeCoverageSourceRow,
  type SocialCoverageCredentialRow,
} from '@api/collections/contexts/utils/context-coverage.util';
import {
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourcePurpose,
  KnowledgeSourceSyncState,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const now = new Date('2026-10-26T12:00:00.000Z');
const complete = { isInventoryComplete: true, now };

function source(
  id: string,
  overrides: Partial<KnowledgeCoverageSourceRow> = {},
  version: Partial<
    NonNullable<KnowledgeCoverageSourceRow['currentVersion']>
  > = {},
): KnowledgeCoverageSourceRow {
  return {
    currentVersion: {
      expiresAt: null,
      processingState: KnowledgeProcessingState.READY,
      retentionState: KnowledgeRetentionState.RETAINED,
      retrievalState: KnowledgeRetrievalState.ACTIVE,
      ...version,
    },
    id,
    lastSuccessfulSyncAt: null,
    staleAt: null,
    syncState: null,
    title: `Source ${id}`,
    ...overrides,
  };
}

function knowledge(rows: KnowledgeCoverageSourceRow[], options = complete) {
  return deriveKnowledgeCoverageFamily(
    KnowledgeSourcePurpose.BRAND_TRUTH,
    rows,
    options,
  );
}

describe('deriveKnowledgeCoverageFamily', () => {
  it('is empty only for a complete inventory with no members', () => {
    expect(knowledge([]).state).toBe('empty');
    expect(knowledge([], { isInventoryComplete: false, now }).state).toBe(
      'partial',
    );
  });

  it('is available when every member is usable', () => {
    const family = knowledge([source('a'), source('b')]);
    expect(family.state).toBe('available');
    expect(family.recoveries).toEqual([]);
  });

  it('never reports a truncated inventory as available', () => {
    expect(
      knowledge([source('a')], { isInventoryComplete: false, now }).state,
    ).toBe('partial');
  });

  it('keeps a shared unhealthy state and offers a recovery per source', () => {
    const stale = knowledge([
      source('a', { syncState: KnowledgeSourceSyncState.STALE }),
      source('b', { staleAt: new Date('2026-10-01T00:00:00.000Z') }),
    ]);
    expect(stale.state).toBe('stale');
    expect(stale.recoveries).toEqual([
      {
        kind: 'open_knowledge',
        label: 'Source a',
        sourceId: 'a',
        state: 'stale',
      },
      {
        kind: 'open_knowledge',
        label: 'Source b',
        sourceId: 'b',
        state: 'stale',
      },
    ]);

    const failed = knowledge([
      source('a', {}, { processingState: KnowledgeProcessingState.FAILED }),
      source('b', { syncState: KnowledgeSourceSyncState.FAILED }),
    ]);
    expect(failed.state).toBe('failed');
  });

  it('is partial when a usable member sits next to an unhealthy one', () => {
    const family = knowledge([
      source('a'),
      source('b', { syncState: KnowledgeSourceSyncState.FAILED }),
    ]);
    expect(family.state).toBe('partial');
    expect(family.recoveries).toEqual([
      {
        kind: 'open_knowledge',
        label: 'Source b',
        sourceId: 'b',
        state: 'failed',
      },
    ]);
  });

  it('is partial for mixed unhealthy states even with no usable member', () => {
    expect(
      knowledge([
        source('a', { syncState: KnowledgeSourceSyncState.STALE }),
        source('b', { syncState: KnowledgeSourceSyncState.FAILED }),
      ]).state,
    ).toBe('partial');
  });

  it('treats pending ingestion and a missing current version as partial', () => {
    const pending = knowledge([
      source('a', {}, { processingState: KnowledgeProcessingState.QUEUED }),
      source('b', {}, { processingState: KnowledgeProcessingState.PROCESSING }),
      source('c', { currentVersion: null }),
    ]);
    expect(pending.state).toBe('partial');
    expect(pending.recoveries.map((recovery) => recovery.state)).toEqual([
      'partial',
      'partial',
      'partial',
    ]);
  });

  it('keeps a usable current version partial while its refresh is pending', () => {
    expect(
      knowledge([
        source('a'),
        source('b', {}, { processingState: KnowledgeProcessingState.QUEUED }),
      ]).state,
    ).toBe('partial');
  });

  it('excludes contradicted, quarantined, superseded and purged versions', () => {
    for (const version of [
      { retrievalState: KnowledgeRetrievalState.CONTRADICTED },
      { retrievalState: KnowledgeRetrievalState.QUARANTINED },
      { retrievalState: KnowledgeRetrievalState.SUPERSEDED },
      { retentionState: KnowledgeRetentionState.PAYLOAD_PURGED },
    ]) {
      const family = knowledge([source('a'), source('b', {}, version)]);
      expect(family.state).toBe('partial');
      expect(family.recoveries).toEqual([]);
    }
  });

  it('treats an expired version as stale', () => {
    expect(
      knowledge([
        source('a', {}, { expiresAt: new Date('2026-10-25T00:00:00.000Z') }),
      ]).state,
    ).toBe('stale');
    expect(
      knowledge([
        source('a', {}, { retrievalState: KnowledgeRetrievalState.EXPIRED }),
      ]).state,
    ).toBe('stale');
  });

  it('treats an in-flight check as usable', () => {
    expect(
      knowledge([source('a', { syncState: KnowledgeSourceSyncState.CHECKING })])
        .state,
    ).toBe('available');
  });

  it('uses only real sync successes for the last success time', () => {
    const family = knowledge([
      source('a', {
        lastSuccessfulSyncAt: new Date('2026-10-20T00:00:00.000Z'),
      }),
      source('b', {
        lastSuccessfulSyncAt: new Date('2026-10-24T00:00:00.000Z'),
        syncState: KnowledgeSourceSyncState.FAILED,
      }),
      source('c'),
    ]);
    expect(family.lastSuccessAt).toBe('2026-10-24T00:00:00.000Z');
    expect(knowledge([source('a')]).lastSuccessAt).toBeNull();
  });

  it('caps recoveries at five', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      source(`s${index}`, { syncState: KnowledgeSourceSyncState.FAILED }),
    );
    expect(knowledge(rows).recoveries).toHaveLength(5);
  });
});

describe('deriveSocialConnectionsCoverageFamily', () => {
  const credential = (
    platform: string,
    overrides: Partial<SocialCoverageCredentialRow> = {},
  ): SocialCoverageCredentialRow => ({
    isConnected: true,
    platform,
    refreshTokenExpiry: null,
    ...overrides,
  });

  it('is empty with no connections and available when all are connected', () => {
    expect(deriveSocialConnectionsCoverageFamily([], complete).state).toBe(
      'empty',
    );
    const family = deriveSocialConnectionsCoverageFamily(
      [
        credential('twitter'),
        credential('youtube', {
          refreshTokenExpiry: new Date('2026-12-01T00:00:00.000Z'),
        }),
      ],
      complete,
    );
    expect(family.state).toBe('available');
    expect(family.lastSuccessAt).toBeNull();
  });

  it('treats a disconnected or expired credential as disconnected with a reconnect', () => {
    const family = deriveSocialConnectionsCoverageFamily(
      [
        credential('twitter', { isConnected: false }),
        credential('youtube', {
          refreshTokenExpiry: new Date('2026-10-26T12:00:00.000Z'),
        }),
      ],
      complete,
    );
    expect(family.state).toBe('disconnected');
    expect(family.recoveries).toEqual([
      {
        kind: 'reconnect',
        label: 'Reconnect account',
        platform: 'twitter',
        state: 'disconnected',
      },
      {
        kind: 'reconnect',
        label: 'Reconnect account',
        platform: 'youtube',
        state: 'disconnected',
      },
    ]);
  });

  it('is partial when only some credentials are disconnected', () => {
    expect(
      deriveSocialConnectionsCoverageFamily(
        [credential('twitter'), credential('youtube', { isConnected: false })],
        complete,
      ).state,
    ).toBe('partial');
  });

  it('dedupes platforms and never lets a truncated list read as available', () => {
    const family = deriveSocialConnectionsCoverageFamily(
      [
        credential('twitter', { isConnected: false }),
        credential('twitter', { isConnected: false }),
      ],
      complete,
    );
    expect(family.recoveries).toHaveLength(1);
    expect(
      deriveSocialConnectionsCoverageFamily([credential('twitter')], {
        isInventoryComplete: false,
        now,
      }).state,
    ).toBe('partial');
  });
});

describe('coverage summary', () => {
  it('flags only unhealthy families as incomplete', () => {
    const available = knowledge([source('a')]);
    const empty = knowledge([]);
    const stale = knowledge([
      source('a', { syncState: KnowledgeSourceSyncState.STALE }),
    ]);
    expect(isContextCoverageIncomplete([available, empty])).toBe(false);
    expect(isContextCoverageIncomplete([available, stale])).toBe(true);
  });

  it('tells the agent not to claim nothing exists when coverage is incomplete', () => {
    const stale = knowledge([
      source('a', { syncState: KnowledgeSourceSyncState.STALE }),
    ]);
    expect(describeContextCoverage([stale])).toContain(
      'brand truth knowledge (stale)',
    );
    expect(describeContextCoverage([stale])).toContain('Do not tell the user');
    expect(describeContextCoverage([knowledge([source('a')])])).toContain(
      'Coverage is complete',
    );
  });
});

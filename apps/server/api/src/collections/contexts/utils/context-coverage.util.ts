import {
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  type KnowledgeSourcePurpose,
  KnowledgeSourceSyncState,
} from '@genfeedai/contracts';
import type {
  ContextCoverageFamily,
  ContextCoverageRecovery,
  ContextCoverageState,
} from '@genfeedai/contracts/interfaces';

export const CONTEXT_COVERAGE_MAX_RECOVERIES = 5;

type MemberState = 'excluded' | 'failed' | 'pending' | 'stale' | 'usable';

/** Only the fields coverage needs from a Knowledge source and its current version. */
export interface KnowledgeCoverageSourceRow {
  currentVersion: {
    expiresAt: Date | null;
    processingState: `${KnowledgeProcessingState}`;
    retentionState: `${KnowledgeRetentionState}`;
    retrievalState: `${KnowledgeRetrievalState}`;
  } | null;
  id: string;
  lastSuccessfulSyncAt: Date | null;
  staleAt: Date | null;
  syncState: `${KnowledgeSourceSyncState}` | null;
  title: string;
}

/** Only the connection facts coverage needs from a credential; never identity or tokens. */
export interface SocialCoverageCredentialRow {
  isConnected: boolean;
  platform: string;
  refreshTokenExpiry: Date | null;
}

function classifyKnowledgeSource(
  row: KnowledgeCoverageSourceRow,
  now: Date,
): MemberState {
  const version = row.currentVersion;
  if (!version) return 'pending';
  if (version.processingState === KnowledgeProcessingState.FAILED)
    return 'failed';
  if (version.processingState !== KnowledgeProcessingState.READY)
    return 'pending';
  if (version.retentionState !== KnowledgeRetentionState.RETAINED)
    return 'excluded';
  if (
    version.retrievalState === KnowledgeRetrievalState.CONTRADICTED ||
    version.retrievalState === KnowledgeRetrievalState.QUARANTINED ||
    version.retrievalState === KnowledgeRetrievalState.SUPERSEDED
  ) {
    return 'excluded';
  }
  if (
    version.retrievalState === KnowledgeRetrievalState.EXPIRED ||
    (version.expiresAt && version.expiresAt <= now)
  ) {
    return 'stale';
  }
  if (row.syncState === KnowledgeSourceSyncState.FAILED) return 'failed';
  if (
    row.syncState === KnowledgeSourceSyncState.STALE ||
    version.retrievalState === KnowledgeRetrievalState.STALE ||
    (row.staleAt && row.staleAt <= now)
  ) {
    return 'stale';
  }
  return 'usable';
}

/**
 * One reducer for every family: zero members is `empty`; all usable is
 * `available`; members that all share one unhealthy state keep that state;
 * anything mixed, pending or excluded is `partial`. A complete-looking
 * inventory that was cut short can never be better than `partial`.
 */
function reduceMemberStates(
  states: readonly MemberState[],
  isInventoryComplete: boolean,
): ContextCoverageState {
  if (states.length === 0) return isInventoryComplete ? 'empty' : 'partial';
  if (!isInventoryComplete) return 'partial';
  if (states.every((state) => state === 'usable')) return 'available';
  const first = states[0];
  if (
    (first === 'stale' || first === 'failed') &&
    states.every((state) => state === first)
  ) {
    return first;
  }
  return 'partial';
}

function latest(dates: readonly (Date | null)[]): string | null {
  let max: Date | null = null;
  for (const date of dates) {
    if (date && (!max || date > max)) max = date;
  }
  return max ? max.toISOString() : null;
}

/** Only a member the user can act on gets a recovery; pending ingestion shows as partial. */
function toRecoveryState(state: MemberState): ContextCoverageState | null {
  if (state === 'failed' || state === 'stale') return state;
  return state === 'pending' ? 'partial' : null;
}

export function deriveKnowledgeCoverageFamily(
  purpose: KnowledgeSourcePurpose,
  rows: readonly KnowledgeCoverageSourceRow[],
  options: { isInventoryComplete: boolean; now: Date },
): ContextCoverageFamily {
  const classified = rows.map((row) => ({
    row,
    state: classifyKnowledgeSource(row, options.now),
  }));
  const state = reduceMemberStates(
    classified.map((member) => member.state),
    options.isInventoryComplete,
  );
  const recoveries: ContextCoverageRecovery[] = [];
  for (const member of classified) {
    if (recoveries.length >= CONTEXT_COVERAGE_MAX_RECOVERIES) break;
    const recoveryState = toRecoveryState(member.state);
    if (recoveryState) {
      recoveries.push({
        kind: 'open_knowledge',
        label: member.row.title,
        sourceId: member.row.id,
        state: recoveryState,
      });
    }
  }
  return {
    family: 'knowledge',
    lastSuccessAt: latest(rows.map((row) => row.lastSuccessfulSyncAt)),
    purpose,
    recoveries,
    state,
  };
}

export function deriveSocialConnectionsCoverageFamily(
  rows: readonly SocialCoverageCredentialRow[],
  options: { isInventoryComplete: boolean; now: Date },
): ContextCoverageFamily {
  const classified = rows.map((row) => ({
    platform: row.platform,
    state:
      !row.isConnected ||
      (row.refreshTokenExpiry !== null && row.refreshTokenExpiry <= options.now)
        ? ('disconnected' as const)
        : ('usable' as const),
  }));
  const disconnected = classified.filter(
    (member) => member.state === 'disconnected',
  );
  let state: ContextCoverageState;
  if (classified.length === 0) {
    state = options.isInventoryComplete ? 'empty' : 'partial';
  } else if (!options.isInventoryComplete) {
    state = 'partial';
  } else if (disconnected.length === 0) {
    state = 'available';
  } else if (disconnected.length === classified.length) {
    state = 'disconnected';
  } else {
    state = 'partial';
  }
  const platforms = [...new Set(disconnected.map((member) => member.platform))];
  return {
    family: 'social_connections',
    // No credential field records a successful operation, so none is invented.
    lastSuccessAt: null,
    recoveries: platforms
      .slice(0, CONTEXT_COVERAGE_MAX_RECOVERIES)
      .map((platform) => ({
        kind: 'reconnect',
        label: 'Reconnect account',
        platform,
        state: 'disconnected',
      })),
    state,
  };
}

export function isContextCoverageIncomplete(
  families: readonly ContextCoverageFamily[],
): boolean {
  return families.some(
    (family) => family.state !== 'available' && family.state !== 'empty',
  );
}

export function describeContextCoverage(
  families: readonly ContextCoverageFamily[],
): string {
  const incomplete = families.filter(
    (family) => family.state !== 'available' && family.state !== 'empty',
  );
  if (incomplete.length === 0) {
    return 'Coverage is complete for the requested sources. Zero results still do not prove a fact does not exist.';
  }
  const names = incomplete
    .map((family) =>
      family.family === 'knowledge'
        ? `${family.purpose?.toLowerCase().replace('_', ' ') ?? 'knowledge'} knowledge (${family.state})`
        : `social connections (${family.state})`,
    )
    .join(', ');
  return `Coverage is incomplete: ${names}. Do not tell the user nothing exists; say which sources could not be fully read.`;
}

import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';

export const WORKFLOW_EXECUTION_RETENTION_METADATA_KEY = 'executionRetention';

export type ParsedWorkflowExecutionRetention = {
  purgeAfterHours: number | null;
  scrubAllNodePayloads: boolean;
  scrubNodeIds: string[];
};

const MAX_EPHEMERAL_EXECUTION_HOURS = 24;

export function parseWorkflowExecutionRetention(
  metadata: Record<string, unknown>,
): ParsedWorkflowExecutionRetention {
  const raw = metadata[WORKFLOW_EXECUTION_RETENTION_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      purgeAfterHours: null,
      scrubAllNodePayloads: false,
      scrubNodeIds: [],
    };
  }

  const contract = raw as Record<string, unknown>;
  const scrubNodePayloads = contract.scrubNodePayloads;
  const scrubAllNodePayloads = scrubNodePayloads === 'all';
  const scrubNodeIds = Array.isArray(scrubNodePayloads)
    ? [
        ...new Set(
          scrubNodePayloads
            .filter(
              (nodeId): nodeId is string =>
                typeof nodeId === 'string' && nodeId.trim().length > 0,
            )
            .map((nodeId) => nodeId.trim()),
        ),
      ]
    : [];
  const purgeAfterHours = contract.purgeAfterHours;
  const normalizedPurgeAfterHours =
    typeof purgeAfterHours === 'number' &&
    Number.isInteger(purgeAfterHours) &&
    purgeAfterHours >= 1 &&
    purgeAfterHours <= MAX_EPHEMERAL_EXECUTION_HOURS
      ? purgeAfterHours
      : null;

  if (purgeAfterHours !== undefined && normalizedPurgeAfterHours === null) {
    throw new Error('purgeAfterHours must be an integer from 1 through 24');
  }
  if (normalizedPurgeAfterHours !== null && !scrubAllNodePayloads) {
    throw new Error(
      'Ephemeral workflow executions must scrub all node payloads before purge',
    );
  }

  return {
    purgeAfterHours: normalizedPurgeAfterHours,
    scrubAllNodePayloads,
    scrubNodeIds,
  };
}

/**
 * How long a system workflow's run history is kept (#10382).
 *
 * - `background`: platform sweeps, fan-out children and per-item work that no
 *   person or agent is waiting on. The run row and its node results are
 *   deleted in bulk after a short window.
 * - `kept`: runs a person or an agent started. History stays.
 *
 * Every system workflow definition must choose one, so a new workflow cannot
 * ship without a retention decision.
 */
export const SystemWorkflowRetention = {
  BACKGROUND: 'background',
  KEPT: 'kept',
} as const;

export type SystemWorkflowRetention =
  (typeof SystemWorkflowRetention)[keyof typeof SystemWorkflowRetention];

/** Set by the system workflow runner on every run it starts. */
export const WORKFLOW_RUN_RETENTION_METADATA_KEY = 'runRetention';

/** The run retention the runner recorded in `metadata`, if it is a known value. */
export function readRunRetention(
  metadata: Record<string, unknown>,
): SystemWorkflowRetention | null {
  const value = metadata[WORKFLOW_RUN_RETENTION_METADATA_KEY];
  return value === SystemWorkflowRetention.BACKGROUND ||
    value === SystemWorkflowRetention.KEPT
    ? value
    : null;
}

/**
 * What one run keeps. A `background` workflow still keeps the history of a run
 * a person or an agent started (an `INTERACTIVE` dispatch), such as a user's
 * publish-now next to the per-minute publish sweep.
 */
export function resolveRunRetention(
  definitionRetention: SystemWorkflowRetention,
  dispatchClass?: SystemWorkflowDispatchClass,
): SystemWorkflowRetention {
  return definitionRetention === SystemWorkflowRetention.BACKGROUND &&
    dispatchClass !== SystemWorkflowDispatchClass.INTERACTIVE
    ? SystemWorkflowRetention.BACKGROUND
    : SystemWorkflowRetention.KEPT;
}

const BACKGROUND_RUN_SUCCESS_PURGE_HOURS = 24;
/** The admin failure feed reads failed runs, so they outlive successful ones. */
const BACKGROUND_RUN_FAILURE_PURGE_HOURS = 14 * 24;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * When a finished run of a `background` workflow may be deleted, or `null`
 * when its history is kept.
 */
export function resolveBackgroundRunPurgeAt(
  retentionPolicy: string | null | undefined,
  outcome: { completedAt: Date; isSuccess: boolean },
): Date | null {
  if (retentionPolicy !== SystemWorkflowRetention.BACKGROUND) {
    return null;
  }
  const hours = outcome.isSuccess
    ? BACKGROUND_RUN_SUCCESS_PURGE_HOURS
    : BACKGROUND_RUN_FAILURE_PURGE_HOURS;
  return new Date(outcome.completedAt.getTime() + hours * MS_PER_HOUR);
}

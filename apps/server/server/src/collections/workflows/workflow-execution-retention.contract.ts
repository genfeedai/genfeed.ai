export const WORKFLOW_EXECUTION_RETENTION_METADATA_KEY = 'executionRetention';

export type WorkflowExecutionRetentionContract = {
  /** Scrub every node input/output after the terminal result is returned. */
  scrubNodePayloads?: 'all' | string[];
  /** Hard-delete the scrubbed execution after 1–24 hours. */
  purgeAfterHours?: number;
};

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

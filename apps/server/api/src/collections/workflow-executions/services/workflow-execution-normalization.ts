import type { WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import {
  composeEtaMetadata,
  readNodeResults,
  readOptionalNumber,
  readOptionalString,
  readRecord,
  type WorkflowExecutionScalarRow,
} from '@api/collections/workflow-executions/services/workflow-execution-runtime.util';
import { normalizeActionOrigin, withActionOriginMetadata } from '@api/index';
import type { ActionOriginContext } from '@genfeedai/contracts';

export function normalizeWorkflowExecution(
  normalized: WorkflowExecutionDocument,
): WorkflowExecutionDocument {
  if (!normalized || typeof normalized !== 'object') {
    return normalized;
  }

  const result = readRecord(normalized.result);
  const row = normalized as WorkflowExecutionDocument &
    WorkflowExecutionScalarRow;
  const metadata = readRecord(result.metadata);
  const storedContext: ActionOriginContext = {
    ...(typeof metadata.actorUserId === 'string'
      ? { actorUserId: metadata.actorUserId }
      : {}),
    ...(typeof metadata.apiKeyId === 'string'
      ? { apiKeyId: metadata.apiKeyId }
      : {}),
    origin: normalizeActionOrigin(metadata.origin),
  };
  const eta = composeEtaMetadata(row, readRecord(metadata.eta));
  const normalizedMetadata = withActionOriginMetadata(
    Object.keys(eta).length > 0 ? { ...metadata, eta } : metadata,
    storedContext,
  );
  const relationNodeResults = readNodeResults(row.nodeResults);
  const nodeResults =
    relationNodeResults.length > 0
      ? relationNodeResults
      : readNodeResults(result.nodeResults);
  const creditsUsed =
    readOptionalNumber(row.creditsUsed) ??
    readOptionalNumber(result.creditsUsed);
  const durationMs =
    readOptionalNumber(row.durationMs) ?? readOptionalNumber(result.durationMs);
  const progress =
    readOptionalNumber(row.progress) ??
    readOptionalNumber(result.progress) ??
    0;
  const failedNodeId =
    readOptionalString(row.failedNodeId) ??
    readOptionalString(result.failedNodeId) ??
    null;

  return {
    ...normalized,
    creditsUsed,
    durationMs,
    failedNodeId,
    inputValues: readRecord(result.inputValues),
    metadata: normalizedMetadata,
    nodeResults,
    progress,
    result: { ...result, metadata: normalizedMetadata },
  };
}

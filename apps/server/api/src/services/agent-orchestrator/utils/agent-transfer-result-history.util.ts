import { fenceUntrustedContent } from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import { AgentMessageRole } from '@genfeedai/contracts';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

const MAX_LISTED_OUTPUTS = 20;

interface TransferResultSource {
  content?: string | null;
  metadata?: unknown;
  role?: string | null;
}

/**
 * Each output as the whole reference `transfer_agent_conversation` takes, so
 * the master can pass it on as is. Anything that is not a complete reference
 * is left out.
 */
function listOutputs(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MAX_LISTED_OUTPUTS).flatMap((item: unknown) => {
    const record = readRecord(item);
    const kind = readString(record.kind);
    const organizationId = readString(record.organizationId);
    const recordId = readString(record.recordId);
    const serializer = readString(record.serializer);
    const brandId = readString(record.brandId);
    if (!kind || !organizationId || !recordId || !serializer) {
      return [];
    }
    return [
      {
        ...(brandId ? { brandId } : {}),
        kind,
        organizationId,
        recordId,
        serializer,
      },
    ];
  });
}

/**
 * The model-facing text of the note a finished child thread leaves in the
 * thread that handed it the work (#8527), or `null` for any other message.
 *
 * The note is written for the operator, so without this the master's model
 * never learns what its threads produced. The child's own words are fenced as
 * quoted data: they come from another run, not from the operator.
 */
export function renderTransferResultForHistory(
  message: TransferResultSource,
): string | null {
  if (message.role !== AgentMessageRole.SYSTEM) {
    return null;
  }
  const result = readRecord(readRecord(message.metadata).agentTransferResult);
  const threadId = readString(result.destinationThreadId);
  const status = readString(result.status);
  if (!threadId || !status) {
    return null;
  }

  const outputs = listOutputs(result.outputArtifactReferences);
  const lines = [
    `A thread you handed work to reported back. Thread ${threadId}, status ${status}.`,
    outputs.length > 0
      ? `It produced these records. To hand any of them to another thread, pass them unchanged in artifactReferences on transfer_agent_conversation: ${JSON.stringify(outputs)}`
      : 'It recorded no output records.',
  ];
  const report = fenceUntrustedContent(message.content ?? '');
  return report ? [...lines, report].join('\n') : lines.join('\n');
}

import { fenceUntrustedContent } from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import { AgentMessageRole } from '@genfeedai/contracts';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

const MAX_LISTED_OUTPUTS = 20;

interface TransferResultSource {
  content?: string | null;
  metadata?: unknown;
  role?: string | null;
}

function listOutputs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MAX_LISTED_OUTPUTS).flatMap((item: unknown) => {
    const record = readRecord(item);
    const kind = readString(record.kind);
    const recordId = readString(record.recordId);
    return kind && recordId ? [`${kind}:${recordId}`] : [];
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
      ? `It produced: ${outputs.join(', ')}. To hand any of these to another thread, pass them as artifactReferences on transfer_agent_conversation.`
      : 'It recorded no output records.',
  ];
  const report = fenceUntrustedContent(message.content ?? '');
  return report ? [...lines, report].join('\n') : lines.join('\n');
}

import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

/**
 * Parse the `kind` list filter. Unlike `status`, an unknown kind is rejected:
 * ignoring it would hand back every thread to a caller that asked for a
 * narrow list.
 */
export function parseAgentThreadKind(
  kind: string | undefined,
): AgentThreadKind | undefined {
  const value = kind?.trim();
  if (!value) {
    return undefined;
  }
  if (!Object.values(AgentThreadKind).includes(value as AgentThreadKind)) {
    throw new BadRequestException(
      `kind must be one of: ${Object.values(AgentThreadKind).join(', ')}`,
    );
  }
  return value as AgentThreadKind;
}

/** The master thread is the standing entry point; it is never archived. */
export function assertThreadArchivable(
  thread: { kind?: string | null },
  nextStatus: string | undefined,
): void {
  if (
    thread.kind === AgentThreadKind.MASTER &&
    nextStatus === AgentThreadStatus.ARCHIVED
  ) {
    throw new BadRequestException('The master thread cannot be archived.');
  }
}

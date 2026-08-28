import { formatAgentError } from '@genfeedai/agent/server';

function readAgentRunError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}

/**
 * Persist the same secret-scrubbed classification the composer uses while
 * leaving the public error transport unchanged.
 */
export function classifyAgentRunFailure(error: unknown): string {
  const formatted = formatAgentError(readAgentRunError(error));
  const summary = `${formatted.title}: ${formatted.summary}`;

  return formatted.detail && formatted.detail !== formatted.summary
    ? `${summary} ${formatted.detail}`
    : summary;
}

export function readAgentRunPublicError(error: unknown): string {
  return readAgentRunError(error);
}

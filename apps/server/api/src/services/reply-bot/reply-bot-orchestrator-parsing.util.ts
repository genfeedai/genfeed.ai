/**
 * Pure request/state parsing helpers for `ReplyBotOrchestratorService`.
 * Extracted from the service class (none of these touch `this`) to keep the
 * service file from growing past its runtime-complexity ratchet baseline.
 */

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Reply bot action requires ${field}`);
  }
  return value;
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function mergeReplyContext(
  botContext: string | undefined,
  candidateContext: string | undefined,
): string | undefined {
  return (
    [botContext, candidateContext].filter(Boolean).join('\n\n') || undefined
  );
}

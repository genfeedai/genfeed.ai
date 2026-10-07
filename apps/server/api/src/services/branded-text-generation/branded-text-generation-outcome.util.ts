import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export const BRANDED_GENERATION_BLOCKED_REASON = 'branded_generation_blocked';

/** The stable reason of a stopped receipt: its last error diagnostic. */
export function brandedReceiptReasonCode(
  receipt: BrandedGenerationReceiptV1,
): string {
  const errors = receipt.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  return errors.at(-1)?.code ?? BRANDED_GENERATION_BLOCKED_REASON;
}

const UNPROCESSABLE = new Set([
  'channel_limit_exceeded',
  'provider_output_empty',
]);
const SERVER_FAULT = new Set([
  'artifact_persist_failed',
  'artifact_bind_failed',
]);

/** HTTP status a stopped or in-progress branded generation maps to. */
export function brandedReasonHttpStatus(reasonCode: string): number {
  if (UNPROCESSABLE.has(reasonCode)) return 422;
  if (reasonCode === 'provider_attempt_ref_unavailable') return 502;
  if (SERVER_FAULT.has(reasonCode)) return 500;
  return 409;
}

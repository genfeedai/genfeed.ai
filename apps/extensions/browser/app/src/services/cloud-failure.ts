import type { CloudFallbackReason } from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import { AgentActionError } from '~services/agent-tools.service';
import { HttpRequestError } from '~services/http-request-error';

/**
 * What a failed Genfeed cloud request means for the next step.
 *
 * - `fallback`: Genfeed answered and confirmed the request did not run for a
 *   reason that a local provider can work around (service, quota, credits).
 * - `uncertain`: no confirmed answer (network, timeout, 5xx, still running).
 *   The request may have run, so it is reconciled with the same request key and
 *   never handed to another provider.
 * - `recovery_required`: sign-in, access or workspace; the user must fix it.
 * - `rejected`: a definitive answer that no provider switch would change
 *   (invalid input, output refused).
 */
export type CloudFailureVerdict =
  | { kind: 'fallback'; reason: CloudFallbackReason }
  | { kind: 'uncertain' }
  | { kind: 'recovery_required' }
  | { kind: 'rejected' };

const ACTION_CODE_REASONS: Readonly<Record<string, CloudFallbackReason>> = {
  insufficient_credits: 'credit_limit',
  provider_unavailable: 'service_unavailable',
};

const UNCERTAIN_ACTION_CODES: ReadonlySet<string> = new Set(['in_progress']);

export function classifyCloudFailure(error: unknown): CloudFailureVerdict {
  if (error instanceof HttpRequestError) {
    if (error.kind === 'unauthorized') return { kind: 'recovery_required' };
    if (error.kind === 'timeout' || error.kind === 'network') {
      return { kind: 'uncertain' };
    }
    const status = error.status ?? 0;
    if (status === 401 || status === 403) return { kind: 'recovery_required' };
    if (status === 429) return { kind: 'fallback', reason: 'quota_exceeded' };
    if (status === 402) return { kind: 'fallback', reason: 'credit_limit' };
    if (status >= 500) return { kind: 'uncertain' };
    return { kind: 'rejected' };
  }
  if (error instanceof AgentActionError) {
    const code = error.code ?? '';
    const reason = ACTION_CODE_REASONS[code];
    if (reason) return { kind: 'fallback', reason };
    if (UNCERTAIN_ACTION_CODES.has(code)) return { kind: 'uncertain' };
    return { kind: 'rejected' };
  }
  // Anything else is the extension's own precondition (no workspace, no
  // brand, workspace changed, not signed in): recover, never fall back.
  return { kind: 'recovery_required' };
}

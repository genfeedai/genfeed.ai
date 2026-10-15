import { HttpException } from '@nestjs/common';

const MESSAGES: Record<string, string> = {
  artifact_bind_failed: 'The generated text could not be saved. Try again.',
  artifact_persist_failed: 'The generated text could not be saved. Try again.',
  branded_generation_blocked: 'Generation was blocked. Try again.',
  channel_limit_exceeded:
    "The generated text did not fit this account's limits. Try again.",
  dispatch_window_expired: 'Generation timed out before it started. Try again.',
  no_approved_revision:
    'This brand has no usable style guide yet. Set one up, then try again.',
  no_draft_revision:
    'This brand has no usable style guide yet. Set one up, then try again.',
  provider_attempt_ref_unavailable:
    'The text model did not confirm the request. Try again.',
  provider_capability_unsupported:
    'The selected text model cannot be used for this generation.',
  provider_output_empty: 'The text model returned nothing. Try again.',
  skill_context_unavailable:
    'Brand skills are unavailable right now. Try again shortly.',
};

export interface AccountGenerationFailure {
  code: string;
  message: string;
}

/** The stable stopped reason of a branded outcome, with copy safe for the UI. */
export function accountGenerationFailure(
  code: string,
): AccountGenerationFailure {
  return {
    code,
    message: MESSAGES[code] ?? 'Generation stopped. Try again.',
  };
}

/** A thrown seam failure as a stable reason code. */
export function accountGenerationErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string') return message;
    }
  }
  return 'generation_failed';
}

import { z } from 'zod';

/**
 * Primitives shared by every outbound webhook event family (publish,
 * generation, workflow). Families own their own payload shape and schema
 * version; error classification, secret redaction, and `eventId` normalization
 * are identical across all of them so consumers can branch once.
 */

export const WEBHOOK_ERROR_CLASSES = [
  'misconfiguration',
  'credential',
  'provider_outage',
  'rate_limit',
  'validation',
  'unknown',
] as const;

export const webhookErrorClassSchema = z.enum(WEBHOOK_ERROR_CLASSES);

export const webhookIsoDateTimeSchema = z.string().datetime({ offset: true });
export const webhookNullableStringSchema = z
  .string()
  .min(1)
  .nullable()
  .optional();

export const webhookErrorSchema = z.object({
  class: webhookErrorClassSchema,
  code: webhookNullableStringSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

export type WebhookErrorClass = z.infer<typeof webhookErrorClassSchema>;
export type WebhookError = z.infer<typeof webhookErrorSchema>;

export function classifyWebhookError(message: string): WebhookErrorClass {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('credential') ||
    normalized.includes('oauth') ||
    normalized.includes('token') ||
    normalized.includes('auth') ||
    normalized.includes('reconnect')
  ) {
    return 'credential';
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('quota') ||
    normalized.includes('429')
  ) {
    return 'rate_limit';
  }

  if (
    normalized.includes('validation') ||
    normalized.includes('invalid') ||
    normalized.includes('unsupported')
  ) {
    return 'validation';
  }

  if (
    normalized.includes('configured') ||
    normalized.includes('configuration') ||
    normalized.includes('missing') ||
    normalized.includes('not found')
  ) {
    return 'misconfiguration';
  }

  if (
    normalized.includes('provider') ||
    normalized.includes('timeout') ||
    normalized.includes('unavailable') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504')
  ) {
    return 'provider_outage';
  }

  return 'unknown';
}

export function redactWebhookText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(
      /(["']?)(access[_-]?token|refresh[_-]?token|oauth[_-]?token|session[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|webhook[_-]?secret|password|signature|secret|token)\1(\s*[:=]\s*)(["'])([^"']*)\4/gi,
      '$1$2$1$3$4[REDACTED]$4',
    )
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|oauth[_-]?token|session[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|webhook[_-]?secret|password|signature|secret|token)(\s*[:=]\s*)([^\s,;"'}\]]+)/gi,
      '$1$2[REDACTED]',
    );
}

/**
 * Build a deterministic `eventId` from an ordered segment list. Every segment
 * is lowercased and reduced to `[a-z0-9._-]`, so the same terminal transition
 * always produces the same id no matter which worker retry emits it.
 */
export function createWebhookEventId(segments: Array<string | null>): string {
  return segments
    .map((segment) => normalizeWebhookEventIdSegment(segment ?? ''))
    .join(':');
}

export function normalizeWebhookEventIdSegment(value: string): string {
  const input = value.trim().toLowerCase();
  const result: string[] = [];
  let replacing = false;

  for (const character of input) {
    const code = character.charCodeAt(0);
    const isAllowed =
      (code >= 48 && code <= 57) ||
      (code >= 97 && code <= 122) ||
      character === '.' ||
      character === '_' ||
      character === '-';

    if (isAllowed) {
      result.push(character);
      replacing = false;
    } else if (!replacing) {
      result.push('-');
      replacing = true;
    }
  }

  let start = 0;
  let end = result.length;
  while (start < end && result[start] === '-') {
    start += 1;
  }
  while (end > start && result[end - 1] === '-') {
    end -= 1;
  }

  return result.slice(start, end).join('');
}

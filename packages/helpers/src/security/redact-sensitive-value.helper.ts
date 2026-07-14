export const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(access[_-]?token|api[_-]?key|authorization|bearer|client[_-]?secret|cookie|id[_-]?token|password|private[_-]?key|refresh[_-]?token|secret|session|token)([_-]|$)/i;

const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&][^=&#]*(?:access[_-]?token|api[_-]?key|client[_-]?secret|id[_-]?token|password|refresh[_-]?token|secret|session|token)[^=&#]*=)[^&#]*/gi;

const AUTH_HEADER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const INLINE_SECRET_PATTERN =
  /\b((?:access[_-]?token|api[_-]?key|authorization|client[_-]?secret|id[_-]?token|password|private[_-]?key|refresh[_-]?token|secret|session|token)\s*[:=]\s*)["']?[^\s,&"'#]+/gi;
const PROVIDER_TOKEN_PATTERN =
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{10,})\b/g;
const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function redactSensitiveString(value: string): string {
  return value
    .replace(PRIVATE_KEY_BLOCK_PATTERN, REDACTED_VALUE)
    .replace(AUTH_HEADER_PATTERN, (_match, scheme: string) => {
      return `${scheme} ${REDACTED_VALUE}`;
    })
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, `$1${REDACTED_VALUE}`)
    .replace(INLINE_SECRET_PATTERN, `$1${REDACTED_VALUE}`)
    .replace(PROVIDER_TOKEN_PATTERN, REDACTED_VALUE);
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED_VALUE
        : redactSensitiveValue(entry),
    ]),
  );
}

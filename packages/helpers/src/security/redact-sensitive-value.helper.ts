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
const PRIVATE_KEY_BEGIN_PREFIX = '-----BEGIN ';
const PRIVATE_KEY_END_PREFIX = '-----END ';
const PRIVATE_KEY_MARKER_SUFFIX = 'PRIVATE KEY-----';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function findPrivateKeyMarkerEnd(
  value: string,
  start: number,
  prefix: string,
): number {
  if (!value.startsWith(prefix, start)) {
    return -1;
  }

  let cursor = start + prefix.length;
  while (cursor < value.length) {
    if (value.startsWith(PRIVATE_KEY_MARKER_SUFFIX, cursor)) {
      return cursor + PRIVATE_KEY_MARKER_SUFFIX.length;
    }

    const code = value.charCodeAt(cursor);
    const isUppercaseLetter = code >= 65 && code <= 90;
    if (!isUppercaseLetter && value[cursor] !== ' ') {
      return -1;
    }

    cursor += 1;
  }

  return -1;
}

function redactPrivateKeyBlocks(value: string): string {
  const output: string[] = [];
  let copyStart = 0;
  let blockStart = -1;
  let cursor = 0;

  while (cursor < value.length) {
    if (blockStart < 0) {
      const candidate = value.indexOf(PRIVATE_KEY_BEGIN_PREFIX, cursor);
      if (candidate < 0) {
        break;
      }

      const markerEnd = findPrivateKeyMarkerEnd(
        value,
        candidate,
        PRIVATE_KEY_BEGIN_PREFIX,
      );
      if (markerEnd < 0) {
        cursor = candidate + 1;
        continue;
      }

      output.push(value.slice(copyStart, candidate));
      blockStart = candidate;
      cursor = markerEnd;
      continue;
    }

    const candidate = value.indexOf(PRIVATE_KEY_END_PREFIX, cursor);
    if (candidate < 0) {
      break;
    }

    const markerEnd = findPrivateKeyMarkerEnd(
      value,
      candidate,
      PRIVATE_KEY_END_PREFIX,
    );
    if (markerEnd < 0) {
      cursor = candidate + 1;
      continue;
    }

    output.push(REDACTED_VALUE);
    blockStart = -1;
    copyStart = markerEnd;
    cursor = markerEnd;
  }

  output.push(value.slice(blockStart >= 0 ? blockStart : copyStart));
  return output.join('');
}

export function redactSensitiveString(value: string): string {
  return redactPrivateKeyBlocks(value)
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

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

function isPrivateKeyMarkerCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || character === ' ';
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

    if (!isPrivateKeyMarkerCharacter(value[cursor])) {
      return -1;
    }

    cursor += 1;
  }

  return -1;
}

type PrivateKeyScanState = {
  blockStart: number;
  copyStart: number;
  cursor: number;
};

function findNextPrivateKeyMarker(
  value: string,
  cursor: number,
  prefix: string,
): { candidate: number; markerEnd: number } | undefined {
  const candidate = value.indexOf(prefix, cursor);
  if (candidate < 0) {
    return undefined;
  }

  return {
    candidate,
    markerEnd: findPrivateKeyMarkerEnd(value, candidate, prefix),
  };
}

function consumeBeginMarker(
  value: string,
  state: PrivateKeyScanState,
  output: string[],
): PrivateKeyScanState | undefined {
  const marker = findNextPrivateKeyMarker(
    value,
    state.cursor,
    PRIVATE_KEY_BEGIN_PREFIX,
  );
  if (!marker) {
    return undefined;
  }

  if (marker.markerEnd < 0) {
    return { ...state, cursor: marker.candidate + 1 };
  }

  output.push(value.slice(state.copyStart, marker.candidate));
  return {
    blockStart: marker.candidate,
    copyStart: state.copyStart,
    cursor: marker.markerEnd,
  };
}

function consumeEndMarker(
  value: string,
  state: PrivateKeyScanState,
): PrivateKeyScanState | undefined {
  const marker = findNextPrivateKeyMarker(
    value,
    state.cursor,
    PRIVATE_KEY_END_PREFIX,
  );
  if (!marker) {
    return undefined;
  }

  if (marker.markerEnd < 0) {
    return { ...state, cursor: marker.candidate + 1 };
  }

  return {
    blockStart: -1,
    copyStart: marker.markerEnd,
    cursor: marker.markerEnd,
  };
}

function advancePrivateKeyScan(
  value: string,
  state: PrivateKeyScanState,
  output: string[],
): PrivateKeyScanState | undefined {
  if (state.blockStart < 0) {
    return consumeBeginMarker(value, state, output);
  }

  const next = consumeEndMarker(value, state);
  if (next && next.blockStart < 0 && state.blockStart >= 0) {
    output.push(REDACTED_VALUE);
  }
  return next;
}

function redactPrivateKeyBlocks(value: string): string {
  const output: string[] = [];
  let state: PrivateKeyScanState = {
    blockStart: -1,
    copyStart: 0,
    cursor: 0,
  };

  while (state.cursor < value.length) {
    const next = advancePrivateKeyScan(value, state, output);
    if (!next) {
      break;
    }
    state = next;
  }

  const remainderStart =
    state.blockStart >= 0 ? state.blockStart : state.copyStart;
  output.push(value.slice(remainderStart));
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

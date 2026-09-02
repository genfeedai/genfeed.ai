import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

function redactSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase())
      ? '[redacted]'
      : value;
  }
  return redacted;
}

/**
 * Prefer API error title/detail over generic Axios "status code NNN" messages.
 */
export function resolveErrorDebugSummary(errorInfo: IErrorDebugInfo): string {
  const data = errorInfo.response?.data;
  if (isRecord(data) && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (isRecord(first)) {
      const title = typeof first.title === 'string' ? first.title.trim() : '';
      const detail =
        typeof first.detail === 'string' ? first.detail.trim() : '';
      if (title && detail && title !== detail) {
        return `${title} — ${detail}`;
      }
      if (title) {
        return title;
      }
      if (detail) {
        return detail;
      }
    }
  }

  if (isRecord(data)) {
    for (const key of ['message', 'error', 'detail', 'title'] as const) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return errorInfo.message;
}

export function formatErrorDebugRequest(errorInfo: IErrorDebugInfo): string {
  const lines = [
    `message: ${errorInfo.message}`,
    errorInfo.url ? `url: ${errorInfo.url}` : null,
    errorInfo.method ? `method: ${errorInfo.method}` : null,
    errorInfo.status != null
      ? `status: ${errorInfo.status}${errorInfo.statusText ? ` ${errorInfo.statusText}` : ''}`
      : null,
    errorInfo.errorCode ? `errorCode: ${errorInfo.errorCode}` : null,
    `timestamp: ${errorInfo.timestamp}`,
  ].filter((line): line is string => Boolean(line));

  if (errorInfo.request?.params) {
    lines.push(`params:\n${stringifyJson(errorInfo.request.params)}`);
  }
  if (errorInfo.request?.headers) {
    lines.push(
      `headers:\n${stringifyJson(redactSensitiveHeaders(errorInfo.request.headers))}`,
    );
  }
  if (errorInfo.request?.body !== undefined) {
    lines.push(`body:\n${stringifyJson(errorInfo.request.body)}`);
  }

  return lines.join('\n');
}

export function formatErrorDebugResponse(errorInfo: IErrorDebugInfo): string {
  if (errorInfo.response?.data === undefined && !errorInfo.response?.headers) {
    return '';
  }

  const parts: string[] = [];
  if (errorInfo.response?.data !== undefined) {
    parts.push(stringifyJson(errorInfo.response.data));
  }
  if (errorInfo.response?.headers) {
    parts.push(`headers:\n${stringifyJson(errorInfo.response.headers)}`);
  }
  return parts.join('\n\n');
}

export function formatErrorDebugContext(errorInfo: IErrorDebugInfo): string {
  if (!errorInfo.context || Object.keys(errorInfo.context).length === 0) {
    return '';
  }
  return stringifyJson(errorInfo.context);
}

/**
 * Full agent-ready dump: paste into a coding agent with no extra framing.
 */
export function formatErrorDebugForAgent(errorInfo: IErrorDebugInfo): string {
  const summary = resolveErrorDebugSummary(errorInfo);
  const sections: string[] = [
    '## Request failed — agent debug dump',
    '',
    '### Summary',
    summary,
  ];
  if (summary !== errorInfo.message) {
    sections.push(`(raw client message: ${errorInfo.message})`);
  }
  sections.push('', '### Request', formatErrorDebugRequest(errorInfo));

  const response = formatErrorDebugResponse(errorInfo);
  if (response) {
    sections.push('', '### Response', response);
  }

  if (errorInfo.stack) {
    sections.push('', '### Stack', errorInfo.stack);
  }

  const context = formatErrorDebugContext(errorInfo);
  if (context) {
    sections.push('', '### Context', context);
  }

  sections.push(
    '',
    '### Ask',
    'Diagnose and fix the root cause. Prefer permanent code/data fixes over workarounds.',
  );

  return sections.join('\n');
}

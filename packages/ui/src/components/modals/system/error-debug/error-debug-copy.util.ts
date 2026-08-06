import type { IErrorDebugInfo } from '@genfeedai/interfaces/modals/error-debug.interface';

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
    lines.push(`headers:\n${stringifyJson(errorInfo.request.headers)}`);
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
  const sections: string[] = [
    '## Request failed — agent debug dump',
    '',
    '### Summary',
    errorInfo.message,
    '',
    '### Request',
    formatErrorDebugRequest(errorInfo),
  ];

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

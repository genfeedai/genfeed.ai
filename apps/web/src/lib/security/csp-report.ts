/**
 * Normalises a Content-Security-Policy violation report so it can be logged
 * without query strings or fragments, and drops the reports that browser
 * extensions generate on every page.
 */

export interface CspViolation {
  blockedOrigin: string;
  effectiveDirective: string;
}

const EXTENSION_SCHEMES = [
  'chrome-extension:',
  'moz-extension:',
  'safari-extension:',
  'safari-web-extension:',
  'webkit-masked-url:',
];

const MAX_FIELD_LENGTH = 200;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : '';
}

function isExtensionUrl(value: string): boolean {
  return EXTENSION_SCHEMES.some((scheme) => value.startsWith(scheme));
}

function toOrigin(value: string): string {
  // `blocked-uri` is a keyword such as `inline` or `eval` for non-URL blocks.
  if (!value.includes(':') || !value.includes('/')) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.origin === 'null' ? url.protocol : url.origin;
  } catch {
    return '';
  }
}

function unwrapReport(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    return unwrapReport(payload[0]);
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const legacy = record['csp-report'];
  if (legacy && typeof legacy === 'object') {
    return legacy as Record<string, unknown>;
  }

  const body = record.body;
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : null;
}

export function parseCspViolation(payload: unknown): CspViolation | null {
  const report = unwrapReport(payload);
  if (!report) {
    return null;
  }

  const blocked = readString(report['blocked-uri'] ?? report.blockedURL);
  const source = readString(report['source-file'] ?? report.sourceFile);
  const directive = readString(
    report['effective-directive'] ??
      report.effectiveDirective ??
      report['violated-directive'],
  );

  if (!directive || isExtensionUrl(blocked) || isExtensionUrl(source)) {
    return null;
  }

  return {
    blockedOrigin: toOrigin(blocked),
    effectiveDirective: directive.split(' ')[0] ?? directive,
  };
}

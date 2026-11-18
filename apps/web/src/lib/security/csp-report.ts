/**
 * Normalises a Content-Security-Policy violation report so it can be logged
 * without query strings or fragments, and drops the reports that browser
 * extensions and network middleboxes generate.
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

function readBoundedField(value: unknown): string {
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

/**
 * A blocked `https://analytics` is a request to a one-word host, which no
 * public site serves. Browser shields, extensions and ISP filters rewrite
 * requests to hosts like that, so the report says nothing about our policy.
 * `localhost` stays: self-hosted and local installs use it.
 */
function isSingleLabelHostOrigin(origin: string): boolean {
  if (!origin.startsWith('https://') && !origin.startsWith('http://')) {
    return false;
  }

  try {
    const { hostname } = new URL(origin);
    return (
      hostname !== 'localhost' &&
      !hostname.includes('.') &&
      !hostname.includes(':')
    );
  } catch {
    return false;
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

  const blocked = readBoundedField(report['blocked-uri'] ?? report.blockedURL);
  const source = readBoundedField(report['source-file'] ?? report.sourceFile);
  const directive = readBoundedField(
    report['effective-directive'] ??
      report.effectiveDirective ??
      report['violated-directive'],
  );

  if (!directive || isExtensionUrl(blocked) || isExtensionUrl(source)) {
    return null;
  }

  const blockedOrigin = toOrigin(blocked);
  if (isSingleLabelHostOrigin(blockedOrigin)) {
    return null;
  }

  return {
    blockedOrigin,
    effectiveDirective: directive.split(' ')[0] ?? directive,
  };
}

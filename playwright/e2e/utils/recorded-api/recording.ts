/**
 * Recorded API responses for the mocked frontend E2E suite (#6231, #7426).
 *
 * Pure module: no Playwright, no Node APIs. The Playwright binding
 * (`recorded-api.ts`) and the CI guard (`scripts/architecture/check-e2e-recordings.ts`)
 * both import it, so the rules for matching, normalizing and rejecting a
 * recording live in exactly one place.
 */

export const RECORDING_FORMAT_VERSION = 1;

export interface RecordedApiEntry {
  body: unknown;
  contentType: string;
  method: string;
  /** Path below the API endpoint, with a leading slash and no query. */
  path: string;
  /** Sorted, normalized query string without the leading `?`. */
  query: string;
  status: number;
}

export interface ApiRecording {
  entries: RecordedApiEntry[];
  surface: string;
  version: typeof RECORDING_FORMAT_VERSION;
}

export interface RecordingViolation {
  location: string;
  reason: string;
}

export interface MatchResult {
  entry?: RecordedApiEntry;
  /** Human-readable miss, naming the method and path. Set when `entry` is not. */
  message?: string;
}

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const ISO_TIMESTAMP =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})\b/gu;

const OBJECT_ID = /\b[0-9a-f]{24}\b/giu;

const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;

const SIGNING_PARAMETERS = new Set([
  'expires',
  'key-pair-id',
  'policy',
  'signature',
  'sig',
  'token',
  'x-amz-algorithm',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-security-token',
  'x-amz-signature',
  'x-amz-signedheaders',
]);

/**
 * Replaces ids, timestamps and signed-URL queries with stable placeholders so
 * a re-recording only produces a diff when the response shape really changed.
 * Ids map to `id-1`, `id-2`, ... in first-seen order, consistently across
 * paths, queries and bodies of one recording session.
 */
export function createNormalizer(): {
  normalizeJson: (value: unknown) => unknown;
  normalizeQuery: (query: string) => string;
  normalizeText: (text: string) => string;
} {
  const placeholders = new Map<string, string>();

  function placeholderFor(id: string): string {
    const key = id.toLowerCase();
    const known = placeholders.get(key);
    if (known) {
      return known;
    }
    const next = `id-${placeholders.size + 1}`;
    placeholders.set(key, next);
    return next;
  }

  function normalizeText(text: string): string {
    return text
      .replace(ISO_TIMESTAMP, FIXED_TIMESTAMP)
      .replace(UUID, (id) => placeholderFor(id))
      .replace(OBJECT_ID, (id) => placeholderFor(id))
      .replace(/https?:\/\/[^\s"'<>]+/gu, stripSignature);
  }

  function normalizeJson(value: unknown): unknown {
    if (typeof value === 'string') {
      return normalizeText(value);
    }
    if (Array.isArray(value)) {
      return value.map(normalizeJson);
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          normalizeJson(child),
        ]),
      );
    }
    return value;
  }

  function normalizeQuery(query: string): string {
    const params = new URLSearchParams(query);
    const normalized = new URLSearchParams();
    for (const [key, rawValue] of params) {
      if (SIGNING_PARAMETERS.has(key.toLowerCase())) {
        continue;
      }
      normalized.append(key, normalizeText(rawValue));
    }
    normalized.sort();
    return normalized.toString();
  }

  return { normalizeJson, normalizeQuery, normalizeText };
}

function stripSignature(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const hadSignature = [...params.keys()].some((key) =>
    SIGNING_PARAMETERS.has(key.toLowerCase()),
  );
  return hadSignature ? `${url.slice(0, queryIndex)}?signed=redacted` : url;
}

export function entryKey(
  entry: Pick<RecordedApiEntry, 'method' | 'path' | 'query'>,
): string {
  const query = entry.query ? `?${entry.query}` : '';
  return `${entry.method.toUpperCase()} ${entry.path}${query}`;
}

/**
 * Splits a request URL into the path below `apiEndpoint` and its sorted query.
 * Returns null for URLs outside the API.
 */
export function toRequestKey(
  requestUrl: string,
  apiEndpoint: string,
): { path: string; query: string } | null {
  let request: URL;
  let endpoint: URL;
  try {
    request = new URL(requestUrl);
    endpoint = new URL(apiEndpoint);
  } catch {
    return null;
  }
  const prefix = endpoint.pathname.replace(/\/+$/u, '');
  if (request.origin !== endpoint.origin) {
    return null;
  }
  if (prefix && !request.pathname.startsWith(`${prefix}/`)) {
    return null;
  }
  const params = new URLSearchParams(request.search);
  params.sort();
  return {
    path: request.pathname.slice(prefix.length) || '/',
    query: params.toString(),
  };
}

/**
 * Looks up the recorded response for a request. Repeated entries for one key
 * replay in recorded order, and the last one repeats once they run out, so a
 * page that polls keeps getting the final state.
 */
export function createReplayMatcher(recording: ApiRecording): {
  match: (method: string, path: string, query: string) => MatchResult;
} {
  const byKey = new Map<string, RecordedApiEntry[]>();
  for (const entry of recording.entries) {
    const key = entryKey(entry);
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  const served = new Map<string, number>();

  return {
    match(method, path, query) {
      const key = entryKey({ method, path, query });
      const candidates = byKey.get(key);
      if (!candidates) {
        return {
          message: `Unmatched API request ${key}: the "${recording.surface}" recording has no response for it. Re-record the surface (see playwright/e2e/README.md).`,
        };
      }
      const index = served.get(key) ?? 0;
      served.set(key, index + 1);
      return { entry: candidates[Math.min(index, candidates.length - 1)] };
    },
  };
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u,
    reason: 'looks like a JWT',
  },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/u, reason: 'Bearer token' },
  {
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/u,
    reason: 'looks like a Stripe key',
  },
  { pattern: /\bgf_[A-Za-z0-9_-]{16,}/u, reason: 'looks like a Genfeed key' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/u, reason: 'looks like an AWS access key' },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/u,
    reason: 'looks like a GitHub token',
  },
  {
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
    reason: 'looks like a Slack token',
  },
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    reason: 'private key block',
  },
];

const SENSITIVE_KEY =
  /(?:(?:access|refresh|id)[_-]?token|api[_-]?key|secret|password)$|^(?:authorization|cookie)$/iu;

const ALLOWED_HOSTS = [
  /^localhost$/iu,
  /^127\.0\.0\.1$/u,
  /^(?:[a-z0-9-]+\.)*genfeed\.localhost$/iu,
  /^(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/iu,
  /^cdn\.genfeed\.ai$/iu,
];

const FIXTURE_EMAIL = /@(?:example\.(?:com|org|net)|genfeed\.localhost)$/iu;

function* walk(
  value: unknown,
  location: string,
): Generator<{ key?: string; location: string; value: unknown }> {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      yield* walk(child, `${location}[${index}]`);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      if (child !== null && typeof child === 'object') {
        yield* walk(child, childLocation);
      } else {
        yield { key, location: childLocation, value: child };
      }
    }
    return;
  }
  yield { location, value };
}

function violationsForString(
  text: string,
  location: string,
  key: string | undefined,
): RecordingViolation[] {
  const violations: RecordingViolation[] = [];
  for (const { pattern, reason } of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ location, reason });
    }
  }
  if (
    key &&
    SENSITIVE_KEY.test(key) &&
    text.length > 0 &&
    text !== 'redacted'
  ) {
    violations.push({
      location,
      reason: `"${key}" holds a value; recordings must use "redacted" or omit it`,
    });
  }
  for (const [url] of text.matchAll(/https?:\/\/[^\s"'<>]+/gu)) {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (!ALLOWED_HOSTS.some((allowed) => allowed.test(host))) {
      violations.push({
        location,
        reason: `non-fixture hostname "${host}"`,
      });
    }
  }
  for (const [email] of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu)) {
    if (!FIXTURE_EMAIL.test(email)) {
      violations.push({ location, reason: `non-fixture email "${email}"` });
    }
  }
  return violations;
}

/**
 * Recordings are committed to a public repository, so they must hold seeded
 * fixture data only. Returns every violation; an empty list means safe.
 */
export function findRecordingViolations(
  recording: ApiRecording,
): RecordingViolation[] {
  const violations: RecordingViolation[] = [];
  for (const [index, entry] of recording.entries.entries()) {
    const base = `${recording.surface}#${index} ${entryKey(entry)}`;
    for (const part of [
      { key: undefined, location: `${base} path`, value: entry.path },
      { key: undefined, location: `${base} query`, value: entry.query },
    ]) {
      violations.push(
        ...violationsForString(part.value, part.location, part.key),
      );
    }
    for (const leaf of walk(entry.body, `${base} body`)) {
      if (typeof leaf.value === 'string') {
        violations.push(
          ...violationsForString(leaf.value, leaf.location, leaf.key),
        );
      }
    }
  }
  return violations;
}

export function formatViolations(violations: RecordingViolation[]): string {
  return violations
    .map((violation) => `- ${violation.location}: ${violation.reason}`)
    .join('\n');
}

export function parseRecording(source: string, file: string): ApiRecording {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const candidate = parsed as Partial<ApiRecording> | null;
  if (
    !candidate ||
    candidate.version !== RECORDING_FORMAT_VERSION ||
    typeof candidate.surface !== 'string' ||
    !Array.isArray(candidate.entries)
  ) {
    throw new Error(
      `${file} is not a version ${RECORDING_FORMAT_VERSION} API recording (needs version, surface and entries).`,
    );
  }
  return candidate as ApiRecording;
}

export function serializeRecording(recording: ApiRecording): string {
  return `${JSON.stringify(recording, null, 2)}\n`;
}

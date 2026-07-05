/**
 * Reviewed allowlist of API routes that are intentionally NOT exposed as MCP
 * tools (#1246 parity epic, Phase-2 generation).
 *
 * Parity means "every user-facing capability is MCP-callable" — not "every HTTP
 * route". Genuinely-internal routes (health probes, inbound provider webhooks,
 * OAuth/auth redirects, spec/docs endpoints) must be excluded by construction,
 * or the generated surface leaks infrastructure into the agent tool list.
 *
 * This list is deliberately conservative and path-shaped so it is auditable in
 * review. The CI parity gate (#1251) imports {@link isInternalRoute} so the
 * allowlist and the generated surface can never drift.
 *
 * NOTE: matched against the OpenAPI `path` as declared by the controllers
 * (no global `/v1` prefix — Swagger paths are controller-relative).
 */

/** Path prefixes that mark a route as internal infrastructure. */
const INTERNAL_PATH_PREFIXES: readonly string[] = [
  '/health',
  '/healthz',
  '/metrics',
  '/openapi',
  '/gpt-actions',
  '/docs',
  '/webhooks',
  '/webhook',
  '/auth', // Better-Auth internal handler surface + auth redirects
  '/.well-known',
];

/** Path substrings that mark a route as an inbound callback/redirect, not an action. */
const INTERNAL_PATH_SUBSTRINGS: readonly string[] = [
  '/callback',
  '/webhook',
  '/redirect',
];

/** Tags whose whole controller is internal infrastructure. */
const INTERNAL_TAGS: ReadonlySet<string> = new Set<string>([
  'Health',
  'Metrics',
  'Docs',
  'Webhooks',
  'Auth',
]);

export interface InternalRouteCandidate {
  path: string;
  method: string;
  tags: readonly string[];
}

/**
 * True when the operation is internal infrastructure and must be excluded from
 * the generated MCP surface. Pure and side-effect-free so both the generator and
 * the parity gate share one source of truth.
 */
export function isInternalRoute(op: InternalRouteCandidate): boolean {
  const path = op.path.toLowerCase();

  if (INTERNAL_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  if (INTERNAL_PATH_SUBSTRINGS.some((needle) => path.includes(needle))) {
    return true;
  }
  if (op.tags.some((tag) => INTERNAL_TAGS.has(tag))) {
    return true;
  }
  return false;
}

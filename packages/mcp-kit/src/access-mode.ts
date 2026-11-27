/**
 * Endpoint and OAuth grant policy, independent of the client's reported name.
 * `standard` is the full catalog, `claude` the reviewed directory connector,
 * and `admin` the staff endpoint that lists only admin-gated tools.
 */
export type McpAccessMode = 'standard' | 'claude' | 'admin';

/** Anything unrecognised fails closed to the narrowest mode. */
export function parseMcpAccessMode(value: unknown): McpAccessMode {
  if (value === undefined || value === 'standard') {
    return 'standard';
  }
  return value === 'admin' ? 'admin' : 'claude';
}

/**
 * Combine the modes a request carries (route, key). An absent mode takes no
 * part. `admin` survives only when every given mode is `admin`, so an admin
 * key on another route, or a standard key on the admin route, never gains the
 * admin tools.
 */
export function mostRestrictiveMcpAccessMode(
  ...modes: unknown[]
): McpAccessMode {
  const parsed = modes
    .filter((mode) => mode !== undefined)
    .map(parseMcpAccessMode);
  if (parsed.includes('claude')) {
    return 'claude';
  }
  return parsed.length > 0 && parsed.every((mode) => mode === 'admin')
    ? 'admin'
    : 'standard';
}

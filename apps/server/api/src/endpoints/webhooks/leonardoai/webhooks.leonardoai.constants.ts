/**
 * Last-known Leonardo.AI egress addresses.
 *
 * Leonardo does not publish a stable CIDR range and rotates these without
 * notice, so this list is only a fallback for deployments that have not yet
 * provisioned `LEONARDO_WEBHOOK_SECRET`. Once a secret is configured the
 * shared secret is the gate and the allowlist is opt-in via
 * `LEONARDO_WEBHOOK_ALLOWED_IPS`, which is changeable without a deploy.
 */
export const LEONARDOAI_DEFAULT_ALLOWED_IPS: readonly string[] = [
  '35.173.108.170',
  '34.239.69.60',
  '52.73.75.186',
  '3.229.99.26',
  '44.218.0.197',
  '174.129.230.221',
];

/**
 * Parse a comma-separated allowlist from config. Returns an empty array when
 * the value is unset or contains no usable entries, which callers treat as
 * "no explicit allowlist configured".
 */
export function parseAllowedIps(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

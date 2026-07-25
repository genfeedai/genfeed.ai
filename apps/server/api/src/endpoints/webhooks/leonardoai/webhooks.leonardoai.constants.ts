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

/**
 * Metadata-only allowlist for Skills Pro discovery.
 *
 * Storage keys, checksums, pack bodies, and download fields stay internal even
 * when the upstream CDN registry contains them.
 */
export const skillsProRegistryEntryAttributes = [
  'slug',
  'name',
  'description',
  'version',
  'category',
];

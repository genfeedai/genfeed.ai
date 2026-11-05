/**
 * Whether a hostname is the Genfeed files service: production, the Portless
 * local host, or a linked worktree's prefixed variant of it
 * (`qa-local.files.genfeed.localhost`).
 */
export function isFilesServiceHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'files.genfeed.ai' ||
    host === 'files.genfeed.localhost' ||
    host.endsWith('.files.genfeed.localhost')
  );
}

/**
 * Human-readable newsletter status, shared by the archive list and the
 * dedicated newsletter editor so both surfaces label an issue identically.
 *
 * Takes a plain `string` rather than the client's `NewsletterStatus` union:
 * `@genfeedai/client` resolves `@genfeedai/helpers/*` through its tsconfig
 * paths, so importing a client type back into helpers is a build cycle.
 */
export function formatNewsletterStatusLabel(status: string): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready For Review';
    default:
      return status.replace(/_/g, ' ');
  }
}

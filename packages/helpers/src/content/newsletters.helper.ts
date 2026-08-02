import type { NewsletterStatus } from '@genfeedai/client/models';

/**
 * Human-readable newsletter status, shared by the archive list and the
 * dedicated newsletter editor so both surfaces label an issue identically.
 */
export function formatNewsletterStatusLabel(status: NewsletterStatus): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready For Review';
    default:
      return status.replace(/_/g, ' ');
  }
}

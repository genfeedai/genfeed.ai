/**
 * Lifecycle of one lifecycle-email delivery (`lifecycle_email_deliveries`).
 *
 * `SCHEDULED` and `FAILED` are due for a send attempt; `QUEUED` means the
 * notification outbox accepted it. `SENT`, `QUEUED`, `CANCELED` and `SKIPPED`
 * never change again.
 */
export enum LifecycleEmailDeliveryStatus {
  SCHEDULED = 'scheduled',
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELED = 'canceled',
}

/**
 * Lifecycle of one durable notification delivery (`notification_deliveries`).
 *
 * `RETRY_PENDING` is a transient failure waiting for `nextAttemptAt`; `FAILED`
 * is terminal. The database pins this set with
 * `notification_deliveries_status_check`.
 */
export enum NotificationDeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRY_PENDING = 'retry_pending',
  DELIVERED = 'delivered',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

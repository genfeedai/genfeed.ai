/**
 * Whether a provider accepted one scheduled publish occurrence
 * (`post_provider_publish_receipts`).
 *
 * - `ATTEMPTING`: a delivery holds the lease and is calling the provider.
 * - `ACCEPTED`: the provider accepted it; later deliveries replay the result.
 * - `UNCERTAIN`: the outcome never confirmed; verify before publishing again.
 * - `RELEASED`: no unresolved attempt; a delivery may reserve a new one.
 *
 * The database pins this set with `post_provider_publish_receipts_status_check`.
 */
export enum PostProviderPublishReceiptStatus {
  ATTEMPTING = 'attempting',
  ACCEPTED = 'accepted',
  UNCERTAIN = 'uncertain',
  RELEASED = 'released',
}

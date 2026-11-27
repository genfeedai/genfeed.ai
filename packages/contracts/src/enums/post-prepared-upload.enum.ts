/**
 * A provider upload made before a scheduled post is due
 * (`post_prepared_uploads`), so the delivery at the due time only publishes it.
 *
 * - `PREPARING`: a prepare sweep holds the lease and is uploading.
 * - `READY`: the upload is done; a delivery of the same occurrence may publish it.
 * - `CONSUMED`: a delivery took it for its provider attempt; it is never used again.
 * - `FAILED`: the upload failed; the delivery uploads at the due time as before.
 *
 * The database pins this set with `post_prepared_uploads_status_check`.
 */
export enum PostPreparedUploadStatus {
  PREPARING = 'preparing',
  READY = 'ready',
  CONSUMED = 'consumed',
  FAILED = 'failed',
}

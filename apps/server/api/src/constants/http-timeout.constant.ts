/**
 * Default timeout for outbound provider HTTP calls made through `HttpModule`.
 * Without it a slow provider holds the request, and the database connection,
 * lock or queue slot behind it, open indefinitely.
 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

/**
 * Per-call override for large media uploads and downloads, which legitimately
 * outlast the default.
 */
export const UPLOAD_HTTP_TIMEOUT_MS = 5 * 60_000;

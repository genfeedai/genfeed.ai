/** Request-local presentation policy for a caller with visible recovery UI.
 * Listed statuses still reject and retain logging/debug capture; this does not
 * change sanitization, retry requests, or affect other requests.
 */
export interface IHttpRequestOptions {
  readonly handledErrorStatuses?: readonly number[];
}

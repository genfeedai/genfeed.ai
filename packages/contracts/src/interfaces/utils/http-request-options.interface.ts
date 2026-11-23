export interface IHttpErrorPresentationContext {
  readonly status: number;
  readonly data: unknown;
}

/** Request-local presentation policy for a caller with visible recovery UI.
 * Listed statuses still reject and retain logging/debug capture; this does not
 * change sanitization, retry requests, or affect other requests.
 */
export interface IHttpRequestOptions {
  /**
   * The request is one of the few that must leave while the page is drawn
   * from a saved copy and the membership check has not answered: the check
   * itself and the organization activation. The API client then sends it
   * without waiting for the organization to be confirmed, and without an
   * organization header. Nothing else sets this.
   */
  readonly exemptFromOrganizationGate?: boolean;
  readonly handledErrorStatuses?: readonly number[];
  readonly handlesErrorResponse?: (
    response: IHttpErrorPresentationContext,
  ) => boolean;
}

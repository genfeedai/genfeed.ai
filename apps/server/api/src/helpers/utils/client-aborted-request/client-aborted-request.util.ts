/**
 * True for the 400 `request aborted` that body-parser raises when the client
 * closes the connection before it finished sending the body. The server did
 * nothing wrong and the peer is already gone, so it is not worth a Sentry event.
 */
export function isClientAbortedRequest(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { statusCode, type } = error as {
    statusCode?: unknown;
    type?: unknown;
  };

  return type === 'request.aborted' && statusCode === 400;
}

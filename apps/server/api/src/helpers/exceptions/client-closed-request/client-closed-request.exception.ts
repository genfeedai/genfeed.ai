import { HttpException } from '@nestjs/common';

/** The non-standard 499 status for a client that closed the connection first. */
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

export type ClientClosedRequestStage =
  | 'before-upstream'
  | 'awaiting-upstream'
  | 'before-stream';

/**
 * The client went away before the response was handed over. The server did
 * nothing wrong and the peer is gone, so this is a 4xx the exception filters
 * do not report. `stage` is a bounded label for where the stream stopped; it
 * never carries a media URL or a user payload.
 */
export class ClientClosedRequestException extends HttpException {
  constructor(public readonly stage: ClientClosedRequestStage) {
    super(
      {
        detail: 'The client closed the request before the download started',
        stage,
        title: 'Client Closed Request',
      },
      CLIENT_CLOSED_REQUEST_STATUS,
    );
  }
}

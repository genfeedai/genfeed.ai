import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { runWithWideEvent } from './wide-event.context';
import type { WideEventServiceIdentity } from './wide-event.interface';
import {
  finishWideEvent,
  startWideEvent,
  type WideEventSink,
} from './wide-event.lifecycle';
import {
  readHeader,
  resolveRequestId,
  resolveTraceContext,
} from './wide-event.trace';

/** Health probes fire every few seconds and carry no business context. */
const HEALTH_PATH_PATTERN = /^\/(?:v\d+\/)?health(?:\/|$)/;

/** Status the load balancer sees when the client hangs up before the response. */
const CLIENT_CLOSED_REQUEST = 499;

export interface WideEventMiddlewareOptions {
  identity: WideEventServiceIdentity;
  sink: WideEventSink;
  /** Business context that only the app knows (authenticated user, org, brand). */
  describeRequest?: (request: Request) => Record<string, unknown>;
  /** Strips secrets that ride in paths (for example tracking tokens). */
  redactPath?: (path: string) => string;
}

function readRoute(request: Request): string | undefined {
  const pattern = request.route?.path;
  return typeof pattern === 'string'
    ? `${request.baseUrl}${pattern}`
    : undefined;
}

/**
 * Starts the request's wide event, makes it reachable through
 * `enrichWideEvent` for everything downstream, and emits it exactly once when
 * the response finishes (or the client disconnects).
 */
export function createWideEventMiddleware(
  options: WideEventMiddlewareOptions,
): RequestHandler {
  const {
    identity,
    sink,
    describeRequest,
    redactPath = (path) => path,
  } = options;

  return (request: Request, response: Response, next: NextFunction): void => {
    if (HEALTH_PATH_PATTERN.test(request.path)) {
      next();
      return;
    }

    const requestId = resolveRequestId(request.headers);
    const started = startWideEvent({
      fields: {
        method: request.method,
        path: redactPath(request.path),
        user_agent: readHeader(request.headers, 'user-agent')?.slice(0, 256),
      },
      identity,
      kind: 'http',
      requestId,
      trace: resolveTraceContext(request.headers),
    });
    response.setHeader('x-request-id', requestId);

    let isFinished = false;
    const finish = (): void => {
      if (isFinished) return;
      isFinished = true;
      const isAborted = !response.writableFinished;
      let context: Record<string, unknown> = {};
      try {
        context = describeRequest?.(request) ?? {};
      } catch {
        // Missing context must not stop the event from being emitted.
      }
      finishWideEvent(sink, started, {
        ...context,
        client_aborted: isAborted ? true : undefined,
        route: readRoute(request) ?? started.event.route,
        status_code: isAborted ? CLIENT_CLOSED_REQUEST : response.statusCode,
      });
    };

    response.once('finish', finish);
    response.once('close', finish);

    runWithWideEvent(started.event, next);
  };
}

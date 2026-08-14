import type { LoggerService } from '@libs/logger/logger.service';

export type BetterAuthRequestLogPayload = {
  durationMs: number;
  method: string;
  path: string;
  statusCode: number;
};

export type BetterAuthRequestLogger = Pick<LoggerService, 'error' | 'warn'>;

type BetterAuthLogRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
};

type BetterAuthLogResponse = {
  once: (event: 'finish', listener: () => void) => unknown;
  statusCode: number;
};

export function sanitizeBetterAuthLogPath(urlOrPath: string): string {
  const [pathWithoutQuery = ''] = urlOrPath.split('?', 1);
  const [pathWithoutHash = ''] = pathWithoutQuery.split('#', 1);
  return pathWithoutHash || '/';
}

export function createBetterAuthRequestLogPayload(
  method: string,
  urlOrPath: string,
  statusCode: number,
  durationMs: number,
): BetterAuthRequestLogPayload {
  return {
    durationMs,
    method: method.toUpperCase(),
    path: sanitizeBetterAuthLogPath(urlOrPath),
    statusCode,
  };
}

export function logBetterAuthResponse(
  logger: BetterAuthRequestLogger,
  payload: BetterAuthRequestLogPayload,
): void {
  if (payload.statusCode < 400) {
    return;
  }

  const level = payload.statusCode >= 500 ? 'error' : 'warn';
  logger[level]('Better Auth request failed', payload);
}

export function attachBetterAuthRequestLog(
  req: BetterAuthLogRequest,
  res: BetterAuthLogResponse,
  logger: BetterAuthRequestLogger,
): void {
  const startedAtMs = Date.now();

  res.once('finish', () => {
    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload(
        req.method ?? 'GET',
        req.originalUrl ?? req.url ?? '/',
        res.statusCode,
        Date.now() - startedAtMs,
      ),
    );
  });
}

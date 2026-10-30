import type { NextFunction, Request, Response } from 'express';

const DEFAULT_SHORT_LINK_BASE_URL = 'https://go.genfeed.ai';

/**
 * Serve short links from the root of their own host. A GET to
 * `https://<short host>/<code>` is routed to the API's redirect controller at
 * `/<prefix>/l/<code>`; every other host and path is left alone.
 */
export function createShortLinkHostRewrite(
  shortLinkBaseUrl: string | undefined,
  globalPrefix: string,
) {
  const shortHost = new URL(shortLinkBaseUrl || DEFAULT_SHORT_LINK_BASE_URL)
    .hostname;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.method === 'GET' && req.hostname === shortHost) {
      req.url = `/${globalPrefix}/l${req.url}`;
    }
    next();
  };
}

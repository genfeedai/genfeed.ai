import type { NextFunction, Request, Response } from 'express';

const INTERNAL_ROUTE_PATTERN = /^\/v1\/internal(?:\/|$)/i;

/**
 * `/v1/internal/*` is service-to-service only; callers reach the API over the
 * private Cloud Map name. A request that came through the public load balancer
 * always carries `X-Forwarded-For` (the ALB appends the client address and a
 * client cannot remove it), while in-VPC calls do not. The match is
 * case-insensitive because the router is, and the load balancer's path rule is
 * not.
 */
export function isInternalRouteViaEdge(
  req: Pick<Request, 'headers' | 'path'>,
): boolean {
  return (
    INTERNAL_ROUTE_PATTERN.test(req.path) &&
    req.headers['x-forwarded-for'] !== undefined
  );
}

export function createInternalRouteEdgeGuard(isEnabled: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isEnabled && isInternalRouteViaEdge(req)) {
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }

    next();
  };
}

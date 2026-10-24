import type { IncomingHttpHeaders } from 'node:http';

type BetterAuthClientIpRequest = {
  headers: IncomingHttpHeaders;
  ip?: string;
  socket?: { remoteAddress?: string };
};

/**
 * Makes `x-forwarded-for` carry only the client IP Express resolved.
 *
 * Better Auth reads the client IP (rate limits, session `ipAddress`, and the
 * per-IP cap on free credit grants) from the first `x-forwarded-for` entry. The
 * production ALB runs in `append` mode, so the first entry is whatever the
 * client sent and the real address is the last one: anyone could forge the
 * header and dodge every IP-keyed limit. `request.ip` already honours the
 * `trust proxy` setting (the ALB hop on cloud, nothing on self-host), so
 * pinning the header to it leaves a single, trustworthy value.
 */
export function pinBetterAuthClientIp(
  request: BetterAuthClientIpRequest,
): void {
  const clientIp = request.ip || request.socket?.remoteAddress;
  if (clientIp) {
    request.headers['x-forwarded-for'] = clientIp;
  }
}

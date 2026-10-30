import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_HOSTS = new Set([...LOOPBACK_HOSTS, 'genfeed.localhost']);
const LOCAL_DEVELOPMENT_HOST_SUFFIX = '.genfeed.localhost';

@Injectable()
export class LocalhostOnlyGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Transport is judged on the peer address only. `Host`, `X-Forwarded-Host`
    // and `X-Forwarded-For` are caller-controlled, so a remote client could
    // otherwise claim to be local. `request.ip` already honors TRUST_PROXY.
    const ipCandidates = [request.ip, request.socket.remoteAddress];
    const originCandidates = [
      this.extractUrlHostname(request.headers.origin),
      this.extractUrlHostname(request.headers.referer),
    ].filter((value): value is string => Boolean(value));

    const isLocalTransport = ipCandidates.some((value) =>
      this.isLocalIp(value),
    );
    const isLocalOrigin =
      originCandidates.length === 0 ||
      originCandidates.some((value) => this.isLocalHost(value));

    if (isLocalTransport && isLocalOrigin) {
      return true;
    }

    this.loggerService.warn(
      `[LocalhostOnlyGuard] Blocked non-local request to ${request.path}`,
      {
        hostname: request.hostname,
        ip: request.ip,
        origin: request.headers.origin,
        referer: request.headers.referer,
      },
    );
    throw new ForbiddenException('Access denied');
  }

  private extractUrlHostname(
    value: string | string[] | undefined,
  ): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) {
      return undefined;
    }

    try {
      return this.normalizeIpOrHost(new URL(raw).hostname);
    } catch {
      return undefined;
    }
  }

  private isLocalHost(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const normalizedValue = this.normalizeIpOrHost(value);
    return (
      LOCAL_HOSTS.has(normalizedValue) ||
      normalizedValue.endsWith(LOCAL_DEVELOPMENT_HOST_SUFFIX)
    );
  }

  private isLocalIp(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    return LOOPBACK_HOSTS.has(this.normalizeIpOrHost(value));
  }

  private normalizeIpOrHost(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('::ffff:')) {
      return trimmed.slice(7);
    }

    return trimmed.replace(/^\[(.*)\]$/, '$1');
  }
}

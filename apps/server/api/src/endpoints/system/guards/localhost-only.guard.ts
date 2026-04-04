import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

@Injectable()
export class LocalhostOnlyGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const hostCandidates = [
      request.hostname,
      this.normalizeHostHeader(request.headers.host),
      this.normalizeHostHeader(request.headers['x-forwarded-host']),
    ];
    const ipCandidates = [
      request.ip,
      request.socket.remoteAddress,
      this.extractForwardedIp(request.headers['x-forwarded-for']),
    ];
    const originCandidates = [
      this.extractUrlHostname(request.headers.origin),
      this.extractUrlHostname(request.headers.referer),
    ].filter((value): value is string => Boolean(value));

    const isLocalTransport =
      hostCandidates.some((value) => this.isLocalHost(value)) ||
      ipCandidates.some((value) => this.isLocalIp(value));
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

  private extractForwardedIp(
    header: string | string[] | undefined,
  ): string | undefined {
    const raw = Array.isArray(header) ? header[0] : header;
    return raw?.split(',')[0]?.trim();
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

    return LOCAL_HOSTS.has(this.normalizeIpOrHost(value));
  }

  private isLocalIp(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    return LOCAL_HOSTS.has(this.normalizeIpOrHost(value));
  }

  private normalizeHostHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) {
      return undefined;
    }

    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith('[')) {
      const closingBracketIndex = trimmed.indexOf(']');
      if (closingBracketIndex !== -1) {
        return this.normalizeIpOrHost(trimmed.slice(1, closingBracketIndex));
      }
    }

    return this.normalizeIpOrHost(trimmed.split(':')[0]);
  }

  private normalizeIpOrHost(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('::ffff:')) {
      return trimmed.slice(7);
    }

    return trimmed.replace(/^\[(.*)\]$/, '$1');
  }
}

import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly allowedIps: string[];

  constructor(private readonly loggerService: LoggerService) {
    const ips = process.env.ADMIN_ALLOWED_IPS || '';
    this.allowedIps = ips
      .split(',')
      .map((ip) => this.normalizeIp(ip.trim()))
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.normalizeIp(
      request.ip || request.socket.remoteAddress || '',
    );

    if (this.allowedIps.length === 0) {
      this.loggerService.warn(
        `[IpWhitelistGuard] ADMIN_ALLOWED_IPS is empty — blocking request from ${clientIp}`,
      );
      throw new ForbiddenException('Access denied');
    }

    if (!this.allowedIps.includes(clientIp)) {
      this.loggerService.warn(
        `[IpWhitelistGuard] Blocked request from ${clientIp} to ${request.path}`,
      );
      throw new ForbiddenException('Access denied');
    }

    return true;
  }

  private normalizeIp(ip: string): string {
    const trimmed = ip.trim();
    if (trimmed.startsWith('::ffff:')) {
      return trimmed.slice(7);
    }
    return trimmed;
  }
}

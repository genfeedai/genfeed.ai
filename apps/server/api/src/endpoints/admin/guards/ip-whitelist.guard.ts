import {
  getAdminAllowedIps,
  isAdminIpAllowed,
  resolveAdminClientIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
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
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (isAdminIpAllowed(request)) {
      return true;
    }

    const clientIp = resolveAdminClientIp(request);
    this.loggerService.warn(
      getAdminAllowedIps().length === 0
        ? `[IpWhitelistGuard] ADMIN_ALLOWED_IPS is empty — blocking request from ${clientIp}`
        : `[IpWhitelistGuard] Blocked request from ${clientIp} to ${request.path}`,
    );
    throw new ForbiddenException(
      `Admin access is restricted to allowlisted IPs (your IP: ${clientIp || 'unknown'})`,
    );
  }
}

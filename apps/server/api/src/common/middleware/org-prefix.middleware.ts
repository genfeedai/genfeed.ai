import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const PREFIX_PATTERN = /^[A-Z]{3}$/;

export interface RequestWithOrgPrefix extends Request {
  resolvedOrganizationId?: string;
  resolvedOrgPrefix?: string;
}

/**
 * Middleware that resolves `/{PREFIX}/...` routes to an organization ID.
 *
 * If the first path segment matches a 3-letter uppercase prefix, look up the
 * matching organization and attach its ID to `req.resolvedOrganizationId`.
 * The resolved prefix is also set on `req.resolvedOrgPrefix`.
 *
 * If the prefix doesn't match any org, the request proceeds without resolution
 * (downstream guards/controllers decide how to handle missing context).
 */
@Injectable()
export class OrgPrefixMiddleware implements NestMiddleware {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly logger: LoggerService,
  ) {}

  async use(
    req: RequestWithOrgPrefix,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Extract first path segment (e.g., "/GEN/issues/GEN-42" → "GEN")
    const segments = req.path.split('/').filter(Boolean);
    const candidate = segments[0];

    if (!candidate || !PREFIX_PATTERN.test(candidate)) {
      return next();
    }

    try {
      const org = await this.organizationsService.findByPrefix(candidate);
      if (org) {
        req.resolvedOrganizationId = org._id.toString();
        req.resolvedOrgPrefix = candidate;
      }
    } catch (error: unknown) {
      this.logger.warn(
        `OrgPrefixMiddleware: failed to resolve prefix "${candidate}"`,
        { error: (error as Error)?.message },
      );
    }

    return next();
  }
}

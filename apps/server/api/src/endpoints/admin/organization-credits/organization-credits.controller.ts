import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const ADMIN_GRANT_SOURCE = 'admin-grant';
const DEFAULT_EXPIRY_DAYS = 365;
const MAX_GRANT = 100_000;

const identifier = z.string().trim().min(1).max(200);
const grantSchema = z
  .object({
    amount: z.number().int().positive().max(MAX_GRANT),
    expiresInDays: z.number().int().positive().max(3650).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

@Controller('admin/organizations/:organizationId/credits')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationCreditsController {
  constructor(private readonly credits: CreditsUtilsService) {}

  @Post()
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async grant(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'A positive whole-number amount and a grant reason are required',
      );
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    const { amount, expiresInDays, idempotencyKey, reason } = parsed.data;
    const expiresAt = new Date(
      Date.now() + (expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000,
    );

    return runWithTenantContext({ organizationId }, async () => {
      await this.credits.addOrganizationCreditsWithExpiration(
        organizationId,
        amount,
        ADMIN_GRANT_SOURCE,
        reason,
        expiresAt,
        { actorUserId: operatorUserId, idempotencyKey },
      );
      const balance =
        await this.credits.getOrganizationCreditsBalance(organizationId);
      return {
        data: {
          balance,
          creditsGranted: amount,
          expiresAt: expiresAt.toISOString(),
          organizationId,
        },
      };
    });
  }
}

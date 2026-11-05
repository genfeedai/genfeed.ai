import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationApiKeysService } from '@api/endpoints/admin/organization-api-keys/organization-api-keys.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { isApiKeyPermissionLevelOffered } from '@genfeedai/contracts/constants';
import type { IAdminPartnerApiKeyResult } from '@genfeedai/contracts/interfaces';
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

const identifier = z.string().trim().min(1).max(200);
const levelSchema = z.enum(['none', 'read', 'write']);
const partnerKeySchema = z
  .object({
    defaultBrandId: identifier.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    expiresInDays: z.number().int().positive().max(3650).optional(),
    label: z.string().trim().min(1).max(100),
    levels: z
      .record(z.string(), levelSchema)
      .refine(
        (levels) =>
          Object.entries(levels).every(([resourceId, level]) =>
            isApiKeyPermissionLevelOffered(resourceId, level),
          ),
        'Every level must name a permission resource that offers it',
      )
      .optional(),
  })
  .strict();

/**
 * Admin-only mint path for partner keys (#9201). The organization comes from
 * the path, so a platform admin can mint for a customer organization without
 * being one of its members.
 */
@Controller('admin/organizations/:organizationId/api-keys')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationApiKeysController {
  constructor(private readonly apiKeys: AdminOrganizationApiKeysService) {}

  @Post()
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async mintPartnerKey(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ): Promise<{ data: IAdminPartnerApiKeyResult }> {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = partnerKeySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'A label is required; levels must be none, read or write for a known resource',
      );
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    return runWithTenantContext({ organizationId }, async () => ({
      data: await this.apiKeys.mintPartnerKey(organizationId, {
        ...parsed.data,
        operatorUserId,
      }),
    }));
  }
}

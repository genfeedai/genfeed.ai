import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import {
  type AdminAddMemberResult,
  AdminOrganizationMembersService,
} from '@api/endpoints/admin/organization-members/organization-members.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);

const addMemberSchema = z
  .object({
    email: z.string().trim().email().max(320),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    roleKey: z.enum(['admin', 'member']).default('admin'),
  })
  .strict();

/**
 * Member-scoped routes resolve the organization from the caller's own
 * memberships, so a platform admin cannot reach a customer organization
 * through them. This route takes the organization explicitly and, unlike the
 * invitation flow, sends no email.
 */
@Controller('admin/organizations/:organizationId/members')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationMembersController {
  constructor(private readonly members: AdminOrganizationMembersService) {}

  @Post()
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async add(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ): Promise<{ data: AdminAddMemberResult }> {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'A valid email and a role of admin or member are required',
      );
    }

    // The caller's own tenant is the operator organization, so the
    // organization-scoped Member queries need the path organization as the
    // tenant, as the other admin organization routes do.
    return runWithTenantContext({ organizationId }, async () => ({
      data: await this.members.addMember(organizationId, parsed.data),
    }));
  }
}

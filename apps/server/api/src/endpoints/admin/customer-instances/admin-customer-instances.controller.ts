import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import {
  AdminCustomerInstancesService,
  type AdminCustomerInstanceView,
  adminCustomerInstanceInputSchema,
  adminCustomerInstanceReferenceSchema,
} from '@api/endpoints/admin/customer-instances/admin-customer-instances.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

const organizationIdSchema = z.string().trim().min(1).max(200);

function parseOrganizationId(value: string): string {
  const parsed = organizationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException('Invalid organization id');
  }
  return parsed.data;
}

function parseReference(value: string): string {
  const parsed = adminCustomerInstanceReferenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      'Instance reference must be 1-200 letters, digits or . _ : -',
    );
  }
  return parsed.data;
}

/**
 * Operator routes that attach a dedicated instance to one organization.
 *
 * Super admin only. No IP allow-list: the operator tool drives these routes
 * from the operator's browser, whose IP changes, and `SuperAdminGuard` is the
 * gate. The organization comes from the path and every read and write below is
 * scoped to it.
 */
@Controller('admin/organizations/:organizationId/customer-instances')
@UseGuards(SuperAdminGuard)
export class AdminCustomerInstancesController {
  constructor(private readonly instances: AdminCustomerInstancesService) {}

  @Get()
  async list(
    @Param('organizationId') organizationId: string,
  ): Promise<{ data: AdminCustomerInstanceView[] }> {
    const orgId = parseOrganizationId(organizationId);
    return await runWithTenantContext({ organizationId: orgId }, async () => ({
      data: await this.instances.list(orgId),
    }));
  }

  @Put(':reference')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async upsert(
    @Param('organizationId') organizationId: string,
    @Param('reference') reference: string,
    @Body() body: unknown,
  ): Promise<{ data: AdminCustomerInstanceView }> {
    const orgId = parseOrganizationId(organizationId);
    const instanceReference = parseReference(reference);
    const parsed = adminCustomerInstanceInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'apiUrl, role (images, voices, videos or full) and status (provisioning, running, stopped or terminated) are required',
      );
    }

    return await runWithTenantContext({ organizationId: orgId }, async () => ({
      data: await this.instances.upsert(orgId, instanceReference, parsed.data),
    }));
  }

  @Delete(':reference')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('reference') reference: string,
  ): Promise<void> {
    const orgId = parseOrganizationId(organizationId);
    const instanceReference = parseReference(reference);
    await runWithTenantContext({ organizationId: orgId }, async () => {
      await this.instances.remove(orgId, instanceReference);
    });
  }
}

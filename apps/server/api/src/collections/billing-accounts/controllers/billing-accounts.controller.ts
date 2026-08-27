import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GrantBillingRoleDto } from '@api/collections/billing-accounts/dto/grant-billing-role.dto';
import { LinkOrganizationDto } from '@api/collections/billing-accounts/dto/link-organization.dto';
import { BillingAccountMigrationService } from '@api/collections/billing-accounts/services/billing-account-migration.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BillingAccountSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
@AutoSwagger()
@Controller('billing-accounts')
@UseGuards(RolesGuard)
export class BillingAccountsController {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly migrationService: BillingAccountMigrationService,
  ) {}

  @Get('current')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCurrent(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
  ) {
    const organizationId = this.organizationId(request, user);
    const snapshot = await this.billingAccountsService.getSnapshot(
      organizationId,
      user.userId ?? user.id,
    );
    return serializeSingle(request, BillingAccountSerializer, snapshot);
  }

  @Post('current/organizations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async linkOrganization(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
    @Body() body: LinkOrganizationDto,
  ) {
    const organizationId = this.organizationId(request, user);
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    await this.billingAccountsService.linkOrganization({
      actorUserId: user.userId ?? user.id,
      billingAccountId: account.id,
      organizationId: body.organizationId,
    });
    const snapshot = await this.billingAccountsService.getSnapshot(
      body.organizationId,
      user.userId ?? user.id,
    );
    return serializeSingle(request, BillingAccountSerializer, snapshot);
  }

  @Delete('current/organizations/:organizationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async detachOrganization(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ) {
    const currentOrganizationId = this.organizationId(request, user);
    const account = await this.billingAccountsService.resolveForOrganization(
      currentOrganizationId,
    );
    await this.billingAccountsService.detachOrganization({
      actorUserId: user.userId ?? user.id,
      billingAccountId: account.id,
      organizationId,
    });
    const snapshot = await this.billingAccountsService.getSnapshot(
      currentOrganizationId,
      user.userId ?? user.id,
    );
    return serializeSingle(request, BillingAccountSerializer, snapshot);
  }

  @Post('current/members')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async grantRole(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
    @Body() body: GrantBillingRoleDto,
  ) {
    const organizationId = this.organizationId(request, user);
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    await this.billingAccountsService.grantRole({
      actorUserId: user.userId ?? user.id,
      billingAccountId: account.id,
      role: body.role,
      userId: body.userId,
    });
    const snapshot = await this.billingAccountsService.getSnapshot(
      organizationId,
      user.userId ?? user.id,
    );
    return serializeSingle(request, BillingAccountSerializer, snapshot);
  }

  @Delete('current/members/:userId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async revokeRole(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
    @Param('userId') userId: string,
  ) {
    const organizationId = this.organizationId(request, user);
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);
    await this.billingAccountsService.revokeRole({
      actorUserId: user.userId ?? user.id,
      billingAccountId: account.id,
      userId,
    });
    const snapshot = await this.billingAccountsService.getSnapshot(
      organizationId,
      user.userId ?? user.id,
    );
    return serializeSingle(request, BillingAccountSerializer, snapshot);
  }

  @Post('migrate/dry-run')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async dryRunMigration() {
    return this.migrationService.dryRun();
  }

  @Post('migrate/apply')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async applyMigration() {
    return this.migrationService.applyUnambiguous();
  }

  private organizationId(request: RequestWithContext, user: User): string {
    return request.context?.organizationId ?? user.organizationId;
  }
}

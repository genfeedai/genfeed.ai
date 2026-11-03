/**
 * Enterprise-managed authorization for the MCP connector. An organization
 * owner registers the one issuer whose signed identity assertions may sign
 * their members in without a consent screen.
 *
 * Owner only: whoever controls the trusted issuer can sign in as any member
 * of the workspace, so it is not delegated to admins.
 */

import { UpdateMcpEnterpriseAuthDto } from '@api/collections/organizations/dto/update-mcp-enterprise-auth.dto';
import { McpEnterpriseAuthConfigService } from '@api/collections/organizations/services/mcp-enterprise-auth-config.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { MemberRole } from '@genfeedai/contracts';
import type { IMcpEnterpriseAuthSettings } from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsMcpEnterpriseAuthController {
  constructor(private readonly configService: McpEnterpriseAuthConfigService) {}

  /** The path organization must be the one the caller is acting in. */
  private resolveOrganizationId(
    request: RequestWithContext,
    organizationId: string,
  ): string {
    if (getIsSuperAdmin(request.user, request)) {
      return organizationId;
    }
    const activeOrganizationId =
      request.context?.organizationId || request.user?.organizationId;
    if (activeOrganizationId && activeOrganizationId !== organizationId) {
      throw new ForbiddenException(
        'Organization does not match the active organization',
      );
    }
    return organizationId;
  }

  @Get(':organizationId/settings/mcp-enterprise-auth')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async get(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ): Promise<IMcpEnterpriseAuthSettings> {
    return this.configService.get(
      this.resolveOrganizationId(req, organizationId),
    );
  }

  @Put(':organizationId/settings/mcp-enterprise-auth')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER])
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async save(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateMcpEnterpriseAuthDto,
  ): Promise<IMcpEnterpriseAuthSettings> {
    return this.configService.save(
      this.resolveOrganizationId(req, organizationId),
      body,
      req.user?.userId,
    );
  }

  @Delete(':organizationId/settings/mcp-enterprise-auth')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER])
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ): Promise<{ isSuccess: boolean }> {
    await this.configService.remove(
      this.resolveOrganizationId(req, organizationId),
    );
    return { isSuccess: true };
  }
}

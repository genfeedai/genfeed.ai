import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { InstallSystemWorkflowDto } from '@api/collections/workflows/dto/install-system-workflow.dto';
import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * System workflow catalog (#2176): discover code-owned templates and install
 * them into the active organization. Registered before the CRUD `:workflowId`
 * controller so literal routes are not shadowed.
 */
@AutoSwagger()
@Controller('workflows')
@UseGuards(RolesGuard)
export class SystemWorkflowCatalogController {
  constructor(
    private readonly systemWorkflowCatalogService: SystemWorkflowCatalogService,
    readonly _loggerService: LoggerService,
  ) {}

  @Get('system-catalog')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listCatalog(@CurrentUser() user: User): Promise<{
    data: Awaited<
      ReturnType<SystemWorkflowCatalogService['listCatalogForOrganization']>
    >;
  }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const data =
        await this.systemWorkflowCatalogService.listCatalogForOrganization(
          publicMetadata.organization,
        );
      return { data };
    }, 'Failed to list system workflow catalog');
  }

  @Post('system-catalog/:canonicalId/install')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async install(
    @Req() request: Request,
    @Param('canonicalId') canonicalId: string,
    @CurrentUser() user: User,
    @Body() dto: InstallSystemWorkflowDto = {},
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const brandId = dto.brandId ?? (publicMetadata.brand || undefined);

      const workflow = await this.systemWorkflowCatalogService.install({
        brandId,
        canonicalId,
        organizationId: publicMetadata.organization,
        userId: publicMetadata.user,
      });

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to install system workflow from catalog');
  }
}

import { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope, MemberRole } from '@genfeedai/enums';
import type {
  IPublishingSetupChecklist,
  IPublishingSetupDiagnosticsExport,
} from '@genfeedai/interfaces';
import { Controller, Get, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * Deployment-level publishing setup. The checklist answers "can this
 * installation publish at all?", which sits upstream of the per-credential
 * readiness exposed by the credentials collection.
 *
 * Both payloads are computed contract objects, not database records, so they
 * are returned directly rather than through a serializer.
 */
@AutoSwagger()
@ApiTags('PublishingSetup')
@Controller('publishing-setup')
@UseGuards(RolesGuard)
export class PublishingSetupController {
  constructor(
    private readonly publishingSetupService: PublishingSetupService,
  ) {}

  @Get('checklist')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getChecklist(): Promise<IPublishingSetupChecklist> {
    return this.publishingSetupService.buildChecklist();
  }

  /**
   * Operator support bundle. Admin-scoped because it aggregates every check's
   * diagnostics — sanitized, but still a fuller picture of the deployment than
   * the checklist itself.
   *
   * `@RequiredScopes` only binds API-key tokens; the roles metadata is what
   * keeps browser sessions out, since RolesGuard admits any active member when
   * a handler declares no roles.
   */
  @Get('diagnostics')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getDiagnostics(): Promise<IPublishingSetupDiagnosticsExport> {
    return this.publishingSetupService.exportDiagnostics();
  }
}

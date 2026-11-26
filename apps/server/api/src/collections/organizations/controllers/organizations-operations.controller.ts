import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { API_KEY_CONTENT_GENERATION_SCOPES } from '@api/helpers/utils/auth/api-key-route-scope-sets.util';
import { Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsOperationsController {
  constructor(
    private readonly operationsService: OrganizationsOperationsService,
  ) {}

  @Patch(':id/activate')
  @RequiredScopes(...API_KEY_CONTENT_GENERATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'OrganizationsController.switchOrganization',
    summary: 'switchOrganization',
  })
  switchOrganization(
    @Param('id') organizationId: string,
    @CurrentUser() user: User,
  ) {
    return this.operationsService.switchOrganization(organizationId, user);
  }
}

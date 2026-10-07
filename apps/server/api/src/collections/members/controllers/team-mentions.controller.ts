import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { AgentTeamMentionsResponse } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('team')
@UseGuards(RolesGuard)
export class TeamMentionsController {
  constructor(private readonly membersService: MembersService) {}

  @TenantReadPolicy('selected')
  @Get('mentions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMentions(
    @CurrentUser() user: User,
  ): Promise<AgentTeamMentionsResponse> {
    if (!resolveTenantReadScope(user).organizationId) {
      throw new BadRequestException({
        detail: 'Organization not found in metadata',
        title: 'Bad Request',
      });
    }

    const mentions = await this.membersService.listTeamMentions(
      resolveTenantReadScope(user).organizationId,
    );

    return { mentions };
  }
}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type { AgentTeamMentionsResponse } from '@genfeedai/interfaces';
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

  @Get('mentions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMentions(
    @CurrentUser() user: User,
  ): Promise<AgentTeamMentionsResponse> {
    const publicMetadata = getPublicMetadata(user);

    if (!publicMetadata.organization) {
      throw new BadRequestException({
        detail: 'Organization not found in metadata',
        title: 'Bad Request',
      });
    }

    const mentions = await this.membersService.listTeamMentions(
      publicMetadata.organization,
    );

    return { mentions };
  }
}

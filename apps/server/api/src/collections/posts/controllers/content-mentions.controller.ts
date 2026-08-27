import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { AgentContentMentionsResponse } from '@genfeedai/interfaces';
import {
  BadRequestException,
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('content')
@UseGuards(RolesGuard)
export class ContentMentionsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('mentions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMentions(
    @CurrentUser() user: User,
  ): Promise<AgentContentMentionsResponse> {
    if (!user.organizationId) {
      throw new BadRequestException({
        detail: 'Organization not found in metadata',
        title: 'Bad Request',
      });
    }

    const mentions = await this.postsService.listContentMentions(
      user.organizationId,
    );

    return { mentions };
  }
}

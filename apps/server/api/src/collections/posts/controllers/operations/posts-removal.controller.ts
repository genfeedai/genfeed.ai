import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { DeletePostDto } from '@api/collections/posts/dto/delete-post.dto';
import {
  type PostRemovalResult,
  PostRemovalService,
} from '@api/collections/posts/services/post-removal.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@OrganizationModule('publishing')
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsRemovalController {
  constructor(private readonly postRemovalService: PostRemovalService) {}

  /**
   * Delete a post from Genfeed, published ones included, and with
   * `includeMedia` the Library media only it uses. Soft delete: the copy on the
   * social network is not touched, which the response states. The web app, the
   * MCP actions and the CLI all call this route.
   */
  @Post(':postId/deletions')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deletePost(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() dto: DeletePostDto,
  ): Promise<PostRemovalResult> {
    const result = await this.postRemovalService.removePost({
      brandId: dto.brandId,
      editor: { brandId: user.brandId, userId: user.userId },
      includeMedia: dto.includeMedia === true,
      organizationId: user.organizationId.toString(),
      postId,
    });
    if (!result) {
      throw new HttpException(
        { detail: 'Post not found', title: `Post ${postId} not found` },
        HttpStatus.NOT_FOUND,
      );
    }
    return result;
  }
}

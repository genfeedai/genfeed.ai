import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  createPostsGenerationHttpException,
  generationFailureMessage,
  isOwnedPost,
  isTwitterPlatform,
  resolveByokApiKeyOverride,
  threadExpansionBlockReason,
} from '@api/collections/posts/controllers/operations/posts-generation.helpers';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Proposes thread replies for an X post for the user to review. Nothing is
 * saved here; accepted replies are created through the regular post routes.
 */
@AutoSwagger()
@FeatureFlag('publishing')
@OrganizationModule('publishing')
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsThreadDraftController {
  constructor(
    private readonly logger: LoggerService,
    private readonly postGenerationService: PostGenerationService,
    private readonly postsService: PostsService,
  ) {}

  @Post(':postId/thread-drafts')
  @Credits({
    allowByokBypass: true,
    description: 'Thread draft (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    provider: ByokProvider.OPENROUTER,
    source: ActivitySource.POST_ENHANCEMENT,
  })
  @UseGuards(CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async draftThread(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() dto: ExpandToThreadDto,
  ): Promise<{ posts: string[] }> {
    const originalPost = await this.postsService.findOne({ id: postId }, [
      PopulatePatterns.credentialMinimal,
    ]);
    const existingChildren = originalPost
      ? await this.postsService.count(originalPost.organizationId, {
          parentId: postId,
        })
      : 0;
    const blockReason = threadExpansionBlockReason({
      existingChildren,
      isOwned: isOwnedPost(originalPost, user.organizationId),
      isTwitter: isTwitterPlatform(originalPost?.platform),
      postExists: Boolean(originalPost),
    });

    if (blockReason || !originalPost) {
      throw createPostsGenerationHttpException(
        blockReason?.detail ?? 'The specified post does not exist',
        blockReason?.title ?? 'Post not found',
        blockReason?.status ?? HttpStatus.NOT_FOUND,
      );
    }

    try {
      const posts = await this.postGenerationService.draftThread(
        originalPost,
        dto,
        user,
        resolveByokApiKeyOverride(request),
      );
      return { posts };
    } catch (error: unknown) {
      const errorMessage = generationFailureMessage(error, 'Unknown error');
      this.logger.error(`Thread draft failed: ${errorMessage}`);
      throw createPostsGenerationHttpException(
        errorMessage || 'Failed to draft the thread',
        'Thread draft failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

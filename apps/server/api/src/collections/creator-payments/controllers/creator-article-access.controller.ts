import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatorArticleAccessService } from '@api/collections/creator-payments/services/creator-article-access.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import type {
  ICreatorArticleAccess,
  IUnlockCreatorArticleResult,
} from '@genfeedai/contracts/interfaces/billing';
import { Controller, Get, Param, Post } from '@nestjs/common';

/** Paid articles (#9718): a signed-in reader's access, and the unlock. */
@AutoSwagger()
@Controller('creator-payments/articles')
export class CreatorArticleAccessController {
  constructor(
    private readonly creatorArticleAccessService: CreatorArticleAccessService,
  ) {}

  /** The full article when the reader has access, otherwise how to get it. */
  @Get(':articleId')
  @RequiredScopes(ApiKeyScope.ARTICLES_READ)
  async getAccess(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ): Promise<ICreatorArticleAccess> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorArticleAccessService.getAccess(
      { organizationId, userId },
      articleId,
    );
  }

  /** Pay the article's unlock price once and read it in full. */
  @Post(':articleId/unlock')
  // Spends the organization's credits: a person's session, or an admin key.
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async unlock(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ): Promise<IUnlockCreatorArticleResult> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorArticleAccessService.unlock(
      { organizationId, userId },
      articleId,
    );
  }
}

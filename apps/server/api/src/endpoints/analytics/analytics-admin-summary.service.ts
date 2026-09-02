import { BotsService } from '@api/collections/bots/services/bots.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { AnalyticsAdminSummary } from '@api/endpoints/analytics/analytics.types';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { postExecutionStateReadFilter } from '@api-types/contracts/scheduler.contract';
import {
  BotStatus,
  IngredientCategory,
  TargetExecutionState,
  WorkflowStatus,
} from '@genfeedai/enums';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsAdminSummaryService {
  constructor(
    private readonly botsService: BotsService,
    private readonly brandsService: BrandsService,
    private readonly ingredientsService: IngredientsService,
    private readonly modelsService: ModelsService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly usersService: UsersService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async getSummary(
    query: Partial<BaseQueryDto> = {},
  ): Promise<AnalyticsAdminSummary> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const [
      totalSubscriptions,
      totalUsers,
      totalPosts,
      totalBrands,
      totalVideos,
      totalImages,
      totalOrganizations,
      activeWorkflows,
      activeBots,
      totalModels,
      pendingPosts,
    ] = await Promise.all([
      this.subscriptionsService.findAll({ where: {} }, options),
      this.usersService.findAll({ where: {} }, options),
      this.postsService.findAll({ where: {} }, options),
      this.brandsService.findAll({ where: {} }, options),
      this.ingredientsService.findAll(
        {
          where: {
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VIDEO,
            ),
          },
        },
        options,
      ),
      this.ingredientsService.findAll(
        {
          where: {
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.IMAGE,
            ),
          },
        },
        options,
      ),
      this.organizationsService.findAll(
        { where: { isDeleted: false } },
        options,
      ),
      this.workflowsService.findAll(
        { where: { isDeleted: false, status: WorkflowStatus.ACTIVE } },
        options,
      ),
      this.botsService.findAll(
        { where: { isDeleted: false, status: BotStatus.ACTIVE } },
        options,
      ),
      this.modelsService.findAll({ where: { isDeleted: false } }, options),
      this.postsService.findAll(
        {
          where: {
            isDeleted: false,
            ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHING),
          },
        },
        options,
      ),
    ]);

    return {
      activeBots: this.extractTotal(activeBots),
      activeWorkflows: this.extractTotal(activeWorkflows),
      monthlyGrowth: 0,
      pendingPosts: this.extractTotal(pendingPosts),
      recentActivities: 0,
      totalBrands: this.extractTotal(totalBrands),
      totalCredentialsConnected: 0,
      totalCredits: 0,
      totalImages: this.extractTotal(totalImages),
      totalModels: this.extractTotal(totalModels),
      totalOrganizations: this.extractTotal(totalOrganizations),
      totalPosts: this.extractTotal(totalPosts),
      totalSubscriptions: this.extractTotal(totalSubscriptions),
      totalUsers: this.extractTotal(totalUsers),
      totalVideos: this.extractTotal(totalVideos),
      totalViews: 0,
      viewsGrowth: 0,
    };
  }

  private extractTotal(result: unknown): number {
    if (!result || typeof result !== 'object') {
      return 0;
    }

    const counts = result as { total?: unknown; totalDocs?: unknown };
    if (typeof counts.total === 'number') {
      return counts.total;
    }

    return typeof counts.totalDocs === 'number' ? counts.totalDocs : 0;
  }
}

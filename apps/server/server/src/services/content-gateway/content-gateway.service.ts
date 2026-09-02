import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import type {
  ContentGatewayResult,
  ContentSignal,
} from '@server/services/content-gateway/interfaces/content-gateway.interfaces';
import { SkillWorkflowService } from '@server/services/skill-executor/skill-executor.service';

@Injectable()
export class ContentGatewayService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly skillsService: SkillsService,
    private readonly skillWorkflowService: SkillWorkflowService,
    private readonly reviewablePostsService: ReviewablePostsService,
    private readonly logger: LoggerService,
  ) {}

  async routeSignal(signal: ContentSignal): Promise<ContentGatewayResult> {
    await this.assertBrand(signal.organizationId, signal.brandId);

    const requestedSkillSlugs = this.resolveSkillSlugs(signal.payload);
    const enabledSkillSlugs = await this.skillsService.getEnabledSkillSlugs(
      signal.organizationId,
      signal.brandId,
      requestedSkillSlugs,
    );

    const executions: string[] = [];
    const posts: ContentGatewayResult['posts'] = [];

    for (const skillSlug of enabledSkillSlugs) {
      const execution = await this.skillWorkflowService.execute(
        skillSlug,
        {
          brandId: signal.brandId,
          brandVoice: '',
          organizationId: signal.organizationId,
          platforms: [],
        },
        signal.payload,
        signal.userId,
      );

      executions.push(execution.executionId);

      const createdPosts =
        await this.reviewablePostsService.createFromSkillExecution({
          brandId: signal.brandId,
          drafts: [execution.draft],
          executionId: execution.executionId,
          organizationId: signal.organizationId,
          skillSlug,
          userId: signal.userId,
        });

      posts.push(...createdPosts);
    }

    this.logger.log('Signal routed through ContentGateway', {
      brandId: signal.brandId,
      posts: posts.length,
      organizationId: signal.organizationId,
      executions: executions.length,
      signalType: signal.type,
    });

    return { executions, posts };
  }

  async processManualRequest(
    organizationId: string,
    brandId: string,
    skillSlug: string,
    params?: Record<string, unknown>,
    userId?: string,
  ): Promise<ContentGatewayResult> {
    await this.assertBrand(organizationId, brandId);

    const execution = await this.skillWorkflowService.execute(
      skillSlug,
      {
        brandId,
        brandVoice: '',
        organizationId,
        platforms: [],
      },
      params,
      userId,
    );

    const posts = await this.reviewablePostsService.createFromSkillExecution({
      brandId,
      drafts: [execution.draft],
      executionId: execution.executionId,
      organizationId,
      skillSlug,
      userId,
    });

    return {
      executions: [execution.executionId],
      posts,
    };
  }

  private async assertBrand(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
  }

  private resolveSkillSlugs(
    payload?: Record<string, unknown>,
  ): string[] | undefined {
    if (!payload) {
      return undefined;
    }

    const skillSlugs = payload.skillSlugs;

    if (!Array.isArray(skillSlugs)) {
      return undefined;
    }

    const parsed = skillSlugs.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return parsed.length > 0 ? parsed : undefined;
  }
}

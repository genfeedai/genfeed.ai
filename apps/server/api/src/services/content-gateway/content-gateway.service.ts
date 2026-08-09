import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type {
  ContentGatewayResult,
  ContentSignal,
} from '@api/services/content-gateway/interfaces/content-gateway.interfaces';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentGatewayService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly skillsService: SkillsService,
    private readonly skillExecutorService: SkillExecutorService,
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

    const runs: string[] = [];
    const posts: ContentGatewayResult['posts'] = [];

    for (const skillSlug of enabledSkillSlugs) {
      const execution = await this.skillExecutorService.executeSkill(
        {
          brandId: signal.brandId,
          organizationId: signal.organizationId,
          signalType: signal.type,
        },
        skillSlug,
        signal.payload,
      );

      runs.push(execution.runId);

      const createdPosts =
        await this.reviewablePostsService.createFromSkillExecution({
          brandId: signal.brandId,
          drafts: execution.drafts,
          organizationId: signal.organizationId,
          runId: execution.runId,
          skillSlug,
          userId: signal.userId,
        });

      posts.push(...createdPosts);
    }

    this.logger.log('Signal routed through ContentGateway', {
      brandId: signal.brandId,
      posts: posts.length,
      organizationId: signal.organizationId,
      runs: runs.length,
      signalType: signal.type,
    });

    return { posts, runs };
  }

  async processManualRequest(
    organizationId: string,
    brandId: string,
    skillSlug: string,
    params?: Record<string, unknown>,
    userId?: string,
  ): Promise<ContentGatewayResult> {
    await this.assertBrand(organizationId, brandId);

    const execution = await this.skillExecutorService.executeSkill(
      {
        brandId,
        organizationId,
        signalType: 'manual',
      },
      skillSlug,
      params,
    );

    const posts = await this.reviewablePostsService.createFromSkillExecution({
      brandId,
      drafts: execution.drafts,
      organizationId,
      runId: execution.runId,
      skillSlug,
      userId,
    });

    return {
      posts,
      runs: [execution.runId],
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

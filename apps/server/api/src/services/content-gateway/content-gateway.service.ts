import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { summarizeBrandVoice } from '@api/services/content-gateway/content-gateway-brand-voice.util';
import type {
  ContentGatewayResult,
  ContentSignal,
} from '@api/services/content-gateway/interfaces/content-gateway.interfaces';
import { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
    const brand = await this.assertBrand(signal.organizationId, signal.brandId);
    const brandVoice = summarizeBrandVoice(
      brand,
      this.readPlatform(signal.payload),
    );

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
          brandVoice,
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
          campaignId: this.readCampaignId(signal.payload),
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
    const brand = await this.assertBrand(organizationId, brandId);

    const execution = await this.skillWorkflowService.execute(
      skillSlug,
      {
        brandId,
        brandVoice: summarizeBrandVoice(brand, this.readPlatform(params)),
        organizationId,
        platforms: [],
      },
      params,
      userId,
    );

    const posts = await this.reviewablePostsService.createFromSkillExecution({
      brandId,
      campaignId: this.readCampaignId(params),
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

  private readCampaignId(
    payload: Record<string, unknown> | undefined,
  ): string | undefined {
    const campaignId = payload?.campaignId;
    return typeof campaignId === 'string' && campaignId.trim()
      ? campaignId
      : undefined;
  }

  private readPlatform(
    payload: Record<string, unknown> | undefined,
  ): string | undefined {
    const platform = payload?.platform;
    return typeof platform === 'string' && platform.trim()
      ? platform
      : undefined;
  }

  private async assertBrand(
    organizationId: string,
    brandId: string,
  ): Promise<BrandDocument> {
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    return brand;
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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import type {
  ContentGatewayResult,
  ContentSignal,
} from '@api/services/content-gateway/interfaces/content-gateway.interfaces';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ContentGatewayService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly skillsService: SkillsService,
    private readonly skillExecutorService: SkillExecutorService,
    private readonly contentDraftsService: ContentDraftsService,
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
    const drafts: ContentGatewayResult['drafts'] = [];

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

      const createdDrafts =
        await this.contentDraftsService.createFromSkillExecution(
          signal.organizationId,
          signal.brandId,
          skillSlug,
          execution.runId,
          execution.drafts,
        );

      drafts.push(...createdDrafts);
    }

    this.logger.log('Signal routed through ContentGateway', {
      brandId: signal.brandId,
      drafts: drafts.length,
      organizationId: signal.organizationId,
      runs: runs.length,
      signalType: signal.type,
    });

    return { drafts, runs };
  }

  async processManualRequest(
    organizationId: string,
    brandId: string,
    skillSlug: string,
    params?: Record<string, unknown>,
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

    const drafts = await this.contentDraftsService.createFromSkillExecution(
      organizationId,
      brandId,
      skillSlug,
      execution.runId,
      execution.drafts,
    );

    return {
      drafts,
      runs: [execution.runId],
    };
  }

  private async assertBrand(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${brandId} not found`);
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

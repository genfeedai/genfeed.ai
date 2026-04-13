import type {
  ContentRunBrief,
  ContentRunPublishContext,
  ContentRunVariant,
} from '@api/collections/content-runs/schemas/content-run.schema';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import type {
  GatewayExecutionContext,
  GatewayExecutionResult,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SkillExecutorService {
  private readonly handlers: Record<string, SkillHandler>;

  constructor(
    private readonly skillsService: SkillsService,
    private readonly contentRunsService: ContentRunsService,
    private readonly byokProviderFactoryService: ByokProviderFactoryService,
    contentWritingHandler: ContentWritingHandler,
    imageGenerationHandler: ImageGenerationHandler,
    trendDiscoveryHandler: TrendDiscoveryHandler,
  ) {
    this.handlers = {
      'content-writing': contentWritingHandler,
      'image-generation': imageGenerationHandler,
      'trend-discovery': trendDiscoveryHandler,
    };
  }

  async execute(
    skillSlug: string,
    context: SkillExecutionContext,
    params: Record<string, unknown> = {},
  ): Promise<SkillExecutionResult> {
    const startedAt = Date.now();

    const skill = await this.skillsService.getSkillBySlug(
      context.organizationId,
      skillSlug,
    );

    if (!skill || !skill.isEnabled) {
      throw new NotFoundException(`Skill not found: ${skillSlug}`);
    }

    await this.skillsService.assertBrandSkillEnabled(
      context.organizationId,
      context.brandId,
      skillSlug,
    );

    const run = await this.contentRunsService.createRun({
      brand: context.brandId,
      brief: this.buildRunBrief(params),
      creditsUsed: 0,
      input: params,
      organization: context.organizationId,
      publish: this.buildRunPublishContext(params),
      skillSlug,
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
    });

    await this.contentRunsService.patchRun(
      context.organizationId,
      String(run._id),
      {
        status: ContentRunStatus.RUNNING,
      },
    );

    const handler = this.handlers[skillSlug];

    if (!handler) {
      await this.contentRunsService.patchRun(
        context.organizationId,
        String(run._id),
        {
          duration: Date.now() - startedAt,
          error: `No handler registered for skill: ${skillSlug}`,
          status: ContentRunStatus.FAILED,
        },
      );
      throw new NotFoundException(
        `No handler registered for skill: ${skillSlug}`,
      );
    }

    let source: 'byok' | 'hosted' = 'hosted';

    const requiredProviders = skill.requiredProviders ?? [];

    if (requiredProviders.length > 0) {
      const resolution = await this.byokProviderFactoryService.resolveProvider(
        context.organizationId,
        requiredProviders[0],
      );
      source = resolution.source;
    }

    try {
      const draft = await handler.execute(context, params);
      const duration = Date.now() - startedAt;

      await this.contentRunsService.patchRun(
        context.organizationId,
        String(run._id),
        {
          duration,
          output: draft,
          variants: this.buildRunVariants(draft),
          source:
            source === 'byok' ? ContentRunSource.BYOK : ContentRunSource.HOSTED,
          status: ContentRunStatus.COMPLETED,
        },
      );

      return {
        creditsUsed: 0,
        draft,
        duration,
        source,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startedAt;

      await this.contentRunsService.patchRun(
        context.organizationId,
        String(run._id),
        {
          duration,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown skill execution error',
          source:
            source === 'byok' ? ContentRunSource.BYOK : ContentRunSource.HOSTED,
          status: ContentRunStatus.FAILED,
        },
      );

      throw error;
    }
  }

  async executeSkill(
    context: GatewayExecutionContext,
    skillSlug: string,
    params?: Record<string, unknown>,
  ): Promise<GatewayExecutionResult> {
    const executionContext: SkillExecutionContext = {
      brandId: context.brandId,
      brandVoice: '',
      memory: undefined,
      organizationId: context.organizationId,
      platforms: [],
    };

    const run = await this.contentRunsService.createRun({
      brand: context.brandId,
      brief: this.buildRunBrief(params ?? {}),
      creditsUsed: 0,
      input: params ?? {},
      organization: context.organizationId,
      publish: this.buildRunPublishContext(params ?? {}),
      skillSlug,
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
    });

    const runId = String(run._id);

    const handler = this.handlers[skillSlug];

    if (!handler) {
      await this.contentRunsService.patchRun(context.organizationId, runId, {
        error: `No handler registered for skill: ${skillSlug}`,
        status: ContentRunStatus.FAILED,
      });
      throw new NotFoundException(
        `No handler registered for skill: ${skillSlug}`,
      );
    }

    await this.contentRunsService.patchRun(context.organizationId, runId, {
      status: ContentRunStatus.RUNNING,
    });

    try {
      const draft = await handler.execute(executionContext, params ?? {});

      await this.contentRunsService.patchRun(context.organizationId, runId, {
        output: draft,
        status: ContentRunStatus.COMPLETED,
        variants: this.buildRunVariants(draft),
      });

      return {
        drafts: [
          {
            confidence: draft.confidence,
            content: draft.content,
            mediaUrls: draft.mediaUrls,
            platforms: draft.platforms,
            type: draft.type,
          },
        ],
        runId,
      };
    } catch (error: unknown) {
      await this.contentRunsService.patchRun(context.organizationId, runId, {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown skill execution error',
        status: ContentRunStatus.FAILED,
      });

      throw error;
    }
  }

  private buildRunBrief(
    params: Record<string, unknown>,
  ): ContentRunBrief | undefined {
    const brief: ContentRunBrief = {
      angle: this.getString(params.angle),
      audience: this.getString(params.audience),
      callToAction: this.getString(params.callToAction),
      evidence: this.getStringArray(params.evidence),
      hypothesis: this.getString(params.hypothesis),
      notes: this.getString(params.notes),
    };

    return Object.values(brief).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    )
      ? brief
      : undefined;
  }

  private buildRunPublishContext(
    params: Record<string, unknown>,
  ): ContentRunPublishContext | undefined {
    const scheduledFor = this.getDate(params.scheduledFor);
    const publishedAt = this.getDate(params.publishedAt);
    const postIds = this.getStringArray(params.postIds);
    const metadata =
      this.getRecord(params.publishMetadata) ?? this.getRecord(params.publish);

    const publish: ContentRunPublishContext = {
      channel: this.getString(params.channel),
      experimentId: this.getString(params.experimentId),
      metadata: metadata ?? {},
      platform: this.getString(params.platform),
      postIds,
      publishedAt,
      scheduledFor,
      variantId: this.getString(params.variantId),
    };

    return publish.channel ||
      publish.experimentId ||
      publish.platform ||
      publish.variantId ||
      publish.postIds?.length ||
      publish.publishedAt ||
      publish.scheduledFor ||
      Object.keys(publish.metadata).length > 0
      ? publish
      : undefined;
  }

  private buildRunVariants(
    draft: SkillExecutionResult['draft'],
  ): ContentRunVariant[] {
    const platforms =
      draft.platforms.length > 0 ? draft.platforms : ['unspecified'];
    const assetIds = this.getStringArray(draft.metadata.assetIds);

    return platforms.map((platform, index) => ({
      assetIds,
      content: draft.content,
      id: `${draft.skillSlug}-${index + 1}`,
      metadata: draft.metadata,
      platform,
      status: 'generated',
      type: draft.type,
    }));
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private getStringArray(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      const items = value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      );

      return items.length > 0 ? items : undefined;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }

    return undefined;
  }

  private getRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private getDate(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
  }
}

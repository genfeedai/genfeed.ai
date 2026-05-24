import type { CreateContentRunBriefDto } from '@api/collections/content-runs/dto/create-content-run-brief.dto';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import type {
  ContentRunBrief,
  ContentRunPublishContext,
  ContentRunVariant,
  CreateContentRunInput,
  UpdateContentRunInput,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentRunsService {
  constructor(private readonly prisma: PrismaService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hydrateRun(
    run: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!run) {
      return null;
    }

    const config = this.isRecord(run.config) ? run.config : {};
    const brand = run.brandId ?? config.brand;
    const organization = run.organizationId ?? config.organization;

    return {
      ...run,
      ...config,
      _id: run.id,
      brand,
      organization,
      status: run.status ?? config.status,
    };
  }

  private hydrateRuns(
    runs: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return runs.flatMap((run) => {
      const hydrated = this.hydrateRun(run);
      return hydrated ? [hydrated] : [];
    });
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private uniqueStrings(values: (string | undefined)[]): string[] {
    return [
      ...new Set(
        values
          .map((value) => this.getString(value))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
  }

  private buildBriefEvidence(input: CreateContentRunBriefDto): string[] {
    return this.uniqueStrings([
      ...(input.evidence ?? []),
      input.title,
      input.text,
      input.authorHandle ? `Creator: @${input.authorHandle}` : undefined,
      input.sourceUrl ? `Source: ${input.sourceUrl}` : undefined,
      input.matchedTrends?.length
        ? `Matched trends: ${input.matchedTrends.join(', ')}`
        : undefined,
    ]);
  }

  private buildBriefHypothesis(input: CreateContentRunBriefDto): string {
    const explicitHypothesis = this.getString(input.hypothesis);
    if (explicitHypothesis) {
      return explicitHypothesis;
    }

    const source =
      this.getString(input.title ?? input.text ?? input.trendTopic) ??
      input.trendTopic;
    return `Remix "${source}" into a brand-fit ${input.platform} execution.`;
  }

  private buildResearchBrief(input: CreateContentRunBriefDto): ContentRunBrief {
    return {
      angle: this.getString(input.angle ?? input.title ?? input.trendTopic),
      audience: this.getString(input.audience),
      callToAction: this.getString(input.callToAction),
      channelFit:
        this.getString(input.channelFit) ??
        `${input.platform} source with trend fit for ${input.trendTopic}`,
      confidence: input.confidence,
      evidence: this.buildBriefEvidence(input),
      hypothesis: this.buildBriefHypothesis(input),
      risk: this.getString(input.risk),
      sourceId: this.getString(
        input.sourceReferenceId ?? input.sourceContentId ?? input.trendId,
      ),
      sourceUrl: this.getString(input.sourceUrl),
    };
  }

  private buildResearchPublishContext(
    input: CreateContentRunBriefDto,
  ): ContentRunPublishContext {
    return {
      metadata: {
        authorHandle: input.authorHandle,
        contentType: input.contentType,
        metrics: input.metrics,
        sourceContentId: input.sourceContentId,
        sourceReferenceId: input.sourceReferenceId,
        sourceUrl: input.sourceUrl,
        trendId: input.trendId,
        trendTopic: input.trendTopic,
      },
      platform: input.platform,
    };
  }

  private buildRemixPackVariants(
    run: Record<string, unknown>,
  ): ContentRunVariant[] {
    const brief = this.isRecord(run.brief)
      ? (run.brief as unknown as ContentRunBrief)
      : {};
    const publish = this.isRecord(run.publish)
      ? (run.publish as unknown as ContentRunPublishContext)
      : undefined;
    const platform =
      this.getString(publish?.platform) ??
      this.getString(
        (run.input as Record<string, unknown> | undefined)?.platform,
      ) ??
      'multi-platform';
    const hypothesis =
      brief.hypothesis ??
      brief.angle ??
      'Turn this brief into format-specific content variants.';

    return [
      {
        angle: brief.angle,
        content: hypothesis,
        format: 'post-thread',
        hypothesis,
        id: 'post-thread',
        metadata: { source: 'remix-pack' },
        platform,
        status: 'draft',
        type: 'text',
      },
      {
        angle: brief.angle,
        content: `Visual creative brief: ${hypothesis}`,
        format: 'social-image',
        hypothesis,
        id: 'social-image',
        metadata: { source: 'remix-pack' },
        platform,
        status: 'draft',
        type: 'image',
      },
      {
        angle: brief.angle,
        content: `Short-form video script: ${hypothesis}`,
        format: 'short-form-video-script',
        hypothesis,
        id: 'short-form-video-script',
        metadata: { source: 'remix-pack' },
        platform,
        status: 'draft',
        type: 'video-script',
      },
      {
        angle: brief.angle,
        content: `Article/newsletter angle: ${hypothesis}`,
        format: 'article-newsletter',
        hypothesis,
        id: 'article-newsletter',
        metadata: { source: 'remix-pack' },
        platform,
        status: 'draft',
        type: 'long-form',
      },
      {
        angle: brief.angle,
        content: `Follow-up/reply derivative: ${hypothesis}`,
        format: 'follow-up-reply',
        hypothesis,
        id: 'follow-up-reply',
        metadata: { source: 'remix-pack' },
        platform,
        status: 'draft',
        type: 'reply',
      },
    ];
  }

  async createRun(
    payload: CreateContentRunInput,
  ): Promise<Record<string, unknown>> {
    const { brand, organization, status, ...config } = payload;

    const run = await this.prisma.contentRun.create({
      data: {
        brandId: brand,
        config: this.toJsonValue(config),
        isDeleted: false,
        organizationId: organization,
        status,
      },
    });

    return this.hydrateRun(run as unknown as Record<string, unknown>) ?? run;
  }

  async createBriefRun(
    organizationId: string,
    brandId: string,
    input: CreateContentRunBriefDto,
  ): Promise<Record<string, unknown>> {
    return this.createRun({
      brand: brandId,
      brief: this.buildResearchBrief(input),
      creditsUsed: 0,
      input: {
        ...input,
        handoffType: 'research-to-brief',
      },
      organization: organizationId,
      publish: this.buildResearchPublishContext(input),
      skillSlug: 'trend-remix',
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
    });
  }

  async patchRun(
    organizationId: string,
    runId: string,
    patch: UpdateContentRunInput,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.contentRun.findFirst({
      where: { id: runId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentRun', runId);
    }

    const updated = await this.prisma.contentRun.update({
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        config: this.toJsonValue({
          ...(existing.config &&
          typeof existing.config === 'object' &&
          !Array.isArray(existing.config)
            ? existing.config
            : {}),
          ...patch,
        }),
      },
      where: { id: runId },
    });

    return (
      this.hydrateRun(updated as unknown as Record<string, unknown>) ?? updated
    );
  }

  async createRemixPack(
    organizationId: string,
    runId: string,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.contentRun.findFirst({
      where: { id: runId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentRun', runId);
    }

    const hydrated =
      this.hydrateRun(existing as unknown as Record<string, unknown>) ??
      existing;
    const currentConfig = this.isRecord(existing.config) ? existing.config : {};
    const existingVariants = Array.isArray(hydrated.variants)
      ? (hydrated.variants as ContentRunVariant[])
      : [];
    const existingIds = new Set(existingVariants.map((variant) => variant.id));
    const generatedVariants = this.buildRemixPackVariants(hydrated).filter(
      (variant) => !existingIds.has(variant.id),
    );
    const variants = [...existingVariants, ...generatedVariants];

    const updated = await this.prisma.contentRun.update({
      data: {
        config: this.toJsonValue({
          ...currentConfig,
          variants,
        }),
      },
      where: { id: runId },
    });

    return (
      this.hydrateRun(updated as unknown as Record<string, unknown>) ?? updated
    );
  }

  async listByBrand(
    organizationId: string,
    brandId: string,
    skillSlug?: string,
    status?: ContentRunStatus,
  ): Promise<Record<string, unknown>[]> {
    const runs = await this.prisma.contentRun.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        ...(status ? { status } : {}),
      },
    });

    const hydratedRuns = this.hydrateRuns(
      runs as unknown as Record<string, unknown>[],
    );

    if (!skillSlug) {
      return hydratedRuns;
    }

    return hydratedRuns.filter((run) => run.skillSlug === skillSlug);
  }

  async getRunById(
    organizationId: string,
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const run = await this.prisma.contentRun.findFirst({
      where: {
        id: runId,
        isDeleted: false,
        organizationId,
      },
    });

    return this.hydrateRun(run as unknown as Record<string, unknown> | null);
  }
}

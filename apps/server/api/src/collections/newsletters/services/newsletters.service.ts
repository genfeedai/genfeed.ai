import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildBrandVoiceSummary } from '@api/collections/brands/utils/brand-context.util';
import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { GenerateNewsletterDraftDto } from '@api/collections/newsletters/dto/generate-newsletter-draft.dto';
import { GenerateNewsletterTopicsDto } from '@api/collections/newsletters/dto/generate-newsletter-topics.dto';
import { UpdateNewsletterDto } from '@api/collections/newsletters/dto/update-newsletter.dto';
import type { NewsletterDocument } from '@api/collections/newsletters/schemas/newsletter.schema';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentArtifactReferenceService, scopedWhere } from '@api/index';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { LLM_DEFAULTS } from '@genfeedai/constants';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

type TenantContext = {
  organizationId: string;
  brandId: string;
  userId: string;
};

type TopicProposal = {
  title: string;
  angle: string;
  reason: string;
};

type NewsletterContextSnapshot = {
  content: string | null;
  id: string;
  label: string;
  summary: string | null;
  topic: string | null;
};

type NewsletterTopicContext = {
  brandVoice: ReturnType<typeof buildBrandVoiceSummary>;
  count: number;
  ctx: TenantContext;
  dto: GenerateNewsletterTopicsDto;
  recent: NewsletterContextSnapshot[];
};

type NewsletterDraftContext = {
  contextNewsletters: NewsletterContextSnapshot[];
  ctx: TenantContext;
  dto: GenerateNewsletterDraftDto;
  prompt: string;
};

type NewsletterGeneratedDraft = NewsletterDraftContext & {
  generatedContent: string;
};

export const NEWSLETTER_DRAFT_ACTION_ID = 'newsletter.generate-draft';
export const NEWSLETTER_TOPICS_ACTION_ID = 'newsletter.generate-topics';
const NEWSLETTER_LOAD_DRAFT_ACTION_ID = 'newsletter.load-draft-context';
const NEWSLETTER_LOAD_TOPICS_ACTION_ID = 'newsletter.load-topic-context';
const NEWSLETTER_PERSIST_DRAFT_ACTION_ID = 'newsletter.persist-draft';
const NEWSLETTER_DRAFT_WORKFLOW_ID = 'newsletter.draft-generation';
const NEWSLETTER_TOPICS_WORKFLOW_ID = 'newsletter.topic-generation';

function newsletterTopicsWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: NEWSLETTER_TOPICS_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-generate',
          source: 'load-context',
          target: 'generate-topics',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'brandId', label: 'Brand', required: true, type: 'string' },
        {
          key: 'dto',
          label: 'Newsletter request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: NEWSLETTER_LOAD_TOPICS_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['brandId', 'dto'],
        }),
        createGenfeedActionNode({
          actionId: NEWSLETTER_TOPICS_ACTION_ID,
          id: 'generate-topics',
        }),
      ],
    },
    description: 'Loads brand continuity and generates newsletter topics.',
    label: 'Newsletter Topic Generation',
    resultNodeId: 'generate-topics',
    version: 1,
  };
}

function newsletterDraftWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: NEWSLETTER_DRAFT_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-generate',
          source: 'load-context',
          target: 'generate-draft',
          targetHandle: 'state',
        },
        {
          id: 'generate-persist',
          source: 'generate-draft',
          target: 'persist-draft',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'brandId', label: 'Brand', required: true, type: 'string' },
        {
          key: 'dto',
          label: 'Newsletter request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: NEWSLETTER_LOAD_DRAFT_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['brandId', 'dto'],
        }),
        createGenfeedActionNode({
          actionId: NEWSLETTER_DRAFT_ACTION_ID,
          id: 'generate-draft',
        }),
        createGenfeedActionNode({
          actionId: NEWSLETTER_PERSIST_DRAFT_ACTION_ID,
          id: 'persist-draft',
        }),
      ],
    },
    description:
      'Loads context, generates markdown, and persists a newsletter draft.',
    label: 'Newsletter Draft Generation',
    resultNodeId: 'persist-draft',
    version: 1,
  };
}

@Injectable()
export class NewslettersService
  extends BaseService<
    NewsletterDocument,
    CreateNewsletterDto,
    UpdateNewsletterDto,
    Prisma.NewsletterWhereInput
  >
  implements OnModuleInit
{
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly brandsService: BrandsService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    super(prisma, 'newsletter', logger);
  }

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction(
      NEWSLETTER_LOAD_TOPICS_ACTION_ID,
      ({ context, input }) =>
        this.loadTopicGenerationContext(
          this.readTopicsDto(input.dto),
          this.readTenantContext(input, context),
        ),
    );
    runner.registerAction(NEWSLETTER_TOPICS_ACTION_ID, ({ input }) =>
      this.generateTopicProposalsAction(input.state as NewsletterTopicContext),
    );
    runner.registerAction(
      NEWSLETTER_LOAD_DRAFT_ACTION_ID,
      ({ context, input }) =>
        this.loadDraftGenerationContext(
          this.readDraftDto(input.dto),
          this.readTenantContext(input, context),
        ),
    );
    runner.registerAction(NEWSLETTER_DRAFT_ACTION_ID, ({ input }) =>
      this.generateDraftAction(input.state as NewsletterDraftContext),
    );
    runner.registerAction(NEWSLETTER_PERSIST_DRAFT_ACTION_ID, ({ input }) =>
      this.persistDraftAction(input.state as NewsletterGeneratedDraft),
    );
    runner.registerWorkflow(newsletterTopicsWorkflow());
    runner.registerWorkflow(newsletterDraftWorkflow());
  }

  buildListQuery(
    ctx: TenantContext,
    query: {
      isDeleted?: boolean;
      search?: string;
      sort?: string;
      status?: string[];
    },
  ): {
    where: Record<string, unknown>;
    orderBy: Record<string, 'asc' | 'desc'>[];
  } {
    const where: Record<string, unknown> = {
      brandId: ctx.brandId,
      isDeleted: query.isDeleted ?? false,
      organizationId: ctx.organizationId,
    };

    if (query.status?.length) {
      where.status = { in: query.status };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { label: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    return { where, orderBy: this.parseSortPrisma(query.sort) };
  }

  async findOneScoped(
    id: string,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    // Org + id only — same contract as posts/articles findOne. The Publish
    // desk lists by the URL brand (`useBrand()`), but JWT `user.brandId` is
    // often a different brand in the same org. Requiring the JWT brand here
    // made listed newsletters open as "Content not found".
    const data = await this.delegate.findFirst({
      where: scopedWhere(ctx.organizationId, { id }),
    });

    if (!data) {
      throw new NotFoundException('Newsletter', id);
    }

    return data as unknown as NewsletterDocument;
  }

  async findAllScoped(
    ctx: TenantContext,
    query: {
      isDeleted?: boolean;
      search?: string;
      sort?: string;
      status?: string[];
    },
    pagination: { page?: number; limit?: number; pagination?: boolean },
  ): Promise<AggregatePaginateResult<NewsletterDocument>> {
    const { where, orderBy } = this.buildListQuery(ctx, query);
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;
    const isPaginated = pagination.pagination !== false;

    if (!isPaginated) {
      const docs = (await this.delegate.findMany({
        where,
        orderBy,
      })) as unknown as NewsletterDocument[];
      return {
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: docs.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: docs.length,
        totalPages: 1,
      };
    }

    const [docs, totalDocs] = await Promise.all([
      this.delegate.findMany({ where, orderBy, skip, take: limit }),
      this.delegate.count({ where }),
    ]);

    const totalPages = Math.ceil(totalDocs / limit);
    return {
      docs: docs as unknown as NewsletterDocument[],
      hasNextPage: page * limit < totalDocs,
      hasPrevPage: page > 1,
      limit,
      nextPage: page * limit < totalDocs ? page + 1 : null,
      page,
      pagingCounter: (page - 1) * limit + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  async createScoped(
    dto: CreateNewsletterDto,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    this.assertContext(ctx);

    return await this.create(
      {
        ...dto,
        brandId: ctx.brandId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      } as CreateNewsletterDto,
      ['organization', 'brand', 'user'],
    );
  }

  async updateScoped(
    id: string,
    dto: UpdateNewsletterDto,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    await this.findOneScoped(id, ctx);

    return await this.patch(id, dto, ['organization', 'brand', 'user']);
  }

  async approveScoped(
    id: string,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    await this.findOneScoped(id, ctx);
    const versionPin = await this.createVersionPin(id, ctx);

    return await this.patch(
      id,
      {
        approvedAt: new Date(),
        approvedByUserId: ctx.userId,
        approvedVersionPinId: versionPin.id,
        status: 'approved',
      },
      ['organization', 'brand', 'user'],
    );
  }

  async publishScoped(
    id: string,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    const newsletter = await this.findOneScoped(id, ctx);

    if (!newsletter.content?.trim()) {
      throw new BadRequestException(
        'Newsletter must have content before it can be published',
      );
    }

    const existingVersionPinId = (
      newsletter as unknown as { approvedVersionPinId?: string | null }
    ).approvedVersionPinId;
    let approvedVersionPinId: string;
    if (existingVersionPinId) {
      const resolved =
        await this.agentArtifactReferenceService.assertVersionPinCurrent({
          pinId: existingVersionPinId,
          readContext: {
            brandId: ctx.brandId,
            organizationId: ctx.organizationId,
          },
        });
      if (
        resolved.reference.kind !== 'newsletter' ||
        resolved.reference.recordId !== id
      ) {
        throw new ConflictException(
          'The approved version pin does not target this newsletter.',
        );
      }
      approvedVersionPinId = existingVersionPinId;
    } else {
      approvedVersionPinId = (await this.createVersionPin(id, ctx)).id;
    }

    return await this.patch(
      id,
      {
        approvedAt: newsletter.approvedAt ?? new Date(),
        approvedByUserId: newsletter.approvedByUserId ?? ctx.userId,
        approvedVersionPinId,
        publishedAt: new Date(),
        publishedByUserId: ctx.userId,
        status: 'published',
      },
      ['organization', 'brand', 'user'],
    );
  }

  private createVersionPin(id: string, ctx: TenantContext) {
    return this.agentArtifactReferenceService.createOrReuseVersionPin({
      createdByUserId: ctx.userId,
      reference: {
        brandId: ctx.brandId,
        kind: 'newsletter',
        organizationId: ctx.organizationId,
        recordId: id,
        serializer: 'newsletter',
      },
    });
  }

  async getContextPreview(
    id: string,
    ctx: TenantContext,
  ): Promise<Record<string, unknown>> {
    const newsletter = await this.findOneScoped(id, ctx);
    const brand = await this.getBrandContext(ctx);
    const recentNewsletters = await this.getRecentPublishedNewsletters(ctx);
    const selectedContextIds = (newsletter.contextNewsletterIds ?? []).map(
      (item) => item.toString(),
    );
    const selectedContext = selectedContextIds.length
      ? await this.findContextNewsletters(selectedContextIds, ctx)
      : [];

    return {
      brandVoice: buildBrandVoiceSummary(brand),
      contextSources: [],
      recentNewsletters: recentNewsletters.map((item) => ({
        id: item.id.toString(),
        label: item.label,
        publishedAt: item.publishedAt,
        status: item.status,
        summary: item.summary ?? '',
        topic: item.topic,
      })),
      selectedContext: selectedContext.map((item) => ({
        id: item.id.toString(),
        label: item.label,
        publishedAt: item.publishedAt,
        status: item.status,
        summary: item.summary ?? '',
        topic: item.topic,
      })),
      selectedContextIds,
      sourceRefs:
        newsletter.sourceRefs?.map((source) => ({
          label: source.label,
          note: source.note ?? '',
          sourceType: source.sourceType,
          url: source.url ?? null,
        })) ?? [],
      status: newsletter.status,
      summary: newsletter.summary ?? '',
      topic: newsletter.topic,
      updatedAt: newsletter.updatedAt,
    };
  }

  async generateTopicProposals(
    dto: GenerateNewsletterTopicsDto,
    ctx: TenantContext,
  ): Promise<TopicProposal[]> {
    const request = this.projectTopicsDto(dto);
    const { result } = await this.requireWorkflowRunner().runWorkflow<
      TopicProposal[]
    >({
      actionType: NEWSLETTER_TOPICS_ACTION_ID,
      canonicalId: NEWSLETTER_TOPICS_WORKFLOW_ID,
      inputValues: { brandId: ctx.brandId, dto: request },
      metadata: { brandId: ctx.brandId, origin: 'api' },
      organizationId: ctx.organizationId,
      source: 'NewslettersService.generateTopicProposals',
      trigger: WorkflowExecutionTrigger.API,
      userId: ctx.userId,
    });
    return result;
  }

  private async loadTopicGenerationContext(
    dto: GenerateNewsletterTopicsDto,
    ctx: TenantContext,
  ): Promise<NewsletterTopicContext> {
    this.assertContext(ctx);
    const request = this.projectTopicsDto(dto);
    const count = request.count ?? 5;
    const brand = await this.getBrandContext(ctx);
    const recent = (await this.getRecentPublishedNewsletters(ctx)).map(
      (newsletter) => this.projectNewsletterContext(newsletter),
    );
    return {
      brandVoice: buildBrandVoiceSummary(brand),
      count,
      ctx,
      dto: request,
      recent,
    };
  }

  private async generateTopicProposalsAction(
    state: NewsletterTopicContext,
  ): Promise<TopicProposal[]> {
    const { brandVoice, count, dto, recent } = state;
    const prompt = [
      'Create newsletter topic proposals for a single brand.',
      'Return valid JSON only as an array.',
      `Proposal count: ${count}.`,
      dto.instructions ? `Additional instructions: ${dto.instructions}` : '',
      brandVoice ? `Brand voice: ${JSON.stringify(brandVoice)}` : '',
      recent.length
        ? `Recent newsletters to avoid repeating:\n${recent
            .map((item) => `- ${item.topic}: ${item.summary ?? item.label}`)
            .join('\n')}`
        : '',
      'Each array item must contain: title, angle, reason.',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const completion = await this.openRouterService.chatCompletion({
        max_tokens: TEXT_GENERATION_LIMITS.newsletterTopicProposal,
        messages: [
          {
            content:
              'You are an expert newsletter strategist. Suggest high-signal newsletter issues for a brand and avoid repetition.',
            role: 'system',
          },
          { content: prompt, role: 'user' },
        ],
        model: LLM_DEFAULTS.fastText,
        temperature: 0.5,
      });

      const raw = completion.choices?.[0]?.message?.content ?? '[]';
      const parsed = this.parseJsonArray<TopicProposal>(raw);
      return parsed.slice(0, count);
    } catch {
      return this.buildFallbackTopics(count, recent);
    }
  }

  async generateDraft(
    dto: GenerateNewsletterDraftDto,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    const request = this.projectDraftDto(dto);
    const { result } = await this.requireWorkflowRunner().runWorkflow<{
      newsletterId: string;
    }>({
      actionType: NEWSLETTER_DRAFT_ACTION_ID,
      canonicalId: NEWSLETTER_DRAFT_WORKFLOW_ID,
      inputValues: { brandId: ctx.brandId, dto: request },
      metadata: { brandId: ctx.brandId, origin: 'api' },
      organizationId: ctx.organizationId,
      source: 'NewslettersService.generateDraft',
      trigger: WorkflowExecutionTrigger.API,
      userId: ctx.userId,
    });
    return this.findOneScoped(result.newsletterId, ctx);
  }

  private async loadDraftGenerationContext(
    dto: GenerateNewsletterDraftDto,
    ctx: TenantContext,
  ): Promise<NewsletterDraftContext> {
    this.assertContext(ctx);
    const request = this.projectDraftDto(dto);
    const brand = await this.getBrandContext(ctx);
    const contextNewsletterDocuments = request.contextNewsletterIds?.length
      ? await this.findContextNewsletters(
          request.contextNewsletterIds as string[],
          ctx,
        )
      : await this.getRecentPublishedNewsletters(ctx, 5);
    const contextNewsletters = contextNewsletterDocuments.map((newsletter) =>
      this.projectNewsletterContext(newsletter),
    );

    const prompt = this.buildDraftPrompt(
      request,
      buildBrandVoiceSummary(brand),
      contextNewsletters,
    );
    return { contextNewsletters, ctx, dto: request, prompt };
  }

  private async generateDraftAction(
    state: NewsletterDraftContext,
  ): Promise<NewsletterGeneratedDraft> {
    const { dto, prompt } = state;
    const sourceRefs = dto.sourceRefs ?? [];
    let generatedContent = '';
    try {
      const completion = await this.openRouterService.chatCompletion({
        max_tokens: TEXT_GENERATION_LIMITS.newsletterDraft,
        messages: [
          {
            content:
              'You are a senior newsletter editor. Write clear, factual, engaging newsletters in markdown. Preserve continuity without copying prior issues.',
            role: 'system',
          },
          { content: prompt, role: 'user' },
        ],
        model: LLM_DEFAULTS.fastText,
        temperature: 0.55,
      });
      generatedContent =
        completion.choices?.[0]?.message?.content?.trim() ??
        this.buildFallbackDraft(dto.topic, dto.angle, sourceRefs);
    } catch {
      generatedContent = this.buildFallbackDraft(
        dto.topic,
        dto.angle,
        sourceRefs,
      );
    }

    return { ...state, generatedContent };
  }

  private async persistDraftAction(
    state: NewsletterGeneratedDraft,
  ): Promise<{ newsletterId: string }> {
    const { contextNewsletters, ctx, dto, generatedContent, prompt } = state;
    const sourceRefs = dto.sourceRefs ?? [];
    const label = this.resolveDraftTitle(dto.topic, generatedContent);
    const summary = this.extractSummary(generatedContent);
    const payload: UpdateNewsletterDto = {
      angle: dto.angle,
      content: generatedContent,
      contextNewsletterIds: contextNewsletters.map((item) => item.id),
      generationPrompt: prompt,
      label,
      sourceRefs,
      status: 'ready_for_review',
      summary,
      topic: dto.topic,
    };

    if (dto.newsletterId) {
      const newsletter = await this.updateScoped(
        dto.newsletterId.toString(),
        payload,
        ctx,
      );
      return { newsletterId: newsletter.id.toString() };
    }

    const newsletter = await this.createScoped(
      payload as CreateNewsletterDto,
      ctx,
    );
    return { newsletterId: newsletter.id.toString() };
  }

  private readTopicsDto(value: unknown): GenerateNewsletterTopicsDto {
    return this.readRecord(value) as unknown as GenerateNewsletterTopicsDto;
  }

  private readDraftDto(value: unknown): GenerateNewsletterDraftDto {
    return this.readRecord(value) as unknown as GenerateNewsletterDraftDto;
  }

  private readTenantContext(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): TenantContext {
    const brandId =
      typeof input.brandId === 'string' ? input.brandId.trim() : '';
    return {
      brandId,
      organizationId: context.organizationId,
      userId: context.userId,
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requireWorkflowRunner(): SystemWorkflowRunnerService {
    if (!this.moduleRef) {
      throw new Error('Workflow action runner is unavailable');
    }
    return this.moduleRef.get(SystemWorkflowRunnerService, { strict: false });
  }

  private assertContext(ctx: TenantContext): void {
    if (!ctx.organizationId || !ctx.brandId || !ctx.userId) {
      throw new BadRequestException(
        'Newsletter operations require organization, brand, and user context',
      );
    }
  }

  private parseSortPrisma(sort?: string): Record<string, 'asc' | 'desc'>[] {
    if (!sort?.trim()) {
      return [{ createdAt: 'desc' }];
    }

    return sort
      .split(',')
      .reduce<Record<string, 'asc' | 'desc'>[]>((acc, part) => {
        const [fieldRaw, orderRaw] = part.split(':');
        const field = fieldRaw?.trim();
        if (!field) {
          return acc;
        }
        acc.push({ [field]: orderRaw?.trim() === '1' ? 'asc' : 'desc' });
        return acc;
      }, []);
  }

  private async getBrandContext(ctx: TenantContext) {
    return await this.brandsService.findOne({
      id: ctx.brandId,
      organizationId: ctx.organizationId,
    });
  }

  private async getRecentPublishedNewsletters(
    ctx: TenantContext,
    limit = 5,
  ): Promise<NewsletterDocument[]> {
    const results = await this.delegate.findMany({
      where: scopedWhere(ctx.organizationId, {
        brandId: ctx.brandId,
        status: 'published',
      }),
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return results as unknown as NewsletterDocument[];
  }

  private async findContextNewsletters(
    ids: string[],
    ctx: TenantContext,
  ): Promise<NewsletterDocument[]> {
    const documents = await this.delegate.findMany({
      where: scopedWhere(ctx.organizationId, {
        id: { in: ids },
        brandId: ctx.brandId,
      }),
    });

    const docs = documents as unknown as NewsletterDocument[];
    return docs.sort(
      (left, right) =>
        ids.indexOf(left.id.toString()) - ids.indexOf(right.id.toString()),
    );
  }

  private projectNewsletterContext(
    newsletter: NewsletterDocument,
  ): NewsletterContextSnapshot {
    return {
      content: newsletter.content ?? null,
      id: newsletter.id.toString(),
      label: newsletter.label,
      summary: newsletter.summary ?? null,
      topic: newsletter.topic ?? null,
    };
  }

  private projectTopicsDto(
    dto: GenerateNewsletterTopicsDto,
  ): GenerateNewsletterTopicsDto {
    return {
      ...(dto.count === undefined ? {} : { count: dto.count }),
      ...(dto.instructions === undefined
        ? {}
        : { instructions: dto.instructions }),
    };
  }

  private projectDraftDto(
    dto: GenerateNewsletterDraftDto,
  ): GenerateNewsletterDraftDto {
    return {
      ...(dto.angle === undefined ? {} : { angle: dto.angle }),
      ...(dto.contextNewsletterIds === undefined
        ? {}
        : { contextNewsletterIds: [...dto.contextNewsletterIds] }),
      ...(dto.instructions === undefined
        ? {}
        : { instructions: dto.instructions }),
      ...(dto.newsletterId === undefined
        ? {}
        : { newsletterId: dto.newsletterId }),
      ...(dto.sourceRefs === undefined
        ? {}
        : {
            sourceRefs: dto.sourceRefs.map((source) => ({
              label: source.label,
              ...(source.note === undefined ? {} : { note: source.note }),
              sourceType: source.sourceType,
              ...(source.url === undefined ? {} : { url: source.url }),
            })),
          }),
      topic: dto.topic,
    };
  }

  private buildDraftPrompt(
    dto: GenerateNewsletterDraftDto,
    brandVoice: ReturnType<typeof buildBrandVoiceSummary>,
    contextNewsletters: NewsletterContextSnapshot[],
  ): string {
    const sourceRefs = dto.sourceRefs ?? [];
    return [
      `Topic: ${dto.topic}`,
      dto.angle ? `Angle: ${dto.angle}` : '',
      dto.instructions ? `Instructions: ${dto.instructions}` : '',
      brandVoice ? `Brand voice: ${JSON.stringify(brandVoice)}` : '',
      contextNewsletters.length
        ? `Recent newsletter context:\n${contextNewsletters
            .map(
              (item, index) =>
                `Issue ${index + 1} - ${item.label}\nTopic: ${item.topic ?? ''}\nSummary: ${item.summary ?? ''}\nContent excerpt: ${(item.content ?? '').slice(0, 800)}`,
            )
            .join('\n\n')}`
        : '',
      sourceRefs.length
        ? `Current source references:\n${sourceRefs
            .map(
              (source) =>
                `- [${source.sourceType}] ${source.label}${source.url ? ` (${source.url})` : ''}${source.note ? `: ${source.note}` : ''}`,
            )
            .join('\n')}`
        : '',
      'Output markdown with a strong title, short intro, 3 to 5 sections, and a closing CTA.',
      'Avoid repeating the same framing from recent newsletters.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildFallbackTopics(
    count: number,
    recent: NewsletterContextSnapshot[],
  ): TopicProposal[] {
    const excludedTopics = new Set(
      recent.flatMap((item) => (item.topic ? [item.topic.toLowerCase()] : [])),
    );
    const defaults: TopicProposal[] = [
      {
        angle: 'What changed this week and why it matters now',
        reason: 'Keeps readers current with timely product and market shifts.',
        title: 'This Week’s Moves That Matter',
      },
      {
        angle: 'One actionable workflow readers can copy immediately',
        reason:
          'Turns the newsletter into a repeatable utility, not just an update.',
        title: 'A Workflow Worth Stealing',
      },
      {
        angle: 'Show one result, then unpack how it happened',
        reason: 'Grounds the issue in proof before explaining the process.',
        title: 'Behind a High-Signal Win',
      },
      {
        angle: 'Translate market noise into practical decisions',
        reason: 'Strong fit for recurring editorial continuity.',
        title: 'What To Ignore, What To Act On',
      },
      {
        angle: 'Curated resources with commentary from the brand lens',
        reason: 'Builds a recurring curation habit and reinforces voice.',
        title: 'Five Links, One Clear Take',
      },
    ];

    return defaults
      .filter((item) => !excludedTopics.has(item.title.toLowerCase()))
      .slice(0, count);
  }

  private parseJsonArray<T>(value: string): T[] {
    const match = value.match(/\[[\s\S]*\]/);
    const json = match?.[0] ?? value;
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }

  private buildFallbackDraft(
    topic: string,
    angle?: string,
    sourceRefs?: GenerateNewsletterDraftDto['sourceRefs'],
  ): string {
    const sources =
      sourceRefs
        ?.map((item) => `- ${item.label}${item.url ? ` (${item.url})` : ''}`)
        .join('\n') ?? '- No sources provided';
    return `# ${topic}\n\n${angle ? `${angle}\n\n` : ''}## Intro\nA concise update for this issue.\n\n## What changed\nSummarize the most important movement here.\n\n## Why it matters\nExplain the implication for the audience.\n\n## What to do next\nGive one practical next step.\n\n## Sources\n${sources}\n\n## CTA\nReply with the topic you want us to cover next.`;
  }

  private resolveDraftTitle(topic: string, draftContent: string): string {
    const firstLine = draftContent.split('\n')[0]?.replace(/^#\s*/, '').trim();
    return firstLine || topic;
  }

  private extractSummary(content: string): string {
    const paragraphs = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    return paragraphs[0]?.slice(0, 500) ?? '';
  }
}

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildBrandVoiceSummary } from '@api/collections/brands/utils/brand-context.util';
import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { GenerateNewsletterDraftDto } from '@api/collections/newsletters/dto/generate-newsletter-draft.dto';
import { GenerateNewsletterTopicsDto } from '@api/collections/newsletters/dto/generate-newsletter-topics.dto';
import { UpdateNewsletterDto } from '@api/collections/newsletters/dto/update-newsletter.dto';
import type { NewsletterDocument } from '@api/collections/newsletters/schemas/newsletter.schema';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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

@Injectable()
export class NewslettersService extends BaseService<
  NewsletterDocument,
  CreateNewsletterDto,
  UpdateNewsletterDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly brandsService: BrandsService,
  ) {
    super(prisma, 'newsletter', logger);
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
    const data = await this.delegate.findFirst({
      where: {
        id,
        brandId: ctx.brandId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      },
    });

    if (!data) {
      throw new NotFoundException(`Newsletter ${id} not found`);
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
        brand: ctx.brandId,
        organization: ctx.organizationId,
        user: ctx.userId,
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

    return await this.patch(
      id,
      {
        approvedAt: new Date(),
        approvedByUser: ctx.userId,
        status: 'approved',
      } as UpdateNewsletterDto,
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

    return await this.patch(
      id,
      {
        approvedAt: newsletter.approvedAt ?? new Date(),
        approvedByUser: newsletter.approvedByUser ?? ctx.userId,
        publishedAt: new Date(),
        publishedByUser: ctx.userId,
        status: 'published',
      } as UpdateNewsletterDto,
      ['organization', 'brand', 'user'],
    );
  }

  async archiveScoped(
    id: string,
    ctx: TenantContext,
  ): Promise<NewsletterDocument> {
    await this.findOneScoped(id, ctx);

    return await this.patch(id, { status: 'archived' } as UpdateNewsletterDto, [
      'organization',
      'brand',
      'user',
    ]);
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
        id: item._id.toString(),
        label: item.label,
        publishedAt: item.publishedAt,
        status: item.status,
        summary: item.summary ?? '',
        topic: item.topic,
      })),
      selectedContext: selectedContext.map((item) => ({
        id: item._id.toString(),
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
    this.assertContext(ctx);
    const count = dto.count ?? 5;
    const brand = await this.getBrandContext(ctx);
    const recent = await this.getRecentPublishedNewsletters(ctx);

    const prompt = [
      'Create newsletter topic proposals for a single brand.',
      'Return valid JSON only as an array.',
      `Proposal count: ${count}.`,
      dto.instructions ? `Additional instructions: ${dto.instructions}` : '',
      buildBrandVoiceSummary(brand)
        ? `Brand voice: ${JSON.stringify(buildBrandVoiceSummary(brand))}`
        : '',
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
        model: 'openai/gpt-4o-mini',
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
    this.assertContext(ctx);
    const brand = await this.getBrandContext(ctx);
    const contextNewsletters = dto.contextNewsletterIds?.length
      ? await this.findContextNewsletters(
          dto.contextNewsletterIds as string[],
          ctx,
        )
      : await this.getRecentPublishedNewsletters(ctx, 5);

    const sourceRefs = dto.sourceRefs ?? [];
    const prompt = this.buildDraftPrompt(dto, brand, contextNewsletters);

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
        model: 'openai/gpt-4o-mini',
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

    const label = this.resolveDraftTitle(dto.topic, generatedContent);
    const summary = this.extractSummary(generatedContent);
    const payload: UpdateNewsletterDto = {
      angle: dto.angle,
      content: generatedContent,
      contextNewsletterIds: contextNewsletters.map((item) => item._id),
      generationPrompt: prompt,
      label,
      sourceRefs,
      status: 'ready_for_review',
      summary,
      topic: dto.topic,
    };

    if (dto.newsletterId) {
      return await this.updateScoped(dto.newsletterId.toString(), payload, ctx);
    }

    return await this.createScoped(payload as CreateNewsletterDto, ctx);
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
      _id: ctx.brandId,
      isDeleted: false,
      organization: ctx.organizationId,
    });
  }

  private async getRecentPublishedNewsletters(
    ctx: TenantContext,
    limit = 5,
  ): Promise<NewsletterDocument[]> {
    const results = await this.delegate.findMany({
      where: {
        brandId: ctx.brandId,
        isDeleted: false,
        organizationId: ctx.organizationId,
        status: 'published',
      },
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
      where: {
        id: { in: ids },
        brandId: ctx.brandId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      },
    });

    const docs = documents as unknown as NewsletterDocument[];
    return docs.sort(
      (left, right) =>
        ids.findIndex((item) => item === left._id.toString()) -
        ids.findIndex((item) => item === right._id.toString()),
    );
  }

  private buildDraftPrompt(
    dto: GenerateNewsletterDraftDto,
    brand: Awaited<ReturnType<NewslettersService['getBrandContext']>>,
    contextNewsletters: NewsletterDocument[],
  ): string {
    const sourceRefs = dto.sourceRefs ?? [];
    return [
      `Topic: ${dto.topic}`,
      dto.angle ? `Angle: ${dto.angle}` : '',
      dto.instructions ? `Instructions: ${dto.instructions}` : '',
      buildBrandVoiceSummary(brand)
        ? `Brand voice: ${JSON.stringify(buildBrandVoiceSummary(brand))}`
        : '',
      contextNewsletters.length
        ? `Recent newsletter context:\n${contextNewsletters
            .map(
              (item, index) =>
                `Issue ${index + 1} - ${item.label}\nTopic: ${item.topic}\nSummary: ${item.summary ?? ''}\nContent excerpt: ${item.content.slice(0, 800)}`,
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
    recent: NewsletterDocument[],
  ): TopicProposal[] {
    const excludedTopics = new Set(
      recent.map((item) => item.topic.toLowerCase()),
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

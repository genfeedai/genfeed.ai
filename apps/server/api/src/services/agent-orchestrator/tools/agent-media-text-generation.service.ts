import type {
  ResolveGenerationBrandMembersServiceLike,
  ResolveGenerationBrandServiceLike,
} from '@api/collections/brands/utils/resolve-generation-brand.util';
import { resolveGenerationBrand } from '@api/collections/brands/utils/resolve-generation-brand.util';
import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerateNewsletterDraftDto } from '@api/collections/newsletters/dto/generate-newsletter-draft.dto';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import {
  type AiActionResult,
  AiActionsService,
} from '@api/endpoints/ai-actions/ai-actions.service';
import {
  AiActionType,
  type ExecuteAiActionDto,
} from '@api/endpoints/ai-actions/dto/ai-action.dto';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  isPlainMediaResponseRecord,
  readArticleResource,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  ActivitySource,
  ContentIntelligencePlatform,
  formatPlatformLabel,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  AgentToolResult,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import { Inject, Injectable } from '@nestjs/common';

const AI_ACTIONS: Readonly<Record<string, AiActionType>> = {
  'adapt-platform': AiActionType.ADAPT_PLATFORM,
  'add-hashtags': AiActionType.ADD_HASHTAGS,
  'analytics-insight': AiActionType.ANALYTICS_INSIGHT,
  'content-suggest': AiActionType.CONTENT_SUGGEST,
  enhance: AiActionType.ENHANCE_PROMPT,
  'enhance-prompt': AiActionType.ENHANCE_PROMPT,
  expand: AiActionType.EXPAND,
  'explain-metric': AiActionType.EXPLAIN_METRIC,
  'grammar-check': AiActionType.GRAMMAR_CHECK,
  hashtags: AiActionType.ADD_HASHTAGS,
  'hook-generator': AiActionType.HOOK_GENERATOR,
  rewrite: AiActionType.REWRITE,
  'seo-optimize': AiActionType.SEO_OPTIMIZE,
  shorten: AiActionType.SHORTEN,
  'suggest-keywords': AiActionType.SUGGEST_KEYWORDS,
  'tone-adjust': AiActionType.TONE_ADJUST,
  translate: AiActionType.ADAPT_PLATFORM,
};

function splitThreadSegments(content: string): string[] {
  const segments = content
    .split(/\n{2,}/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments : [content];
}

/**
 * The user's composer selection is authoritative for the turn: the model may
 * not swap it for sources or purposes of its own choosing. Without one, tool
 * parameters may name sources or purposes. Ids never widen scope: retrieval
 * still filters by the caller's organization and brand.
 */
export function resolveToolKnowledgeSelection(
  params: Record<string, unknown>,
  ctx: Pick<ToolExecutionContext, 'knowledgeSelection'>,
): KnowledgeSelection | undefined {
  if (hasKnowledgeSelection(ctx.knowledgeSelection)) {
    return ctx.knowledgeSelection;
  }
  const sourceIds = readStringList(params.knowledgeSourceIds);
  const purposes = readStringList(params.knowledgePurposes)?.filter(
    (purpose): purpose is KnowledgeSourcePurpose =>
      Object.values(KnowledgeSourcePurpose).includes(
        purpose as KnowledgeSourcePurpose,
      ),
  );
  if (sourceIds?.length || purposes?.length) {
    return {
      ...(sourceIds?.length ? { sourceIds } : {}),
      ...(purposes?.length ? { purposes } : {}),
    };
  }
  return ctx.knowledgeSelection;
}

function hasKnowledgeSelection(
  selection: KnowledgeSelection | undefined,
): selection is KnowledgeSelection {
  return Boolean(
    selection?.sourceIds?.length ||
      selection?.spaceIds?.length ||
      selection?.purposes?.length,
  );
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return items.length > 0 ? items : undefined;
}

/** Mirrors `MaxLength(500)` on `GenerateArticlesDto.prompt`. */
const ARTICLE_PROMPT_MAX_LENGTH = 500;
const MAX_VARIATIONS = 5;

/**
 * The tool speaks `topic` plus `targetAudience` and `length`; the article DTO
 * has only a free-text `prompt`. Fold the framing into it, as `create_article`
 * did, rather than inventing DTO fields.
 */
function buildArticlePrompt(params: Record<string, unknown>): string {
  const topic =
    readOptionalString(params.topic) ?? readOptionalString(params.prompt) ?? '';
  const audience = readOptionalString(params.targetAudience);
  const length = readOptionalString(params.length);
  const framing = [
    audience ? `Write it for this audience: ${audience}.` : undefined,
    length ? `Length: ${length}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  return (framing ? `${topic}\n\n${framing}` : topic).slice(
    0,
    ARTICLE_PROMPT_MAX_LENGTH,
  );
}

function readVariationsCount(
  value: unknown,
): { ok: true; count: number } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, count: 1 };
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_VARIATIONS
    ? { ok: true, count: value }
    : { ok: false };
}

/** Flat charge for one social or newsletter draft (catalog `generate_content`). */
const TEXT_GENERATION_CREDITS = 2;

const EMPTY_TEXT_GENERATION_RESULT: AgentToolResult = {
  creditsUsed: 0,
  error: 'Content generation returned no draft. No credits were charged.',
  success: false,
};

const INSUFFICIENT_TEXT_CREDITS_RESULT: AgentToolResult = {
  creditsUsed: 0,
  error: 'Not enough credits to generate content.',
  success: false,
};

@Injectable()
export class AgentMediaTextGenerationService {
  constructor(
    private readonly aiActionsService: AiActionsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly newslettersService: NewslettersService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: ResolveGenerationBrandServiceLike,
    @Inject('AGENT_MEMBERS_SERVICE')
    private readonly membersService: ResolveGenerationBrandMembersServiceLike,
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {}

  /**
   * Explicit brandId, then the thread brand, then the member's current brand
   * (#5219). Headless MCP calls carry no thread brand, so they rely on the
   * first and last steps.
   */
  private async resolveBrandId(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<string | undefined> {
    const brand = await resolveGenerationBrand({
      brandsService: this.brandsService,
      contextBrandId: ctx.brandId,
      explicitBrandId:
        typeof params.brandId === 'string' ? params.brandId : undefined,
      membersService: this.membersService,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    return brand?.id ? String(brand.id) : undefined;
  }

  /**
   * Text generation has no billing endpoint behind it, so the handler admits
   * and settles its own flat charge and marks the result billing-delegated.
   * That charges MCP calls (which skip the agent turn's settlement) and keeps
   * in-app turns from charging twice.
   */
  private async hasTextGenerationCredits(
    ctx: ToolExecutionContext,
  ): Promise<boolean> {
    return this.creditsUtilsService.checkOrganizationCreditsAvailable(
      ctx.organizationId,
      TEXT_GENERATION_CREDITS,
    );
  }

  private async chargeTextGeneration(
    ctx: ToolExecutionContext,
    brandId: string,
    description: string,
  ): Promise<void> {
    await this.creditsUtilsService.deductCreditsFromOrganization(
      ctx.organizationId,
      ctx.userId,
      TEXT_GENERATION_CREDITS,
      description,
      ActivitySource.SCRIPT,
      { brandId },
    );
  }

  async aiAction(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const requestedAction = String(params.action || '')
      .trim()
      .toLowerCase();
    const dto: ExecuteAiActionDto = {
      action: AI_ACTIONS[requestedAction] ?? AiActionType.ENHANCE_PROMPT,
      content:
        (params.text as string | undefined) ??
        (params.content as string | undefined) ??
        '',
      context: params.language
        ? { platform: params.language as string }
        : undefined,
    };
    const result: AiActionResult = await this.aiActionsService.execute(
      ctx.organizationId,
      dto,
    );

    return {
      creditsUsed: 1,
      data: { result: result.result, tokensUsed: result.tokensUsed },
      success: true,
    };
  }

  async generateContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const requestedType = String(
      params.type || params.contentType || '',
    ).trim();
    const normalizedType = requestedType.toLowerCase();

    if (normalizedType === 'newsletter') {
      return this.generateNewsletter(params, ctx);
    }
    if (
      normalizedType === 'article' ||
      normalizedType === 'x-article' ||
      params.longForm === true
    ) {
      return this.generateArticle(params, ctx, normalizedType);
    }
    const variations = readVariationsCount(params.variationsCount);
    if (!variations.ok) {
      return {
        creditsUsed: 0,
        error: `variationsCount must be an integer from 1 to ${MAX_VARIATIONS}`,
        success: false,
      };
    }
    return this.generateSocialContent(
      params,
      ctx,
      normalizedType,
      variations.count,
    );
  }

  private async generateNewsletter(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = await this.resolveBrandId(params, ctx);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'A brand is required to generate content.',
        success: false,
      };
    }
    if (!(await this.hasTextGenerationCredits(ctx))) {
      return INSUFFICIENT_TEXT_CREDITS_RESULT;
    }
    const dto: GenerateNewsletterDraftDto = {
      angle: readOptionalString(params.angle),
      instructions: readOptionalString(params.instructions),
      topic:
        readOptionalString(params.topic) ??
        readOptionalString(params.prompt) ??
        '',
    };
    const newsletter = await this.newslettersService.generateDraft(dto, {
      brandId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    const newsletterId = readOptionalString(newsletter.id);
    const content = readOptionalString(newsletter.content) ?? '';
    if (!content.trim()) {
      return EMPTY_TEXT_GENERATION_RESULT;
    }
    await this.chargeTextGeneration(
      ctx,
      brandId,
      'Agent tool: generate_content (newsletter)',
    );
    const subject =
      readOptionalString(newsletter.label) ??
      readOptionalString(newsletter.topic) ??
      'Newsletter draft';
    const preheader = readOptionalString(newsletter.summary);

    return {
      creditsUsed: TEXT_GENERATION_CREDITS,
      data: { content, newsletterId, preheader, subject },
      isBillingDelegated: true,
      nextActions: newsletterId
        ? [
            {
              contentFormat: 'newsletter',
              ctas: [
                {
                  href: `/edit/newsletter/${newsletterId}`,
                  label: 'Open newsletter',
                },
              ],
              description: 'Newsletter draft ready for review.',
              id: `newsletter-gen-${newsletterId}`,
              platform: 'newsletter',
              preheader,
              subject,
              textContent: content,
              title: subject,
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async generateArticle(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    normalizedType: string,
  ): Promise<AgentToolResult> {
    const articleType =
      normalizedType === 'x-article' ? 'x-article' : 'standard';
    const brandId = await this.resolveBrandId(params, ctx);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'A brand is required to generate an article.',
        success: false,
      };
    }
    const response = toMediaResponseRecord(
      await this.generationGateway.generateArticle({
        body: {
          count: articleType === 'standard' ? 1 : undefined,
          generateHeaderImage:
            articleType === 'x-article'
              ? Boolean(params.generateHeaderImage ?? true)
              : undefined,
          keywords: Array.isArray(params.keywords)
            ? (params.keywords as string[])
            : undefined,
          ...(ctx.generationModelOverride
            ? { model: ctx.generationModelOverride }
            : {}),
          prompt: buildArticlePrompt(params),
          targetWordCount:
            articleType === 'x-article'
              ? (params.targetWordCount as number | undefined)
              : undefined,
          tone: readOptionalString(params.tone),
          type: articleType,
        },
        principal: {
          brandId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      }),
    );
    const resource = readArticleResource(response);
    const attributes = isPlainMediaResponseRecord(resource?.attributes)
      ? resource.attributes
      : (resource ?? {});
    const articleId =
      readOptionalString(resource?.id) ?? readOptionalString(attributes.id);
    const articleContent = readOptionalString(attributes.content) ?? '';
    const articleTitle = readOptionalString(attributes.label) ?? '';

    return {
      creditsUsed: 0,
      data: {
        articleId,
        content: articleContent,
        summary: (attributes.summary as string) || '',
        title: articleTitle,
        type: articleType,
      },
      isBillingDelegated: true,
      nextActions: articleId
        ? [
            {
              contentFormat: 'article',
              ctas: [
                {
                  href: `/content/articles/${articleId}`,
                  label: 'Open article',
                },
              ],
              description:
                articleType === 'x-article'
                  ? 'X Article generated with review cycle.'
                  : 'Article generated with review cycle.',
              id: `article-gen-${articleId}`,
              textContent: articleContent,
              title:
                articleTitle ||
                (articleType === 'x-article'
                  ? 'X Article generated'
                  : 'Article generated'),
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }

  private async generateSocialContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    normalizedType: string,
    variationsCount: number,
  ): Promise<AgentToolResult> {
    const platform =
      (readOptionalString(params.platform) as ContentIntelligencePlatform) ??
      ContentIntelligencePlatform.TWITTER;
    const knowledge = resolveToolKnowledgeSelection(params, ctx);
    const brand = await resolveGenerationBrand({
      brandsService: this.brandsService,
      contextBrandId: ctx.brandId,
      explicitBrandId:
        typeof params.brandId === 'string' ? params.brandId : undefined,
      membersService: this.membersService,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    if (!brand?.id) {
      return {
        creditsUsed: 0,
        error: 'A brand is required to generate content.',
        success: false,
      };
    }
    if (!(await this.hasTextGenerationCredits(ctx))) {
      return INSUFFICIENT_TEXT_CREDITS_RESULT;
    }
    const results = await this.contentGeneratorService.generateContent(
      ctx.organizationId,
      {
        additionalContext: params.additionalContext as string[] | undefined,
        brandId: String(brand.id),
        ...(knowledge ? { knowledge } : {}),
        platform,
        topic: params.topic as string,
        variationsCount,
      } satisfies GenerateContentDto,
    );
    const generated = results[0];
    // The generator swallows LLM failures and returns no results; never bill
    // a call that produced no draft.
    if (!generated?.content?.trim()) {
      return EMPTY_TEXT_GENERATION_RESULT;
    }
    await this.chargeTextGeneration(
      ctx,
      String(brand.id),
      `Agent tool: generate_content (${normalizedType})`,
    );
    const threadSegments =
      normalizedType === 'thread' && generated?.content
        ? splitThreadSegments(generated.content)
        : undefined;
    const knowledgeReceipts = generated?.knowledgeReceipts ?? [];

    return {
      creditsUsed: TEXT_GENERATION_CREDITS,
      isBillingDelegated: true,
      data: {
        content: generated?.content ?? '',
        hashtags: generated?.hashtags ?? [],
        hook: generated?.hook,
        knowledgeReceipts,
        patternUsed: generated?.patternUsed,
        ...(variationsCount > 1
          ? {
              variations: results.map((variation) => ({
                body: variation.body,
                content: variation.content,
                cta: variation.cta,
                hashtags: variation.hashtags,
                hook: variation.hook,
                patternUsed: variation.patternUsed,
              })),
            }
          : {}),
      },
      nextActions: generated?.content
        ? [
            {
              contentFormat:
                normalizedType === 'thread' ? 'thread' : 'social_post',
              description: `${formatPlatformLabel(platform)} draft ready for review.`,
              id: `content-gen-${Date.now()}`,
              ...(knowledgeReceipts.length > 0 ? { knowledgeReceipts } : {}),
              platform,
              textContent: threadSegments?.[0] ?? generated.content,
              title: `${formatPlatformLabel(platform)} ${normalizedType === 'thread' ? 'thread' : 'post'}`,
              tweets: threadSegments,
              type: 'content_preview_card',
            },
          ]
        : [],
      success: true,
    };
  }
}

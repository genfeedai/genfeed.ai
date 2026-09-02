import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
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
  ContentIntelligencePlatform,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
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

@Injectable()
export class AgentMediaTextGenerationService {
  constructor(
    private readonly aiActionsService: AiActionsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly newslettersService: NewslettersService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
  ) {}

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
    return this.generateSocialContent(params, ctx, normalizedType);
  }

  private async generateNewsletter(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const dto: GenerateNewsletterDraftDto = {
      angle: readOptionalString(params.angle),
      instructions: readOptionalString(params.instructions),
      topic:
        readOptionalString(params.topic) ??
        readOptionalString(params.prompt) ??
        '',
    };
    const newsletter = await this.newslettersService.generateDraft(dto, {
      brandId: ctx.brandId ?? '',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    const newsletterId = readOptionalString(newsletter.id);
    const content = readOptionalString(newsletter.content) ?? '';
    const subject =
      readOptionalString(newsletter.label) ??
      readOptionalString(newsletter.topic) ??
      'Newsletter draft';
    const preheader = readOptionalString(newsletter.summary);

    return {
      creditsUsed: 2,
      data: { content, newsletterId, preheader, subject },
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
          prompt: (params.topic as string) || (params.prompt as string) || '',
          targetWordCount:
            articleType === 'x-article'
              ? (params.targetWordCount as number | undefined)
              : undefined,
          tone:
            articleType === 'x-article'
              ? (params.tone as string | undefined)
              : undefined,
          type: articleType,
        },
        principal: {
          brandId: ctx.brandId,
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
  ): Promise<AgentToolResult> {
    const platform =
      (readOptionalString(params.platform) as ContentIntelligencePlatform) ??
      ContentIntelligencePlatform.TWITTER;
    const results = await this.contentGeneratorService.generateContent(
      ctx.organizationId,
      {
        additionalContext: params.additionalContext as string[] | undefined,
        brandId: params.brandId ? (params.brandId as string) : undefined,
        platform,
        topic: params.topic as string,
        variationsCount: 1,
      } satisfies GenerateContentDto,
    );
    const generated = results[0];
    const threadSegments =
      normalizedType === 'thread' && generated?.content
        ? splitThreadSegments(generated.content)
        : undefined;

    return {
      creditsUsed: 2,
      data: {
        content: generated?.content ?? '',
        hashtags: generated?.hashtags ?? [],
        hook: generated?.hook,
        patternUsed: generated?.patternUsed,
      },
      nextActions: generated?.content
        ? [
            {
              contentFormat:
                normalizedType === 'thread' ? 'thread' : 'social_post',
              description: `${formatPlatformLabel(platform)} draft ready for review.`,
              id: `content-gen-${Date.now()}`,
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

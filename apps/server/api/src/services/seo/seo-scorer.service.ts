import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';

import {
  type ScoreContentOptions,
  type SeoCheck,
  type SeoQualitativeLlmResult,
  type SeoScorableContent,
  type SeoScorableType,
  type SeoScorecard,
} from './seo-scorer.types';
import {
  assembleScorecard,
  buildSeoChecks,
  computeKeywordDensity,
  countWords,
  fleschReadingEase,
  stripHtmlToText,
} from './seo-scorer.util';

/** Qualitative checks the LLM layer is allowed to refine, keyed by check id. */
const QUALITATIVE_LLM_FIELDS: Record<string, keyof SeoQualitativeLlmResult> = {
  active_voice: 'activeVoicePoints',
  conclusion_cta: 'conclusionCtaPoints',
  faq_section: 'faqPoints',
  jargon_controlled: 'jargonPoints',
};

const MAX_LLM_CONTENT_CHARS = 12000;

/**
 * Canonical SEO scorer (#758).
 *
 * Scores a piece of long-form content (article / post) against the 7-dimension
 * rubric in `skills/content-seo-optimizer/SKILL.md`. Deterministic checks are
 * computed in code (reproducible: same input → same number); the LLM only
 * refines the qualitative dimensions. Results are persisted on the entity.
 */
@Injectable()
export class SeoScorerService {
  private readonly constructorName = String(this.constructor.name);
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    @Optional()
    private readonly openRouterService?: OpenRouterService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
  }

  /**
   * Score a piece of content. Deterministic by construction; the LLM layer
   * (when available and not disabled) refines only the qualitative checks.
   */
  async scoreContent(
    input: SeoScorableContent,
    options?: ScoreContentOptions,
  ): Promise<SeoScorecard> {
    const checks = buildSeoChecks(input);
    const plainText = stripHtmlToText(input.content ?? '');
    const targetKeyword = (input.targetKeyword ?? '').trim() || null;
    let llmApplied = false;
    let llmSuggestions: string[] = [];

    if (options?.useLlm !== false && this.openRouterService) {
      const llm = await this.runQualitativeLlm(input);
      if (llm) {
        this.applyQualitativeScores(checks, llm);
        llmSuggestions = Array.isArray(llm.suggestions) ? llm.suggestions : [];
        llmApplied = true;
      }
    }

    const scorecard = assembleScorecard(checks, {
      fleschReadingEase: fleschReadingEase(plainText),
      keywordDensity: computeKeywordDensity(plainText, targetKeyword),
      llmApplied,
      scoredAt: new Date().toISOString(),
      targetKeyword,
      wordCount: countWords(plainText),
    });

    if (llmSuggestions.length > 0) {
      scorecard.suggestions = dedupe([
        ...llmSuggestions,
        ...scorecard.suggestions,
      ]).slice(0, 8);
    }

    return scorecard;
  }

  /** Score an article by id and persist the result. */
  async scoreArticle(
    articleId: string,
    organizationId: string,
    targetKeyword?: string,
  ): Promise<SeoScorecard> {
    const article = await this.prisma.article.findFirst({
      where: {
        id: articleId,
        isDeleted: false,
        organizationId,
      },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const scorecard = await this.scoreContent({
      content: article.content,
      metaDescription: article.excerpt,
      slug: article.slug,
      targetKeyword: targetKeyword ?? null,
      title: article.title,
    });

    await this.persist('article', article.id, organizationId, scorecard);
    return scorecard;
  }

  /** Score a post by id and persist the result. */
  async scorePost(
    postId: string,
    organizationId: string,
    targetKeyword?: string,
  ): Promise<SeoScorecard> {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        isDeleted: false,
        organizationId,
      },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const scorecard = await this.scoreContent({
      content: post.description,
      metaDescription: null,
      slug: null,
      targetKeyword: targetKeyword ?? null,
      title: post.label,
    });

    await this.persist('post', post.id, organizationId, scorecard);
    return scorecard;
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  private async persist(
    type: SeoScorableType,
    id: string,
    organizationId: string,
    scorecard: SeoScorecard,
  ): Promise<void> {
    const data = {
      seoBreakdown: this.toJsonValue({
        breakdown: scorecard.breakdown,
        checks: scorecard.checks,
        meta: scorecard.meta,
        rating: scorecard.rating,
        suggestions: scorecard.suggestions,
      }),
      seoScore: scorecard.score,
    };

    // Scope the write by organization (defense-in-depth beyond the org-scoped
    // read) and guard against a soft-delete racing between findFirst and persist.
    if (type === 'article') {
      await this.prisma.article.update({
        data,
        where: { id, isDeleted: false, organizationId },
      });
    } else {
      await this.prisma.post.update({
        data,
        where: { id, isDeleted: false, organizationId },
      });
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  // ─── LLM qualitative layer ────────────────────────────────────────────────

  private applyQualitativeScores(
    checks: SeoCheck[],
    llm: SeoQualitativeLlmResult,
  ): void {
    for (const check of checks) {
      const field = QUALITATIVE_LLM_FIELDS[check.id];
      if (!field) {
        continue;
      }
      const value = llm[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        check.points = Math.max(0, Math.min(check.max, Math.round(value)));
      }
    }
  }

  private async runQualitativeLlm(
    input: SeoScorableContent,
  ): Promise<SeoQualitativeLlmResult | null> {
    if (!this.openRouterService) {
      return null;
    }
    const plainText = (input.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LLM_CONTENT_CHARS);

    if (!plainText) {
      return null;
    }

    const prompt = buildQualitativePrompt(input, plainText);

    try {
      const params: OpenRouterChatCompletionParams = {
        max_tokens: 1024,
        messages: [{ content: prompt, role: 'user' }],
        model: this.defaultModel,
        temperature: 0.2,
      };
      const response: OpenRouterChatCompletionResponse =
        await this.openRouterService.chatCompletion(params);
      return this.parseQualitativeResponse(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `${this.constructorName} qualitative LLM call failed: ${message}`,
      );
      return null;
    }
  }

  private parseQualitativeResponse(
    response: OpenRouterChatCompletionResponse,
  ): SeoQualitativeLlmResult | null {
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]) as SeoQualitativeLlmResult;
      return {
        activeVoicePoints: clampNumber(parsed.activeVoicePoints, 0, 3),
        conclusionCtaPoints: clampNumber(parsed.conclusionCtaPoints, 0, 1),
        faqPoints: clampNumber(parsed.faqPoints, 0, 3),
        jargonPoints: clampNumber(parsed.jargonPoints, 0, 2),
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s): s is string => typeof s === 'string')
          : [],
      };
    } catch {
      return null;
    }
  }
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(min, Math.min(max, value));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildQualitativePrompt(
  input: SeoScorableContent,
  plainText: string,
): string {
  return `You are an expert SEO analyst. Score ONLY the four qualitative criteria below for the content. Return ONLY valid JSON with no markdown.

Return this exact shape:
{ "faqPoints": <0-3>, "conclusionCtaPoints": <0-1>, "activeVoicePoints": <0-3>, "jargonPoints": <0-2>, "suggestions": ["..."] }

Criteria:
- faqPoints (0-3): Does the content include an FAQ section answering likely "People Also Ask" questions?
- conclusionCtaPoints (0-1): Does it end with a clear call to action / next step?
- activeVoicePoints (0-3): Is it written predominantly in active voice (≥80% = 3)?
- jargonPoints (0-2): Are technical terms defined on first use (no unexplained jargon = 2)?
- suggestions: up to 3 short, specific improvements.

Title: ${(input.title ?? '').slice(0, 200)}

Content:
${plainText}`;
}

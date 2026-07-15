import { ArticleGenerationType } from '@api/collections/articles/dto/generate-articles.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import type {
  ArticleCycleModelConfig,
  ArticleHarnessContext,
  ArticleReviewRubric,
  TextGenerationCharge,
} from '@api/collections/articles/services/articles-content.types';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { appendHarnessBriefToPrompt } from '@api/services/harness/harness-brief.util';
import { ArticleCategory } from '@genfeedai/enums';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ArticleReviewService {
  private readonly defaultArticleLabel = 'Untitled Article';

  constructor(
    private readonly articleTextGenerationService: ArticleTextGenerationService,
  ) {}

  async reviewExistingArticle(
    article: ArticleDocument,
    organizationId: string,
    modelConfig: ArticleCycleModelConfig,
    harnessContext: ArticleHarnessContext,
    focus?: string,
    onBilling?: (charge: TextGenerationCharge) => void,
  ): Promise<ArticleReviewRubric> {
    const reviewModel = modelConfig.reviewModel || DEFAULT_MINI_TEXT_MODEL;
    const reviewPrompt = this.buildReviewPrompt({
      content: article.content ?? '',
      focus,
      harnessBrief: harnessContext.brief,
      label: this.getArticleLabel(article),
      summary: article.summary || '',
      type:
        article.category === ArticleCategory.X_ARTICLE
          ? ArticleGenerationType.X_ARTICLE
          : ArticleGenerationType.STANDARD,
    });

    const { output: reviewRaw, charge } =
      await this.articleTextGenerationService.generateTextWithModel(
        reviewModel,
        reviewPrompt,
        organizationId,
        harnessContext.promptBuilder,
      );
    onBilling?.(charge);

    return this.parseReviewRubric(reviewRaw);
  }

  async runReviewUpdateCycle(params: {
    draft: { label: string; summary: string; content: string };
    harnessContext?: ArticleHarnessContext;
    prompt: string;
    organizationId: string;
    modelConfig: ArticleCycleModelConfig;
    type: ArticleGenerationType;
    onBilling?: (charge: TextGenerationCharge) => void;
  }): Promise<{
    review: ArticleReviewRubric;
    updated: { label: string; summary: string; content: string };
  }> {
    const reviewModel =
      params.modelConfig.reviewModel || DEFAULT_MINI_TEXT_MODEL;
    const updateModel =
      params.modelConfig.updateModel || DEFAULT_MINI_TEXT_MODEL;

    const { output: reviewRaw, charge: reviewCharge } =
      await this.articleTextGenerationService.generateTextWithModel(
        reviewModel,
        this.buildReviewPrompt({
          content: params.draft.content,
          harnessBrief: params.harnessContext?.brief,
          label: params.draft.label,
          summary: params.draft.summary,
          type: params.type,
        }),
        params.organizationId,
        params.harnessContext?.promptBuilder,
      );
    params.onBilling?.(reviewCharge);
    const review = this.parseReviewRubric(reviewRaw);

    const { output: revisionRaw, charge: revisionCharge } =
      await this.articleTextGenerationService.generateTextWithModel(
        updateModel,
        this.buildRevisionPrompt(
          params.draft,
          params.prompt,
          review,
          params.type,
          params.harnessContext?.brief,
        ),
        params.organizationId,
        params.harnessContext?.promptBuilder,
      );
    params.onBilling?.(revisionCharge);
    const updated = this.parseUpdatedArticle(revisionRaw, params.draft);

    return { review, updated };
  }

  private getArticleLabel(article: Pick<ArticleDocument, 'label'>): string {
    const label = article.label?.trim();

    return label ? label : this.defaultArticleLabel;
  }

  private buildReviewPrompt(input: {
    label: string;
    summary: string;
    content: string;
    type: ArticleGenerationType;
    focus?: string;
    harnessBrief?: ContentHarnessBrief;
  }): string {
    const typeLabel =
      input.type === ArticleGenerationType.X_ARTICLE
        ? 'X long-form article'
        : 'standard article';
    const focusLine = input.focus ? `Focus area: ${input.focus}` : '';

    return appendHarnessBriefToPrompt(
      `You are an expert content reviewer. Review this ${typeLabel} and return strict JSON only.

${focusLine}

TITLE:
${input.label}

SUMMARY:
${input.summary}

CONTENT:
${input.content}

Return this exact JSON shape:
{
  "score": 0,
  "summary": "One paragraph overview",
  "strengths": ["..."],
  "issues": [
    {
      "severity": "low|medium|high",
      "category": "clarity|structure|tone|seo|accuracy|cta",
      "message": "...",
      "recommendation": "..."
    }
  ],
  "revisionInstructions": "Concrete instructions to improve the draft in one pass"
}`,
      input.harnessBrief,
    );
  }

  private buildRevisionPrompt(
    draft: { label: string; summary: string; content: string },
    originalPrompt: string,
    review: ArticleReviewRubric,
    type: ArticleGenerationType,
    harnessBrief?: ContentHarnessBrief,
  ): string {
    const typeLine =
      type === ArticleGenerationType.X_ARTICLE
        ? 'Keep X article style and section depth.'
        : 'Keep standard article/blog style.';
    return appendHarnessBriefToPrompt(
      `You are an expert content editor. Improve the draft using the review feedback.

Original request:
${originalPrompt}

${typeLine}

Current draft:
Title: ${draft.label}
Summary: ${draft.summary}
Content:
${draft.content}

Review summary:
${review.summary}
Score: ${review.score}
Revision instructions:
${review.revisionInstructions}

Issues:
${review.issues
  .map(
    (issue, index) =>
      `${index + 1}. [${issue.severity}] ${issue.category}: ${issue.message} -> ${issue.recommendation}`,
  )
  .join('\n')}

Return strict JSON only:
{
  "label": "Improved title",
  "summary": "Improved summary",
  "content": "Improved content (HTML allowed)"
}`,
      harnessBrief,
    );
  }

  private parseReviewRubric(raw: string): ArticleReviewRubric {
    try {
      const parsed = JSON.parse(raw) as Partial<ArticleReviewRubric>;
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .map((issue) => ({
              category: String(issue.category || 'clarity'),
              message: String(issue.message || ''),
              recommendation: String(issue.recommendation || ''),
              severity:
                issue.severity === 'high' ||
                issue.severity === 'medium' ||
                issue.severity === 'low'
                  ? issue.severity
                  : 'medium',
            }))
            .filter((issue) => issue.message.length > 0)
        : [];

      return {
        issues,
        revisionInstructions: String(parsed.revisionInstructions || ''),
        score:
          typeof parsed.score === 'number' && Number.isFinite(parsed.score)
            ? Math.max(0, Math.min(100, parsed.score))
            : 70,
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths
              .map((item) => String(item))
              .filter((item) => item.length > 0)
          : [],
        summary: String(parsed.summary || ''),
      };
    } catch {
      return {
        issues: [],
        revisionInstructions:
          'Improve clarity, structure, and call to action while preserving intent.',
        score: 70,
        strengths: [],
        summary:
          'Review model returned unstructured output, using fallback rubric.',
      };
    }
  }

  private parseUpdatedArticle(
    raw: string,
    fallback: { label: string; summary: string; content: string },
  ): { label: string; summary: string; content: string } {
    try {
      const parsed = JSON.parse(raw) as Partial<{
        label: string;
        summary: string;
        content: string;
      }>;
      return {
        content: String(parsed.content || fallback.content),
        label: String(parsed.label || fallback.label),
        summary: String(parsed.summary || fallback.summary),
      };
    } catch {
      return fallback;
    }
  }
}

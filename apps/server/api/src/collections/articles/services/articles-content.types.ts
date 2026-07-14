/**
 * Billing charge emitted after a text-generation model call.
 * Kept here (rather than in articles-content.service.ts) to avoid a circular
 * import between articles-content.service.ts and articles-content.types.ts.
 */
export interface TextGenerationCharge {
  amount: number;
  inputTokens: number;
  modelKey: string;
  outputTokens: number;
}

/**
 * Parameters accepted by ArticlesContentService.runTextGenerationStep.
 * Used as the type anchor for spec-level test mocks and internal callers.
 */
export type RunTextGenerationStepParams = Parameters<
  ArticleTextGenerationService['runTextGenerationStep']
>[0];

/**
 * Return shape of buildXArticleContentAndMetadata.
 */
export interface XArticleContentMetadata {
  content: string;
  metadata: {
    estimatedReadTime: number;
    sections: Array<{
      content: string;
      heading: string;
      id: string;
      order: number;
      pullQuote?: string;
    }>;
    wordCount: number;
  };
  wordCount: number;
}

import type { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ContentHarnessBrief } from '@genfeedai/harness';

export interface ArticleCycleModelConfig {
  generationModel?: string;
  reviewModel?: string;
  updateModel?: string;
}

export interface ArticleReviewRubric {
  score: number;
  strengths: string[];
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    category: string;
    message: string;
    recommendation: string;
  }>;
  revisionInstructions: string;
  summary: string;
}

export interface ArticleHarnessContext {
  brief?: ContentHarnessBrief;
  promptBuilder: Pick<
    PromptBuilderParams,
    'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
  >;
}

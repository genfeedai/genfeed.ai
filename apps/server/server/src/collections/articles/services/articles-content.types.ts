import type {
  ArticleGenerationType,
  GenerateArticlesDto,
} from '@server/collections/articles/dto/generate-articles.dto';
import type { ArticleDocument } from '@server/collections/articles/schemas/article.schema';
import type { ArticleTextGenerationService } from '@server/collections/articles/services/article-text-generation.service';
import type { PromptBuilderParams } from '@server/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  ArticleCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import type {
  ArticleCreatePayload,
  ArticleGenerationResponse,
} from '@genfeedai/interfaces/content/article.interface';

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

export interface ArticleDraftFields {
  content: string;
  label: string;
  summary: string;
}

export interface ArticleGenerationDraft extends ArticleDraftFields {
  slug: string;
  tags?: string[];
}

export type ArticleCreateFn = (
  articleData: ArticleCreatePayload,
  userId: string,
  organizationId: string,
  brandId: string,
) => Promise<ArticleDocument>;

export interface PersistGeneratedArticleParams {
  brandId: string;
  category: ArticleCategory;
  createArticleFn: ArticleCreateFn;
  draft: ArticleDraftFields;
  organizationId: string;
  slug: string;
  tagLabels?: string[];
  userId: string;
}

export interface ParsedXArticleDrafts {
  drafts: ArticleGenerationDraft[];
  wordCount: number;
}

export interface ArticleGenerationOrchestrationParams {
  brandId: string;
  category: ArticleCategory;
  createArticleFn: ArticleCreateFn;
  generateDto: GenerateArticlesDto;
  generationType: ArticleGenerationType;
  harnessSourceLines: string[];
  maxCount?: number;
  modelConfig: ArticleCycleModelConfig;
  onBilling?: (charge: TextGenerationCharge) => void;
  organizationId: string;
  parseFailureLabel: string;
  promptTransform?: (prompt: string) => string;
  startContext: Record<string, unknown>;
  startMessage: string;
  systemPromptTemplate: SystemPromptKey;
  templateKey: PromptTemplateKey;
  templateVariables: Record<string, unknown>;
  textPromptTemplate: PromptTemplateKey;
  toDrafts: (response: ArticleGenerationResponse) => ArticleGenerationDraft[];
  userId: string;
}

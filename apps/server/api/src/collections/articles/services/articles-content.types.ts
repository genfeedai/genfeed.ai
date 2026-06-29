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
export interface RunTextGenerationStepParams {
  model: string;
  basePrompt: string;
  harnessContext: {
    brief?: unknown;
    promptBuilder: Record<string, unknown>;
  };
  buildPromptOptions: Record<string, unknown>;
  organizationId: string;
  failureMessage: string;
  onBilling?: (charge: TextGenerationCharge) => void;
}

/**
 * Minimal surface of ArticlesContentService used when accessing private
 * runTextGenerationStep in tests via an untyped cast.
 */
export interface ArticlesContentServiceInternals {
  runTextGenerationStep(params: RunTextGenerationStepParams): Promise<string>;
}

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

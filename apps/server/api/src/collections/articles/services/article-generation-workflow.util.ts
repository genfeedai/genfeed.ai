import { ArticleGenerationType } from '@api/collections/articles/dto/generate-articles.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import type { ArticleGenerationContext } from '@api/collections/articles/services/articles-content.types';
import type { TextByokDispatch } from '@api/services/byok/text-dispatch-byok.util';

export type ArticleGenerationActionResult = {
  articles: ArticleDocument[];
  billedCredits: number;
};

export type ArticleGenerationFinalState = ArticleGenerationActionResult & {
  context: ArticleGenerationContext;
  headerPromptItems: Array<{ articleId: string }>;
};

/**
 * In-memory runtime for the article system workflows (#5380). It travels only
 * through `RunSystemWorkflowInput.runtimeContext`, never `inputValues` or node
 * outputs — both of which `WorkflowExecution` persists — so the org's
 * decrypted BYOK keys never reach execution history or logs.
 */
export type ArticleWorkflowRuntime = { byok: TextByokDispatch };

export function articleWorkflowRuntime(
  byok: TextByokDispatch | undefined,
): ArticleWorkflowRuntime | undefined {
  return byok ? { byok } : undefined;
}

export function readArticleWorkflowByok(
  runtimeContext: unknown,
): TextByokDispatch | undefined {
  if (!runtimeContext || typeof runtimeContext !== 'object') {
    return undefined;
  }
  return (runtimeContext as Partial<ArticleWorkflowRuntime>).byok;
}

export function finalizeArticleGeneration(
  input: Record<string, unknown>,
): ArticleGenerationFinalState {
  const generation = input.generation as {
    billedCredits: number;
    context: ArticleGenerationContext;
  };
  const drafts = input.drafts as {
    results?: Array<{
      result?: { article?: ArticleDocument; billedCredits?: number };
    }>;
  };
  const completed = drafts.results ?? [];
  const articles = completed.flatMap(({ result }) =>
    result?.article ? [result.article] : [],
  );
  return {
    articles,
    billedCredits:
      generation.billedCredits +
      completed.reduce(
        (total, { result }) => total + (result?.billedCredits ?? 0),
        0,
      ),
    context: generation.context,
    headerPromptItems:
      generation.context.generationType === ArticleGenerationType.X_ARTICLE &&
      generation.context.generateDto.generateHeaderImage !== false &&
      articles[0]
        ? [{ articleId: articles[0].id }]
        : [],
  };
}

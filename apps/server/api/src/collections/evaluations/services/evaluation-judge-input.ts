import {
  EvaluationResultProjection,
  type PostThreadChild,
} from '@api/collections/evaluations/services/evaluation-result.projection';
import type { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';

// Everything the judge sees besides the prompt templates is assembled here:
// content selection and the brand/prompt/metadata context for each content
// kind. The calibration scoring-surface lock hashes this file, so a change to
// what a judge receives needs a calibration report, while billing and
// persistence edits in evaluations.service.ts do not.
export type EvaluationJudgeContext = NonNullable<
  Parameters<EvaluationsOperationsService['evaluateVideo']>[1]
>;

interface JudgePromptSource {
  enhanced?: string;
  original?: string;
}

interface JudgeBrandSource {
  name?: string;
  guidelines?: string;
}

export interface JudgeArticleSource {
  category?: unknown;
  label?: unknown;
  summary?: unknown;
}

// Most recent prior evaluation of the same content anchors a post re-score.
export const PREVIOUS_EVALUATION_ORDER_BY = { updatedAt: 'desc' } as const;

const projection = new EvaluationResultProjection();

function readPromptText(prompt?: JudgePromptSource): string | undefined {
  return (
    projection.readString(prompt?.enhanced) ??
    projection.readString(prompt?.original)
  );
}

export function buildVideoJudgeContext(
  prompt: JudgePromptSource | undefined,
  brand: JudgeBrandSource | undefined,
  storedDuration: unknown,
): EvaluationJudgeContext {
  return {
    brand: projection.buildBrandContext(brand),
    durationSeconds:
      typeof storedDuration === 'number' && storedDuration > 0
        ? storedDuration
        : undefined,
    prompt: readPromptText(prompt),
  };
}

export function buildImageJudgeContext(
  prompt: JudgePromptSource | undefined,
  brand: JudgeBrandSource | undefined,
): EvaluationJudgeContext {
  return {
    brand: projection.buildBrandContext(brand),
    prompt: readPromptText(prompt),
  };
}

export function buildArticleJudgeContext(
  article: JudgeArticleSource,
  brand: JudgeBrandSource | undefined,
): EvaluationJudgeContext {
  return {
    brand: projection.buildBrandContext(brand),
    metadata: projection.serializeJsonRecord({
      category: projection.readString(article.category),
      summary: projection.readString(article.summary),
      title: projection.readString(article.label),
    }),
  };
}

// The article field sent to the judge as content; an empty one is rejected.
export function selectArticleJudgeContent(
  article: { content?: string | null },
  articleId: string,
): string {
  if (!article.content) {
    throw new NotFoundException(`Article ${articleId} has no content`);
  }
  return article.content;
}

// Thread children the post judge scores alongside the root post.
export async function loadPostThreadChildren(
  source: { getChildren(postId: string): Promise<unknown> } | undefined,
  postId: string,
): Promise<PostThreadChild[]> {
  const children = (await source?.getChildren(postId)) as
    | PostThreadChild[]
    | undefined;
  return children ?? [];
}

import {
  EvaluationResultProjection,
  type PostThreadChild,
} from '@api/collections/evaluations/services/evaluation-result.projection';
import type { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  IJudgeArticleContentSource,
  IJudgeArticleSource,
  IJudgeBrandSource,
  IJudgePostChildrenSource,
  IJudgePromptSource,
} from '@genfeedai/contracts/interfaces';

// Everything the judge sees besides the prompt templates is assembled here:
// content selection and the brand/prompt/metadata context for each content
// kind. The calibration scoring-surface lock hashes this file, so a change to
// what a judge receives needs a calibration report, while billing and
// persistence edits in evaluations.service.ts do not.
export type EvaluationJudgeContext = NonNullable<
  Parameters<EvaluationsOperationsService['evaluateVideo']>[1]
>;

// Most recent prior evaluation of the same content anchors a post re-score.
export const PREVIOUS_EVALUATION_ORDER_BY = { updatedAt: 'desc' } as const;

const projection = new EvaluationResultProjection();

function readPromptText(prompt?: IJudgePromptSource): string | undefined {
  return (
    projection.readString(prompt?.enhanced) ??
    projection.readString(prompt?.original)
  );
}

type JudgeBrandContext = ReturnType<
  EvaluationResultProjection['buildBrandContext']
>;

// The brand's approved palette, logo and video rules ride on the brand block
// the video judge already receives, so a video is scored against more than the
// brand's name and written guidelines.
function withVideoBrandRules(
  brandContext: JudgeBrandContext,
  brandName: string | undefined,
  rules: string | undefined,
): JudgeBrandContext {
  const trimmed = rules?.trim();
  if (!trimmed) {
    return brandContext;
  }
  const label = brandContext?.label ?? brandName;
  if (!label) {
    return brandContext;
  }
  const append = (existing: string | undefined) =>
    existing ? `${existing}\n\n${trimmed}` : trimmed;
  return {
    description: append(brandContext?.description),
    label,
    text: append(brandContext?.text),
  };
}

export function buildVideoJudgeContext(
  prompt: IJudgePromptSource | undefined,
  brand: IJudgeBrandSource | undefined,
  storedDuration: unknown,
  videoBrandRules?: { brandName?: string; rulesText?: string },
): EvaluationJudgeContext {
  return {
    brand: withVideoBrandRules(
      projection.buildBrandContext(brand),
      videoBrandRules?.brandName,
      videoBrandRules?.rulesText,
    ),
    durationSeconds:
      typeof storedDuration === 'number' && storedDuration > 0
        ? storedDuration
        : undefined,
    prompt: readPromptText(prompt),
  };
}

export function buildImageJudgeContext(
  prompt: IJudgePromptSource | undefined,
  brand: IJudgeBrandSource | undefined,
): EvaluationJudgeContext {
  return {
    brand: projection.buildBrandContext(brand),
    prompt: readPromptText(prompt),
  };
}

export function buildArticleJudgeContext(
  article: IJudgeArticleSource,
  brand: IJudgeBrandSource | undefined,
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
  article: IJudgeArticleContentSource,
  articleId: string,
): string {
  if (!article.content) {
    throw new NotFoundException(`Article ${articleId} has no content`);
  }
  return article.content;
}

// Thread children the post judge scores alongside the root post.
export async function loadPostThreadChildren(
  source: IJudgePostChildrenSource | undefined,
  postId: string,
): Promise<PostThreadChild[]> {
  const children = (await source?.getChildren(postId)) as
    | PostThreadChild[]
    | undefined;
  return children ?? [];
}

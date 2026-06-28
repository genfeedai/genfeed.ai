import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source-agnostic content the SEO scorer operates on. Kept local to the engine
 * package so the executor stays decoupled from the backend SEO service types
 * (mirrors `SeoScorableContent` in apps/server/api/src/services/seo).
 */
export interface SeoScorableContentLike {
  title?: string | null;
  metaDescription?: string | null;
  slug?: string | null;
  /** Body, stored as HTML in this codebase. */
  content?: string | null;
  url?: string | null;
  targetKeyword?: string | null;
  secondaryKeywords?: string[];
}

/** Minimal scorecard shape the node forwards downstream. */
export interface SeoScoreResolverResult {
  /** Overall 0-100 score. */
  score: number;
  /** Coarse rating label. */
  rating?: string;
  /** Earned points per dimension. */
  breakdown?: Record<string, number>;
  /** Prioritised, actionable improvement suggestions. */
  suggestions?: string[];
}

/**
 * Output emitted by the seoScore node. `score` is surfaced at the top level so
 * a downstream `condition` node can branch on it via
 * `{ field: 'custom', customField: 'score', operator: 'greaterThanOrEquals' }`.
 * The scored `content`/`title`/`targetKeyword` are passed through so a
 * `seoRewrite` node downstream can act on the same content + suggestions.
 */
export interface SeoScoreOutput extends SeoScoreResolverResult {
  score: number;
  suggestions: string[];
  content: string | null;
  title: string | null;
  targetKeyword: string | null;
}

export type SeoScoreResolver = (params: {
  content: SeoScorableContentLike;
  organizationId: string;
  useLlm?: boolean;
}) => Promise<SeoScoreResolverResult>;

// =============================================================================
// SHARED UPSTREAM RESOLUTION
// =============================================================================

/**
 * Returns the upstream node's output as a plain object. A `condition` node
 * forwards its inbound payload under `.data` (its own output is a
 * `ConditionResult`), so when an SEO node is wired downstream of a `condition`
 * we unwrap `.data` to recover the original `seoScore` output. This keeps the
 * "score -> branch -> rewrite" pattern working without the SEO nodes seeing a
 * `ConditionResult` where they expect content.
 */
export function resolveSeoUpstream(
  inputs: Map<string, unknown>,
): Record<string, unknown> | undefined {
  const first = inputs.values().next().value;
  if (!first || typeof first !== 'object') {
    return undefined;
  }
  const obj = first as Record<string, unknown>;
  // ConditionResult signature: { result: boolean, ..., data: <passthrough> }
  if (
    typeof obj.result === 'boolean' &&
    obj.data !== null &&
    typeof obj.data === 'object'
  ) {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}

/** Reads a string value from a named input, falling back to the upstream
 * object then node config; ignores non-string values (e.g. a ConditionResult
 * delivered under a control handle). */
export function pickSeoString(
  inputs: Map<string, unknown>,
  upstream: Record<string, unknown> | undefined,
  node: ExecutableNode,
  key: string,
): string | null {
  const candidates = [inputs.get(key), upstream?.[key], node.config[key]];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return null;
}

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * SEO Score Executor
 *
 * Scores a piece of content against the canonical SEO rubric and emits the
 * score, per-dimension breakdown, and prioritised suggestions. The actual
 * scoring is injected at runtime from the NestJS service layer (SeoScorerService).
 *
 * Node Type: seoScore
 */
export class SeoScoreExecutor extends BaseExecutor {
  readonly nodeType = 'seoScore';
  private resolver: SeoScoreResolver | null = null;

  setResolver(resolver: SeoScoreResolver): void {
    this.resolver = resolver;
  }

  estimateCost(_node: ExecutableNode): number {
    return 2;
  }

  private buildContent(
    inputs: Map<string, unknown>,
    node: ExecutableNode,
  ): SeoScorableContentLike {
    const upstream = resolveSeoUpstream(inputs);

    const secondary =
      (inputs.get('secondaryKeywords') as unknown) ??
      (upstream?.secondaryKeywords as unknown) ??
      (node.config.secondaryKeywords as unknown) ??
      [];

    return {
      content: pickSeoString(inputs, upstream, node, 'content'),
      metaDescription: pickSeoString(inputs, upstream, node, 'metaDescription'),
      secondaryKeywords: Array.isArray(secondary)
        ? (secondary as string[])
        : [],
      slug: pickSeoString(inputs, upstream, node, 'slug'),
      targetKeyword: pickSeoString(inputs, upstream, node, 'targetKeyword'),
      title: pickSeoString(inputs, upstream, node, 'title'),
      url: pickSeoString(inputs, upstream, node, 'url'),
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.resolver) {
      throw new Error('SEO score resolver not configured');
    }

    const content = this.buildContent(inputs, node);
    const useLlm = this.getOptionalConfig<boolean>(node.config, 'useLlm', true);

    const result = await this.resolver({
      content,
      organizationId: context.organizationId,
      useLlm,
    });

    const output: SeoScoreOutput = {
      breakdown: result.breakdown,
      content: content.content ?? null,
      rating: result.rating,
      score: result.score,
      suggestions: result.suggestions ?? [],
      targetKeyword: content.targetKeyword ?? null,
      title: content.title ?? null,
    };

    return {
      data: output,
      metadata: {
        rating: result.rating,
        score: result.score,
      },
    };
  }
}

export function createSeoScoreExecutor(
  resolver?: SeoScoreResolver,
): SeoScoreExecutor {
  const executor = new SeoScoreExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}

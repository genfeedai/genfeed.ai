import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import type { SeoRewriteResolver } from './seo-rewrite-executor';
import {
  pickSeoString,
  resolveSeoUpstream,
  type SeoScorableContentLike,
  type SeoScoreResolver,
} from './seo-score-executor';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_TARGET_SCORE = 80;
const DEFAULT_MAX_ITERATIONS = 3;
const MAX_ALLOWED_ITERATIONS = 10;
/** Per-iteration credit estimate: one score (2) + one rewrite (3). */
const CREDITS_PER_ITERATION = 5;

// =============================================================================
// TYPES
// =============================================================================

export interface SeoRefineIteration {
  /** 0 = initial score, 1..n = score after each rewrite. */
  iteration: number;
  score: number;
  /** Whether a rewrite was performed before this score. */
  rewritten: boolean;
}

export interface IterativeSeoRefineOutput {
  /** Best/final content after refinement. */
  text: string;
  /** Final score for `text`. */
  score: number;
  rating: string | null;
  /** Number of rewrite passes performed (0 if the input already passed). */
  iterations: number;
  /** Whether the target score was reached. */
  converged: boolean;
  /** Per-iteration score history (oldest first). */
  history: SeoRefineIteration[];
  breakdown: Record<string, number> | null;
  suggestions: string[];
  targetKeyword: string | null;
  title: string | null;
}

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Iterative SEO Refine Executor
 *
 * Runs a score -> rewrite -> re-score loop INTERNALLY, up to `maxIterations`
 * passes, until the content reaches `targetScore`. Emitting the loop as a
 * single node keeps the workflow a pure DAG — the validator hard-rejects graph
 * cycles (`CYCLE_DETECTED`), so an iterate-until pattern cannot be modelled as
 * a back-edge in the graph itself.
 *
 * Node Type: iterativeSeoRefine
 */
export class IterativeSeoRefineExecutor extends BaseExecutor {
  readonly nodeType = 'iterativeSeoRefine';
  private scoreResolver: SeoScoreResolver | null = null;
  private rewriteResolver: SeoRewriteResolver | null = null;

  setScoreResolver(resolver: SeoScoreResolver): void {
    this.scoreResolver = resolver;
  }

  setRewriteResolver(resolver: SeoRewriteResolver): void {
    this.rewriteResolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const targetScore = node.config.targetScore;
    if (
      targetScore !== undefined &&
      (typeof targetScore !== 'number' || targetScore < 0 || targetScore > 100)
    ) {
      errors.push('targetScore must be between 0 and 100');
    }

    const maxIterations = node.config.maxIterations;
    if (
      maxIterations !== undefined &&
      (typeof maxIterations !== 'number' ||
        maxIterations < 1 ||
        maxIterations > MAX_ALLOWED_ITERATIONS)
    ) {
      errors.push(
        `maxIterations must be between 1 and ${MAX_ALLOWED_ITERATIONS}`,
      );
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(node: ExecutableNode): number {
    const maxIterations = this.resolveMaxIterations(node);
    // 2 credits for the initial score + up to maxIterations × 5 (1 rewrite + 1 rescore each).
    return 2 + maxIterations * CREDITS_PER_ITERATION;
  }

  private resolveMaxIterations(node: ExecutableNode): number {
    const raw = this.getOptionalConfig<number>(
      node.config,
      'maxIterations',
      DEFAULT_MAX_ITERATIONS,
    );
    return Math.min(Math.max(Math.floor(raw), 1), MAX_ALLOWED_ITERATIONS);
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.scoreResolver || !this.rewriteResolver) {
      throw new Error('Iterative SEO refine resolvers not configured');
    }

    const upstream = resolveSeoUpstream(inputs);

    let text =
      pickSeoString(inputs, upstream, node, 'content') ??
      pickSeoString(inputs, upstream, node, 'text') ??
      '';

    if (!text || text.trim().length === 0) {
      throw new Error('Missing required input: content');
    }

    const title = pickSeoString(inputs, upstream, node, 'title');
    const targetKeyword = pickSeoString(
      inputs,
      upstream,
      node,
      'targetKeyword',
    );

    const targetScore = this.getOptionalConfig<number>(
      node.config,
      'targetScore',
      DEFAULT_TARGET_SCORE,
    );
    const maxIterations = this.resolveMaxIterations(node);
    const useLlm = this.getOptionalConfig<boolean>(node.config, 'useLlm', true);
    const model = this.getOptionalConfig<string | null>(
      node.config,
      'model',
      null,
    );

    const buildScorable = (body: string): SeoScorableContentLike => ({
      content: body,
      secondaryKeywords: [],
      targetKeyword,
      title,
    });

    const history: SeoRefineIteration[] = [];

    let current = await this.scoreResolver({
      content: buildScorable(text),
      organizationId: context.organizationId,
      useLlm,
    });
    history.push({ iteration: 0, rewritten: false, score: current.score });

    // Track the best-scoring candidate across iterations so a rewrite that
    // lowers the score does not cause the executor to return worse content.
    let bestText = text;
    let bestScore = current.score;
    let bestResult = current;

    let iterations = 0;
    while (current.score < targetScore && iterations < maxIterations) {
      const rewrite = await this.rewriteResolver({
        content: text,
        model,
        organizationId: context.organizationId,
        suggestions: current.suggestions ?? [],
        targetKeyword,
        title,
      });

      // Guard against a resolver that returns empty content: keep the best text
      // and stop refining rather than re-scoring an empty body to zero.
      if (!rewrite.text || rewrite.text.trim().length === 0) {
        break;
      }
      text = rewrite.text;
      iterations += 1;

      current = await this.scoreResolver({
        content: buildScorable(text),
        organizationId: context.organizationId,
        useLlm,
      });
      history.push({
        iteration: iterations,
        rewritten: true,
        score: current.score,
      });

      // Only promote this iteration's candidate if it improves on the best seen so far.
      if (current.score > bestScore) {
        bestText = text;
        bestScore = current.score;
        bestResult = current;
      }
    }

    const output: IterativeSeoRefineOutput = {
      breakdown: bestResult.breakdown ?? null,
      converged: bestScore >= targetScore,
      history,
      iterations,
      rating: bestResult.rating ?? null,
      score: bestScore,
      suggestions: bestResult.suggestions ?? [],
      targetKeyword: targetKeyword ?? null,
      text: bestText,
      title: title ?? null,
    };

    return {
      data: output,
      metadata: {
        converged: output.converged,
        iterations,
        score: bestScore,
      },
    };
  }
}

export function createIterativeSeoRefineExecutor(
  scoreResolver?: SeoScoreResolver,
  rewriteResolver?: SeoRewriteResolver,
): IterativeSeoRefineExecutor {
  const executor = new IterativeSeoRefineExecutor();
  if (scoreResolver) {
    executor.setScoreResolver(scoreResolver);
  }
  if (rewriteResolver) {
    executor.setRewriteResolver(rewriteResolver);
  }
  return executor;
}

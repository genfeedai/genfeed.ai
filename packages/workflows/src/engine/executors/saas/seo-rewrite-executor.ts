import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { pickSeoString, resolveSeoUpstream } from './seo-score-executor';

// =============================================================================
// TYPES
// =============================================================================

export interface SeoRewriteOutput {
  /** Rewritten content body. */
  text: string;
  /** Model that produced the rewrite, when known. */
  model: string | null;
  /** Suggestions the rewrite was asked to address. */
  appliedSuggestions: string[];
  /** Target keyword carried through for downstream re-scoring. */
  targetKeyword: string | null;
  /** Title carried through unchanged for downstream re-scoring. */
  title: string | null;
}

export type SeoRewriteResolver = (params: {
  content: string;
  suggestions: string[];
  organizationId: string;
  title?: string | null;
  targetKeyword?: string | null;
  model?: string | null;
}) => Promise<{ text: string; model?: string | null }>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * SEO Rewrite Executor
 *
 * Rewrites content to address SEO suggestions emitted by an upstream `seoScore`
 * node. The rewrite itself (an LLM call) is injected at runtime from the NestJS
 * service layer.
 *
 * Node Type: seoRewrite
 */
export class SeoRewriteExecutor extends BaseExecutor {
  readonly nodeType = 'seoRewrite';
  private resolver: SeoRewriteResolver | null = null;

  setResolver(resolver: SeoRewriteResolver): void {
    this.resolver = resolver;
  }

  estimateCost(_node: ExecutableNode): number {
    return 3;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.resolver) {
      throw new Error('SEO rewrite resolver not configured');
    }

    const upstream = resolveSeoUpstream(inputs);

    const content = pickSeoString(inputs, upstream, node, 'content') ?? '';

    if (!content || content.trim().length === 0) {
      throw new Error('Missing required input: content');
    }

    const suggestionsRaw =
      (inputs.get('suggestions') as unknown) ??
      (upstream?.suggestions as unknown) ??
      node.config.suggestions ??
      [];
    const suggestions = Array.isArray(suggestionsRaw)
      ? (suggestionsRaw as string[])
      : [];

    const title = pickSeoString(inputs, upstream, node, 'title');
    const targetKeyword = pickSeoString(
      inputs,
      upstream,
      node,
      'targetKeyword',
    );

    const model = this.getOptionalConfig<string | null>(
      node.config,
      'model',
      null,
    );

    const result = await this.resolver({
      content,
      model,
      organizationId: context.organizationId,
      suggestions,
      targetKeyword,
      title,
    });

    const output: SeoRewriteOutput = {
      appliedSuggestions: suggestions,
      model: result.model ?? null,
      targetKeyword: targetKeyword ?? null,
      text: result.text,
      title: title ?? null,
    };

    return {
      data: output,
      metadata: {
        model: result.model ?? null,
        suggestionCount: suggestions.length,
      },
    };
  }
}

export function createSeoRewriteExecutor(
  resolver?: SeoRewriteResolver,
): SeoRewriteExecutor {
  const executor = new SeoRewriteExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}

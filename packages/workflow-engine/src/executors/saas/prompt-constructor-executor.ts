import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export interface PromptConstructorConfig {
  /** The template string with {{variable}} placeholders */
  template: string;
  /** Key-value pairs to substitute into the template */
  variables: Record<string, string>;
}

export interface PromptConstructorResult {
  /** The fully resolved prompt text */
  prompt: string;
  /** Variables that were successfully substituted */
  resolvedVariables: string[];
  /** Placeholders that had no matching variable */
  unresolvedPlaceholders: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Replaces {{variable}} placeholders in a template with values from the
 * variables map. Returns the resolved string plus metadata about which
 * placeholders were/were not resolved.
 */
function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): PromptConstructorResult {
  const resolvedVariables: string[] = [];
  const unresolvedPlaceholders: string[] = [];

  const prompt = template.replace(PLACEHOLDER_REGEX, (match, key: string) => {
    if (key in variables) {
      resolvedVariables.push(key);
      return variables[key];
    }
    unresolvedPlaceholders.push(key);
    return match;
  });

  return { prompt, resolvedVariables, unresolvedPlaceholders };
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class PromptConstructorExecutor extends BaseExecutor {
  readonly nodeType = 'promptConstructor';

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { inputs, node } = input;
    const config = this.resolveConfig(node, inputs);

    const result = resolveTemplate(config.template, config.variables);

    return {
      data: result.prompt,
      metadata: {
        resolvedCount: result.resolvedVariables.length,
        unresolvedCount: result.unresolvedPlaceholders.length,
      },
    };
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = node.config as Partial<PromptConstructorConfig>;

    if (!config.template || typeof config.template !== 'string') {
      errors.push('Template is required and must be a string');
    }

    if (
      config.template &&
      typeof config.template === 'string' &&
      config.template.trim().length === 0
    ) {
      errors.push('Template must not be empty');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  private resolveConfig(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
  ): PromptConstructorConfig {
    const rawVariables = node.config.variables;
    const variables: Record<string, string> = {};

    if (rawVariables && typeof rawVariables === 'object') {
      for (const [key, value] of Object.entries(
        rawVariables as Record<string, unknown>,
      )) {
        variables[key] = String(value);
      }
    }

    for (const [key, value] of inputs.entries()) {
      if (value === undefined || value === null) {
        continue;
      }

      variables[key] = String(value);
    }

    return {
      template: (node.config.template as string) ?? '',
      variables,
    };
  }
}

export function createPromptConstructorExecutor(): PromptConstructorExecutor {
  return new PromptConstructorExecutor();
}

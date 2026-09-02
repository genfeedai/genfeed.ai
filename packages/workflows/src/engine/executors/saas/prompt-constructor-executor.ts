import type { PromptFormat, PromptJsonValue } from '@genfeedai/contracts/types';
import type { PromptConstructorPayload } from '../../../contracts/prompt-constructor';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import {
  isPromptJsonValue,
  PROMPT_FORMAT_JSON,
  parsePromptJson,
  readPromptFormat,
  serializeStructuredPrompt,
} from './prompt-json';

// =============================================================================
// TYPES
// =============================================================================

export interface PromptConstructorConfig {
  /** The template string with {{variable}} placeholders */
  template: string;
  /** Key-value pairs to substitute into the template */
  variables: Record<string, string>;
  promptFormat: PromptFormat;
  structuredPrompt?: PromptJsonValue | null;
  /**
   * When false, JSON mode emits only deterministic text. Defaults to true so
   * structured payloads are forwarded losslessly. Model capability gating is
   * #1650 — this flag is a generic fallback, not a model-id switch.
   */
  acceptsStructuredPrompt: boolean;
}

export interface PromptConstructorResult {
  /** The fully resolved prompt text */
  prompt: string;
  /** Variables that were successfully substituted */
  resolvedVariables: string[];
  /** Placeholders that had no matching variable */
  unresolvedPlaceholders: string[];
  promptFormat?: PromptFormat;
  structuredPrompt?: PromptJsonValue;
}

const HOOKS_INPUT_HANDLE = 'hooks';
const AVOID_INPUT_HANDLE = 'avoid';
const TEMPLATE_RESERVED_CONFIG_KEYS = new Set([
  'acceptsStructuredPrompt',
  'inputVariableKeys',
  'label',
  'outputText',
  'promptFormat',
  'structuredPrompt',
  'template',
  'unresolvedVars',
  'variables',
  HOOKS_INPUT_HANDLE,
  AVOID_INPUT_HANDLE,
]);

// =============================================================================
// HELPERS
// =============================================================================

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

function isPrimitiveTemplateValue(
  value: unknown,
): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

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

export function readPromptGuidanceList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function foldPromptGuidance(
  prompt: string,
  hooks: string[],
  avoid: string[],
): string {
  const sections: string[] = [];
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.length > 0) {
    sections.push(trimmedPrompt);
  }

  if (hooks.length > 0) {
    sections.push(
      ['Proven hooks to emulate:', ...hooks.map((hook) => `- ${hook}`)].join(
        '\n',
      ),
    );
  }

  if (avoid.length > 0) {
    sections.push(
      ['Avoid these topics:', ...avoid.map((topic) => `- ${topic}`)].join('\n'),
    );
  }

  return sections.join('\n\n');
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
    const hooks = readPromptGuidanceList(inputs.get(HOOKS_INPUT_HANDLE));
    const avoid = readPromptGuidanceList(inputs.get(AVOID_INPUT_HANDLE));

    if (config.promptFormat !== PROMPT_FORMAT_JSON) {
      const prompt = foldPromptGuidance(result.prompt, hooks, avoid);
      return {
        data: prompt,
        metadata: {
          avoidCount: avoid.length,
          hooksCount: hooks.length,
          promptFormat: config.promptFormat,
          resolvedCount: result.resolvedVariables.length,
          unresolvedCount: result.unresolvedPlaceholders.length,
        },
      };
    }

    const { data, isStructuredPromptValid, isStructuredPromptSerialized } =
      this.buildJsonPayload(config, result.prompt, hooks, avoid);

    return {
      data,
      metadata: {
        avoidCount: avoid.length,
        hooksCount: hooks.length,
        isStructuredPromptSerialized,
        isStructuredPromptValid,
        promptFormat: PROMPT_FORMAT_JSON,
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

    for (const [key, value] of Object.entries(node.config)) {
      if (
        TEMPLATE_RESERVED_CONFIG_KEYS.has(key) ||
        key in variables ||
        !isPrimitiveTemplateValue(value)
      ) {
        continue;
      }

      variables[key] = String(value);
    }

    for (const [key, value] of inputs.entries()) {
      if (
        value === undefined ||
        value === null ||
        key === HOOKS_INPUT_HANDLE ||
        key === AVOID_INPUT_HANDLE
      ) {
        continue;
      }

      variables[key] = String(value);
    }

    return {
      acceptsStructuredPrompt: node.config.acceptsStructuredPrompt !== false,
      promptFormat: readPromptFormat(node.config.promptFormat),
      structuredPrompt: this.readStoredStructuredPrompt(
        node.config.structuredPrompt,
      ),
      template: (node.config.template as string) ?? '',
      variables,
    };
  }

  private readStoredStructuredPrompt(
    value: unknown,
  ): PromptJsonValue | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    return isPromptJsonValue(value) ? value : undefined;
  }

  private buildJsonPayload(
    config: PromptConstructorConfig,
    resolvedTemplate: string,
    hooks: string[],
    avoid: string[],
  ): {
    data: PromptConstructorPayload;
    isStructuredPromptSerialized: boolean;
    isStructuredPromptValid: boolean;
  } {
    const structuredPrompt = this.resolveStructuredPrompt(
      config,
      resolvedTemplate,
    );
    const isStructuredPromptValid = structuredPrompt !== undefined;
    const prompt = foldPromptGuidance(
      isStructuredPromptValid
        ? serializeStructuredPrompt(structuredPrompt)
        : resolvedTemplate,
      hooks,
      avoid,
    );

    if (!config.acceptsStructuredPrompt && isStructuredPromptValid) {
      return {
        data: prompt,
        isStructuredPromptSerialized: true,
        isStructuredPromptValid,
      };
    }

    return {
      data: {
        prompt,
        promptFormat: PROMPT_FORMAT_JSON,
        ...(isStructuredPromptValid ? { structuredPrompt } : {}),
      },
      isStructuredPromptSerialized: false,
      isStructuredPromptValid,
    };
  }

  private resolveStructuredPrompt(
    config: PromptConstructorConfig,
    resolvedTemplate: string,
  ): PromptJsonValue | undefined {
    const parsed = parsePromptJson(resolvedTemplate);
    if (parsed.isValid) {
      if (
        config.structuredPrompt !== undefined &&
        config.structuredPrompt !== null &&
        serializeStructuredPrompt(parsed.value) ===
          serializeStructuredPrompt(config.structuredPrompt)
      ) {
        return config.structuredPrompt;
      }

      return parsed.value;
    }

    if (
      config.structuredPrompt !== undefined &&
      config.structuredPrompt !== null
    ) {
      return config.structuredPrompt;
    }

    return undefined;
  }
}

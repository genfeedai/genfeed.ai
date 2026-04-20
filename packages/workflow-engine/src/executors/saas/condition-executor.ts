import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEquals'
  | 'lessThanOrEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'isTrue'
  | 'isFalse'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'expression';

export type ConditionField =
  | 'engagementRate'
  | 'followerCount'
  | 'contentType'
  | 'platform'
  | 'timeOfDay'
  | 'dayOfWeek'
  | 'custom';

export interface ConditionConfig {
  /** The field to evaluate */
  field: ConditionField;
  /** The comparison operator */
  operator: ConditionOperator;
  /** The value to compare against */
  value?: unknown;
  /** Custom field path (dot-notation) when field is 'custom' */
  customField?: string;
  /** Raw expression string for 'expression' operator */
  expression?: string;
  /** Timezone for time-based conditions */
  timezone?: string;
}

export interface ConditionResult {
  /** Whether the condition evaluated to true */
  result: boolean;
  /** The actual value that was evaluated */
  actualValue: unknown;
  /** The expected/comparison value */
  expectedValue: unknown;
  /** The operator used */
  operator: ConditionOperator;
  /** Pass-through data from input */
  data: unknown;
}

// =============================================================================
// FIELD RESOLVERS
// =============================================================================

function resolveFieldValue(
  field: ConditionField,
  inputs: Map<string, unknown>,
  config: ConditionConfig,
): unknown {
  const inputData = inputs.values().next().value as
    | Record<string, unknown>
    | undefined;

  switch (field) {
    case 'engagementRate':
      return (
        resolveNestedValue(inputData, 'engagementRate') ??
        resolveNestedValue(inputData, 'analytics.engagementRate') ??
        resolveNestedValue(inputData, 'data.engagementRate')
      );

    case 'followerCount':
      return (
        resolveNestedValue(inputData, 'followerCount') ??
        resolveNestedValue(inputData, 'analytics.followerCount') ??
        resolveNestedValue(inputData, 'data.followerCount')
      );

    case 'contentType':
      return (
        resolveNestedValue(inputData, 'contentType') ??
        resolveNestedValue(inputData, 'type') ??
        resolveNestedValue(inputData, 'data.contentType')
      );

    case 'platform':
      return (
        resolveNestedValue(inputData, 'platform') ??
        resolveNestedValue(inputData, 'data.platform')
      );

    case 'timeOfDay': {
      const tz = config.timezone ?? 'UTC';
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz,
        });
        return parseInt(formatter.format(now), 10);
      } catch {
        return new Date().getUTCHours();
      }
    }

    case 'dayOfWeek': {
      const tz = config.timezone ?? 'UTC';
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'long',
        });
        return formatter.format(now).toLowerCase();
      } catch {
        const days = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ];
        return days[new Date().getUTCDay()];
      }
    }

    case 'custom': {
      const customPath = config.customField;
      if (!customPath) {
        throw new Error('customField is required when field is "custom"');
      }
      return resolveNestedValue(inputData, customPath);
    }

    default:
      throw new Error(`Unknown condition field: ${field}`);
  }
}

function resolveNestedValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== 'object') {
    return undefined;
  }
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// =============================================================================
// OPERATOR EVALUATION
// =============================================================================

export function evaluateCondition(
  operator: ConditionOperator,
  actual: unknown,
  expected: unknown,
  expression?: string,
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;

    case 'notEquals':
      return actual !== expected;

    case 'greaterThan':
      return Number(actual) > Number(expected);

    case 'lessThan':
      return Number(actual) < Number(expected);

    case 'greaterThanOrEquals':
      return Number(actual) >= Number(expected);

    case 'lessThanOrEquals':
      return Number(actual) <= Number(expected);

    case 'contains':
      return String(actual).includes(String(expected));

    case 'notContains':
      return !String(actual).includes(String(expected));

    case 'startsWith':
      return String(actual).startsWith(String(expected));

    case 'endsWith':
      return String(actual).endsWith(String(expected));

    case 'matches': {
      try {
        const regex = new RegExp(String(expected));
        return regex.test(String(actual));
      } catch {
        return false;
      }
    }

    case 'isTrue':
      return Boolean(actual) === true;

    case 'isFalse':
      return Boolean(actual) === false;

    case 'isEmpty':
      return (
        actual == null ||
        actual === '' ||
        (Array.isArray(actual) && actual.length === 0)
      );

    case 'isNotEmpty':
      return (
        actual != null &&
        actual !== '' &&
        !(Array.isArray(actual) && actual.length === 0)
      );

    case 'expression': {
      if (!expression) {
        throw new Error(
          'Expression string is required for "expression" operator',
        );
      }
      return evaluateExpression(expression, actual);
    }

    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Evaluates a simple expression string against a value.
 * Supports: `value > 10`, `value === "foo"`, `value !== "bar"`, etc.
 * Uses a safe AST-free comparison parser — no code execution.
 */
function evaluateExpression(expression: string, value: unknown): boolean {
  const sanitized = expression.trim();

  // Match pattern: value <operator> <literal>
  const match = sanitized.match(/^value\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    throw new Error(
      'Expression must be in the form: value <operator> <literal>',
    );
  }

  const operator = match[1];
  const rawRight = match[2].trim();

  // Parse the right-hand literal safely (string, number, boolean, null)
  let right: unknown;
  if (
    (rawRight.startsWith('"') && rawRight.endsWith('"')) ||
    (rawRight.startsWith("'") && rawRight.endsWith("'"))
  ) {
    right = rawRight.slice(1, -1);
  } else if (rawRight === 'true') {
    right = true;
  } else if (rawRight === 'false') {
    right = false;
  } else if (rawRight === 'null') {
    right = null;
  } else if (rawRight === 'undefined') {
    right = undefined;
  } else if (!Number.isNaN(Number(rawRight))) {
    right = Number(rawRight);
  } else {
    throw new Error(`Unsupported literal in expression: ${rawRight}`);
  }

  switch (operator) {
    case '===':
      return value === right;
    case '!==':
      return value !== right;
    case '==':
      // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality for user expressions
      return value == right;
    case '!=':
      // biome-ignore lint/suspicious/noDoubleEquals: intentional loose inequality for user expressions
      return value != right;
    case '>':
      return (value as number) > (right as number);
    case '<':
      return (value as number) < (right as number);
    case '>=':
      return (value as number) >= (right as number);
    case '<=':
      return (value as number) <= (right as number);
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class ConditionExecutor extends BaseExecutor {
  readonly nodeType = 'condition';

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;
    const config = this.resolveConfig(node);

    const actualValue = resolveFieldValue(config.field, inputs, config);
    const result = evaluateCondition(
      config.operator,
      actualValue,
      config.value,
      config.expression,
    );

    const passthrough = inputs.values().next().value ?? null;

    const conditionResult: ConditionResult = {
      actualValue,
      data: passthrough,
      expectedValue: config.value,
      operator: config.operator,
      result,
    };

    return {
      data: conditionResult,
      metadata: {
        /** The branch that should be followed: 'true' or 'false' */
        branch: result ? 'true' : 'false',
        result,
      },
    };
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = node.config as Partial<ConditionConfig>;

    if (!config.field) {
      errors.push('Condition field is required');
    }

    if (!config.operator) {
      errors.push('Condition operator is required');
    }

    const needsValue: ConditionOperator[] = [
      'equals',
      'notEquals',
      'greaterThan',
      'lessThan',
      'greaterThanOrEquals',
      'lessThanOrEquals',
      'contains',
      'notContains',
      'startsWith',
      'endsWith',
      'matches',
    ];

    if (
      config.operator &&
      needsValue.includes(config.operator) &&
      config.value === undefined
    ) {
      errors.push(`Value is required for operator "${config.operator}"`);
    }

    if (config.field === 'custom' && !config.customField) {
      errors.push('customField is required when field is "custom"');
    }

    if (config.operator === 'expression' && !config.expression) {
      errors.push('expression is required for "expression" operator');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  private resolveConfig(node: ExecutableNode): ConditionConfig {
    return {
      customField: node.config.customField as string | undefined,
      expression: node.config.expression as string | undefined,
      field: (node.config.field as ConditionField) ?? 'custom',
      operator: (node.config.operator as ConditionOperator) ?? 'equals',
      timezone: node.config.timezone as string | undefined,
      value: node.config.value,
    };
  }
}

export function createConditionExecutor(): ConditionExecutor {
  return new ConditionExecutor();
}

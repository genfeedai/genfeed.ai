/**
 * Condition Node
 *
 * LOGIC category node that branches workflow based on conditions.
 * Evaluates a field against an operator/value and routes to true/false branches.
 */

import type { BaseNodeData } from '@workflow-saas/types';

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

/**
 * Condition Node Data
 *
 * Inputs:
 * - value (any): Value to evaluate
 *
 * Outputs:
 * - true (any): Data passed through when condition is true
 * - false (any): Data passed through when condition is false
 */
export interface ConditionNodeData extends BaseNodeData {
  type: 'condition';

  /** The field to evaluate */
  field: ConditionField;
  /** The comparison operator */
  operator: ConditionOperator;
  /** The value to compare against */
  value: string;
  /** Custom field path (dot-notation) when field is 'custom' */
  customField: string;
  /** Raw expression string for 'expression' operator */
  expression: string;
  /** Timezone for time-based conditions */
  timezone: string;
}

/**
 * Default data for a new Condition node
 */
export const DEFAULT_CONDITION_DATA: Partial<ConditionNodeData> = {
  customField: '',
  expression: '',
  field: 'custom',
  label: 'Condition',
  operator: 'equals',
  status: 'idle',
  timezone: 'UTC',
  type: 'condition',
  value: '',
};

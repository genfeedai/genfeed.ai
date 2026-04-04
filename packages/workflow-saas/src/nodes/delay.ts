/**
 * Delay Node
 *
 * LOGIC category node that pauses workflow execution for a duration.
 * Supports fixed duration, until-time, and optimal posting time modes.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type DelayMode = 'fixed' | 'until' | 'optimal';

export type DelayUnit =
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days';

/**
 * Delay Node Data
 *
 * Inputs:
 * - data (any): Pass-through data
 *
 * Outputs:
 * - data (any): Pass-through data after delay
 */
export interface DelayNodeData extends BaseNodeData {
  type: 'delay';

  /** Delay mode */
  mode: DelayMode;
  /** Duration value (fixed mode) */
  duration: number;
  /** Duration unit (fixed mode) */
  unit: DelayUnit;
  /** ISO timestamp to wait until (until mode) */
  untilTime: string;
  /** Platform for optimal posting time (optimal mode) */
  platform: string;
  /** Timezone */
  timezone: string;
}

/**
 * Default data for a new Delay node
 */
export const DEFAULT_DELAY_DATA: Partial<DelayNodeData> = {
  duration: 5,
  label: 'Delay',
  mode: 'fixed',
  platform: '',
  status: 'idle',
  timezone: 'UTC',
  type: 'delay',
  unit: 'minutes',
  untilTime: '',
};

import type { StateMachine } from '../interfaces/utils/state-machine.interface';
import { CONTENT_CAMPAIGN_STATE_MACHINE } from './content-campaign.enum';
import { INGREDIENT_STATE_MACHINE } from './ingredient.enum';
import { TARGET_VALIDATION_STATE_MACHINE } from './scheduler.enum';
import {
  TURBO_PROJECT_ITEM_STATE_MACHINE,
  TURBO_RUN_ITEM_STATE_MACHINE,
  TURBO_RUN_STATE_MACHINE,
} from './turbo.enum';
import { WORKFLOW_EXECUTION_STATE_MACHINE } from './workflow.enum';
import { WORKFLOW_NODE_CONTINUATION_STATE_MACHINE } from './workflow-node-continuation.enum';

/** One status lifecycle and where it is stored. */
export interface StateMachineCatalogEntry {
  /** The column the lifecycle lives in, as `Model.field`. */
  readonly column: string;
  /** The exported constant that holds the machine. */
  readonly constant: string;
  readonly machine: StateMachine<string>;
}

/**
 * Every lifecycle built with `defineStateMachine`, as plain data. Docs
 * (`docs/architecture/state-machines.md`) and agent tools read this to answer
 * "what can happen next" without reading service code. Adding a machine
 * without listing it here fails `state-machine.registry.spec.ts`.
 */
export const STATE_MACHINE_CATALOG: readonly StateMachineCatalogEntry[] = [
  {
    column: 'Campaign.status',
    constant: 'CONTENT_CAMPAIGN_STATE_MACHINE',
    machine: CONTENT_CAMPAIGN_STATE_MACHINE,
  },
  {
    column: 'Ingredient.status',
    constant: 'INGREDIENT_STATE_MACHINE',
    machine: INGREDIENT_STATE_MACHINE,
  },
  {
    column: 'Post.targetValidationState',
    constant: 'TARGET_VALIDATION_STATE_MACHINE',
    machine: TARGET_VALIDATION_STATE_MACHINE,
  },
  {
    column: 'TurboProjectItem.status',
    constant: 'TURBO_PROJECT_ITEM_STATE_MACHINE',
    machine: TURBO_PROJECT_ITEM_STATE_MACHINE,
  },
  {
    column: 'TurboRun.status',
    constant: 'TURBO_RUN_STATE_MACHINE',
    machine: TURBO_RUN_STATE_MACHINE,
  },
  {
    column: 'TurboRunItem.status',
    constant: 'TURBO_RUN_ITEM_STATE_MACHINE',
    machine: TURBO_RUN_ITEM_STATE_MACHINE,
  },
  {
    column: 'WorkflowExecution.status',
    constant: 'WORKFLOW_EXECUTION_STATE_MACHINE',
    machine: WORKFLOW_EXECUTION_STATE_MACHINE,
  },
  {
    column: 'WorkflowNodeContinuation.status',
    constant: 'WORKFLOW_NODE_CONTINUATION_STATE_MACHINE',
    machine: WORKFLOW_NODE_CONTINUATION_STATE_MACHINE,
  },
];

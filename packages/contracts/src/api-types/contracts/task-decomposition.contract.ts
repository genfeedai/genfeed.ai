/**
 * Schema-enforced shape of the task-decomposition router's answer (#4873).
 *
 * `agentType` is the `AgentType` enum itself, so an invented specialist is a
 * schema violation the provider is told about up front rather than a label the
 * service discovers and throws on after the whole call has been paid for.
 * `isSingleAgent` is not modelled: the service derives it from the subtask
 * count, which is the only source that cannot disagree with itself.
 */

import { z } from 'zod';
import { AgentType } from '../..';

export const taskDecompositionSubtaskSchema = z.object({
  agentType: z.enum(AgentType),
  brief: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().min(0),
});

export const taskDecompositionSchema = z.object({
  routingSummary: z.string().min(1),
  subtasks: z.array(taskDecompositionSubtaskSchema).min(1),
});

export type TaskDecompositionSubtask = z.infer<
  typeof taskDecompositionSubtaskSchema
>;
export type TaskDecomposition = z.infer<typeof taskDecompositionSchema>;

export const TASK_DECOMPOSITION_SCHEMA_NAME = 'task_decomposition';

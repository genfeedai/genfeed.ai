/**
 * Schema-enforced shape of natural-language workflow generation (#4873).
 *
 * `data` and the node `config` inside it stay open records: a node's
 * parameters are whatever its action definition declares, and the workflow
 * format converter validates them against the registry afterwards. What the
 * schema does pin down is the graph itself — ids, positions and the handles
 * each edge connects — which is what used to arrive half-formed and be caught
 * only by an `Array.isArray` check after parsing.
 */

import { z } from 'zod';

export const workflowGenerationNodeSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  id: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.string().min(1),
});

export const workflowGenerationEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});

export const workflowGenerationSchema = z.object({
  description: z.string(),
  edges: z.array(workflowGenerationEdgeSchema),
  name: z.string().min(1),
  nodes: z.array(workflowGenerationNodeSchema).min(1),
});

export type WorkflowGeneration = z.infer<typeof workflowGenerationSchema>;

export const WORKFLOW_GENERATION_SCHEMA_NAME = 'workflow_generation';

import { MAX_EXECUTION_NODES } from '@api/collections/workflows/services/workflow-executor.constants';
import { z } from 'zod';

const identity = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const jsonObject = z.record(z.string(), z.json());
export const workflowGenerationSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('full'), respectLocks: z.boolean() }).strict(),
  z
    .object({
      mode: z.literal('partial'),
      requestedNodeIds: z.array(identity).min(1),
      respectLocks: z.boolean(),
    })
    .strict(),
]);
export const workflowAdmissionExecutableSchema = z
  .object({
    id: identity,
    versionId: identity,
    organizationId: identity,
    userId: identity,
    brandId: identity.optional(),
    emitSharedEvents: z.boolean().optional(),
    isCustomerWorkflow: z.boolean().optional(),
    nodes: z
      .array(
        z
          .object({
            id: identity,
            type: identity,
            label: z.string(),
            config: jsonObject,
            inputs: z.array(z.string()),
            isLocked: z.boolean().optional(),
            cachedOutput: z.json().optional(),
          })
          .strict(),
      )
      .max(MAX_EXECUTION_NODES),
    edges: z.array(
      z
        .object({
          id: identity,
          source: identity,
          target: identity,
          sourceHandle: z.string().optional(),
          targetHandle: z.string().optional(),
        })
        .strict(),
    ),
    lockedNodeIds: z.array(identity),
  })
  .strict();
export const workflowAdmissionAvailableSourceSchema = z
  .object({
    version: z.literal(1),
    state: z.literal('available'),
    preparationVersion: z.literal(1),
    requestHash: hash,
    sourceHash: hash,
    organizationId: identity,
    actorUserId: identity,
    apiKeyId: identity.optional(),
    actorScopes: z.array(z.string()).optional(),
    workflowId: identity,
    workflowVersionId: identity,
    workflowVersionContentHash: z.string().regex(/^sha256:v1:[a-f0-9]{64}$/),
    brandId: identity.nullable(),
    trigger: z
      .object({ type: identity, platform: identity, data: jsonObject })
      .strict(),
    selection: workflowGenerationSelectionSchema,
    workflow: workflowAdmissionExecutableSchema,
    selectedNodeIds: z.array(identity),
    initialNodeOutputs: jsonObject,
    initiallyCompletedNodeIds: z.array(identity),
  })
  .strict();
export const workflowAdmissionRedactedSourceSchema = z
  .object({
    version: z.literal(1),
    state: z.literal('redacted'),
    reason: z.literal('execution-payload-retention'),
    requestHash: hash,
    sourceHash: hash,
  })
  .strict();
export const workflowGenerationAdmissionSourceSchema = z.discriminatedUnion(
  'state',
  [
    workflowAdmissionAvailableSourceSchema,
    workflowAdmissionRedactedSourceSchema,
  ],
);

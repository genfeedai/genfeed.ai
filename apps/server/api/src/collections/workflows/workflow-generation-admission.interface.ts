import type {
  workflowAdmissionAvailableSourceSchema,
  workflowAdmissionExecutableSchema,
  workflowAdmissionRedactedSourceSchema,
  workflowGenerationAdmissionSourceSchema,
  workflowGenerationSelectionSchema,
} from '@api/collections/workflows/workflow-generation-admission.schema';
import type { z } from 'zod';

export type WorkflowGenerationSelection = z.infer<
  typeof workflowGenerationSelectionSchema
>;
export type WorkflowAdmissionExecutableV1 = z.infer<
  typeof workflowAdmissionExecutableSchema
>;
export type WorkflowAdmissionAvailableSourceV1 = z.infer<
  typeof workflowAdmissionAvailableSourceSchema
>;
export type WorkflowAdmissionRedactedSourceV1 = z.infer<
  typeof workflowAdmissionRedactedSourceSchema
>;
export type WorkflowGenerationAdmissionSourceV1 = z.infer<
  typeof workflowGenerationAdmissionSourceSchema
>;

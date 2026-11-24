import type { InputVariableValidation } from './workflow-builder.interface';

/**
 * One required workflow input the run was started without, as the API lists it
 * in `meta.missingInputs` of a `WORKFLOW_MISSING_INPUT` error. The definition
 * comes from the workflow's input variable, or from its input node when no
 * variable declares the input.
 */
export interface WorkflowMissingInput {
  name: string;
  label: string;
  /** An `InputVariableType`, or the input node's handle type. */
  type: string;
  description?: string;
  validation?: InputVariableValidation;
}

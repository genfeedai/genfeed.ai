import { describe, expectTypeOf, it } from 'vitest';
import type {
  BatchJobStatus as CompatibilityBatchJobStatus,
  CloudWorkflowData as CompatibilityCloudWorkflowData,
  CreateWorkflowInput as CompatibilityCreateWorkflowInput,
  ExecutionResult as CompatibilityExecutionResult,
  WorkflowTemplate as CompatibilityWorkflowTemplate,
} from './workflow-api';
import type {
  BatchJobStatus,
  CloudWorkflowData,
  CreateWorkflowInput,
  ExecutionResult,
  WorkflowTemplate,
} from './workflow-api.types';

describe('workflow API contract exports', () => {
  it('preserves representative contracts through the compatibility module', () => {
    expectTypeOf<CompatibilityCloudWorkflowData>().toEqualTypeOf<CloudWorkflowData>();
    expectTypeOf<CompatibilityCreateWorkflowInput>().toEqualTypeOf<CreateWorkflowInput>();
    expectTypeOf<CompatibilityExecutionResult>().toEqualTypeOf<ExecutionResult>();
    expectTypeOf<CompatibilityBatchJobStatus>().toEqualTypeOf<BatchJobStatus>();
    expectTypeOf<CompatibilityWorkflowTemplate>().toEqualTypeOf<WorkflowTemplate>();
  });
});

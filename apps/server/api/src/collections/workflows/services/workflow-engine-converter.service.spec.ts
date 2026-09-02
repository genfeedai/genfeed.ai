import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it } from 'vitest';

describe('WorkflowEngineConverterService event isolation', () => {
  const converter = new WorkflowEngineConverterService();

  it('keeps shared workflow events enabled for tenant-owned graphs', () => {
    expect(
      converter.convertToExecutableWorkflow({
        id: 'tenant-workflow',
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }).emitSharedEvents,
    ).toBe(true);
  });

  it('disables shared workflow channels for a global hidden mirror', () => {
    expect(
      converter.convertToExecutableWorkflow({
        id: 'global-workflow',
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: 'youtube-to-long-form-text',
          }),
        },
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }).emitSharedEvents,
    ).toBe(false);
  });
});

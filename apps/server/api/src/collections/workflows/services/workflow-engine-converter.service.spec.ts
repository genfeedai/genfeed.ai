import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
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

describe('WorkflowEngineConverterService customer classification', () => {
  const converter = new WorkflowEngineConverterService();

  it('classifies tenant-owned graphs as customer workflows', () => {
    expect(
      converter.convertToExecutableWorkflow({
        brandId: 'brand-1',
        id: 'tenant-workflow',
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }),
    ).toMatchObject({
      brandId: 'brand-1',
      isCustomerWorkflow: true,
    });
  });

  it('classifies hidden mirrors with system version owners as system workflows', () => {
    expect(
      converter.convertToExecutableWorkflow({
        currentVersion: {
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        },
        id: 'global-workflow',
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: 'youtube-to-long-form-text',
          }),
        },
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }).isCustomerWorkflow,
    ).toBe(false);
  });

  it('treats forged hidden metadata on a customer version as a customer workflow', () => {
    expect(
      converter.convertToExecutableWorkflow({
        currentVersion: {
          organizationId: 'tenant-org',
          userId: 'tenant-user',
        },
        id: 'forged-workflow',
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: 'forged',
          }),
        },
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }).isCustomerWorkflow,
    ).toBe(true);
  });
});

describe('WorkflowEngineConverterService analytics brand resolution', () => {
  const converter = new WorkflowEngineConverterService();

  it.each([
    [{}, 'workflow-brand'],
    [{ brandId: 'node-brand' }, 'node-brand'],
  ])(
    'resolves the workflow brand without replacing an explicit node brand',
    (parameters, expectedBrandId) => {
      const workflow = converter.convertToExecutableWorkflow({
        brandId: 'workflow-brand',
        id: 'workflow',
        organizationId: 'organization',
        userId: 'user',
        nodes: [
          {
            id: 'analytics',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
            data: {
              label: 'Analytics',
              config: { actionId: 'analyticsFeedback', parameters },
            },
          },
        ],
      });

      expect(workflow.nodes[0]?.config).toEqual({
        actionId: 'analyticsFeedback',
        parameters: { brandId: expectedBrandId },
      });
    },
  );
});

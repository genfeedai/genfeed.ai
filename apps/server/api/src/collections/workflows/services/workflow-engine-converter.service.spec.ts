import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { WorkflowMissingInputException } from '@api/helpers/exceptions/workflow-missing-input/workflow-missing-input.exception';
import type { ExecutableWorkflow } from '@genfeedai/workflows/engine';
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

describe('WorkflowEngineConverterService required runtime inputs', () => {
  const converter = new WorkflowEngineConverterService();

  // The synthetic review workflow of #11075: two required template inputs
  // feed a generation branch, and a Library Video input stands alone.
  const workflowDoc = {
    inputVariables: [
      {
        description: 'Camera angle for the generated visual',
        key: 'visualAngle',
        label: 'Visual angle',
        required: true,
        type: 'text',
      },
      {
        key: 'visualStyle',
        label: 'Visual style',
        required: true,
        type: 'select',
        validation: { options: ['Cinematic', 'Flat'] },
      },
    ],
    nodes: [
      {
        data: { config: { inputName: 'visualAngle' }, label: 'Angle' },
        id: 'angle-input',
        position: { x: 0, y: 0 },
        type: 'workflowInput',
      },
      {
        data: { config: { inputName: 'visualStyle' }, label: 'Style' },
        id: 'style-input',
        position: { x: 0, y: 80 },
        type: 'workflowInput',
      },
    ],
  };
  const executable = (): ExecutableWorkflow => ({
    edges: [
      { id: 'e1', source: 'angle-input', target: 'generate' },
      { id: 'e2', source: 'style-input', target: 'generate' },
    ],
    emitSharedEvents: true,
    id: 'wf-1',
    lockedNodeIds: [],
    nodes: [
      {
        config: {},
        id: 'angle-input',
        inputs: [],
        label: 'Angle',
        type: 'workflowInput',
      },
      {
        config: {},
        id: 'style-input',
        inputs: [],
        label: 'Style',
        type: 'workflowInput',
      },
      {
        config: {},
        id: 'generate',
        inputs: [],
        label: 'Generate',
        type: 'imageGen',
      },
      {
        config: {},
        id: 'video',
        inputs: [],
        label: 'Video',
        type: 'input-video',
      },
    ],
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'v1',
  });
  const capture = (run: () => unknown): WorkflowMissingInputException => {
    try {
      run();
    } catch (error) {
      if (error instanceof WorkflowMissingInputException) return error;
      throw error;
    }
    throw new Error('expected the run to be rejected');
  };

  it('lists every missing required input with its definition, not only the first', () => {
    const error = capture(() =>
      converter.applyRuntimeInputValues(workflowDoc, executable(), {}),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.missingInputs).toEqual([
      {
        description: 'Camera angle for the generated visual',
        label: 'Visual angle',
        name: 'visualAngle',
        type: 'text',
      },
      {
        label: 'Visual style',
        name: 'visualStyle',
        type: 'select',
        validation: { options: ['Cinematic', 'Flat'] },
      },
    ]);
  });

  it('stops listing an input once its value is supplied', () => {
    const error = capture(() =>
      converter.applyRuntimeInputValues(workflowDoc, executable(), {
        visualAngle: 'low angle',
      }),
    );

    expect(error.missingInputs.map((input) => input.name)).toEqual([
      'visualStyle',
    ]);
  });

  it('accepts a run once every required input is supplied', () => {
    const result = converter.applyRuntimeInputValues(
      workflowDoc,
      executable(),
      { visualAngle: 'low angle', visualStyle: 'Cinematic' },
      { selectedNodeIds: ['generate'] },
    );

    expect(
      result.nodes.find((node) => node.id === 'angle-input')?.cachedOutput,
    ).toBe('low angle');
    expect(
      result.nodes.find((node) => node.id === 'style-input')?.cachedOutput,
    ).toBe('Cinematic');
  });

  it('requires only the inputs a selected node depends on', () => {
    const error = capture(() =>
      converter.applyRuntimeInputValues(
        workflowDoc,
        executable(),
        { visualAngle: 'low angle' },
        { selectedNodeIds: ['generate'] },
      ),
    );

    expect(error.missingInputs.map((input) => input.name)).toEqual([
      'visualStyle',
    ]);
  });

  it('does not ask a selected node that reads no input for the other branch inputs', () => {
    const result = converter.applyRuntimeInputValues(
      workflowDoc,
      executable(),
      {},
      { selectedNodeIds: ['video'] },
    );

    expect(result.nodes.map((node) => node.id)).toEqual(['generate', 'video']);
    expect(result.edges).toEqual([]);
  });
});

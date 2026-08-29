import { describe, expect, it } from 'vitest';
import {
  type CloudWorkflowFormat,
  type CoreWorkflowFormat,
  detectFormat,
  WorkflowFormatConverterService,
} from './workflow-format-converter.service';

const service = new WorkflowFormatConverterService();

function coreWorkflow(nodes: CoreWorkflowFormat['nodes']): CoreWorkflowFormat {
  return { edges: [], name: 'Workflow', nodes };
}

describe('WorkflowFormatConverterService', () => {
  it('detects explicit action graphs as the persisted cloud format', () => {
    const workflow = coreWorkflow([
      {
        data: {
          config: { actionId: 'imageGen', parameters: {} },
          label: 'Image',
        },
        id: 'image',
        position: { x: 0, y: 0 },
        type: 'genfeedAction',
      },
    ]);

    expect(detectFormat(workflow)).toBe('cloud');
  });

  it('converts editor product nodes to action-backed persisted nodes', () => {
    const result = service.convertCoreToCloud(
      coreWorkflow([
        {
          data: { label: 'Image', model: 'flux', prompt: 'A lighthouse' },
          id: 'image',
          position: { x: 100, y: 200 },
          type: 'imageGen',
        },
      ]),
    );

    expect(result).toMatchObject({
      unmappedNodeTypes: [],
      warnings: [],
      workflow: {
        nodes: [
          {
            data: {
              config: {
                actionId: 'imageGen',
                parameters: { model: 'flux', prompt: 'A lighthouse' },
              },
              label: 'Image',
            },
            id: 'image',
            type: 'genfeedAction',
          },
        ],
      },
    });
  });

  it('preserves and validates existing action envelopes', () => {
    const workflow: CloudWorkflowFormat = {
      edges: [],
      nodes: [
        {
          data: {
            config: {
              actionId: 'promptConstructor',
              parameters: { template: 'Hello {{name}}' },
            },
            label: 'Prompt',
          },
          id: 'prompt',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ],
    };

    expect(service.ensureCloudFormat(workflow).workflow).toEqual(workflow);
  });

  it('converts media presentation nodes to workflow inputs', () => {
    const result = service.convertCoreToCloud(
      coreWorkflow([
        {
          data: {
            image: 'https://example.com/reference.png',
            label: 'Reference',
          },
          id: 'reference',
          position: { x: 0, y: 0 },
          type: 'imageInput',
        },
      ]),
    );

    expect(result.workflow.nodes[0]).toMatchObject({
      data: {
        config: {
          defaultValue: 'https://example.com/reference.png',
          inputName: 'reference',
          inputType: 'image',
          required: false,
        },
      },
      type: 'workflowInput',
    });
  });

  it('converts prompt presentation nodes to workflow inputs', () => {
    const result = service.convertCoreToCloud(
      coreWorkflow([
        {
          data: { label: 'Brief', text: 'Write a launch article' },
          id: 'brief',
          position: { x: 0, y: 0 },
          type: 'input-prompt',
        },
      ]),
    );

    expect(result.workflow.nodes[0]).toMatchObject({
      data: {
        config: {
          defaultValue: 'Write a launch article',
          inputName: 'brief',
          inputType: 'text',
          required: false,
        },
      },
      type: 'workflowInput',
    });
  });

  it('preserves engine-native control nodes', () => {
    const result = service.convertCoreToCloud(
      coreWorkflow([
        {
          data: { expression: 'score > 10', label: 'Branch' },
          id: 'branch',
          position: { x: 0, y: 0 },
          type: 'condition',
        },
      ]),
    );

    expect(result.workflow.nodes[0]).toMatchObject({
      data: { config: { expression: 'score > 10' } },
      type: 'condition',
    });
  });

  it('fails closed for unsupported product nodes', () => {
    expect(() =>
      service.convertCoreToCloud(
        coreWorkflow([
          {
            data: { label: 'Unknown' },
            id: 'unknown',
            position: { x: 0, y: 0 },
            type: 'unregistered-operation',
          },
        ]),
      ),
    ).toThrow(/unsupported product node type/);
  });

  it('hydrates action nodes back to editor presentation nodes', () => {
    const result = service.convertCloudToCore({
      edges: [],
      nodes: [
        {
          data: {
            config: {
              actionId: 'effect-captions',
              parameters: { language: 'en' },
            },
            label: 'Captions',
          },
          id: 'captions',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ],
    });

    expect(result.workflow.nodes[0]).toMatchObject({
      data: { label: 'Captions', language: 'en', status: 'idle' },
      type: 'captionGen',
    });
  });
});

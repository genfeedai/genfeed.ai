import { describe, expect, it } from 'vitest';

import { extractWorkflowInputs, type WorkflowDefinition } from './bot-workflow';

describe('extractWorkflowInputs', () => {
  it('returns empty array when workflow has no nodes', () => {
    const workflow: WorkflowDefinition = { id: 'wf-1', name: 'Test' };
    expect(extractWorkflowInputs(workflow)).toEqual([]);
  });

  it('returns empty array when nodes is an empty object', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {},
    };
    expect(extractWorkflowInputs(workflow)).toEqual([]);
  });

  it('extracts a text input node correctly', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-1': {
          type: 'input',
          data: {
            label: 'Prompt',
            inputType: 'text',
            defaultValue: 'hello world',
            required: true,
          },
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toEqual({
      nodeId: 'node-1',
      label: 'Prompt',
      inputType: 'text',
      defaultValue: 'hello world',
      required: true,
    });
  });

  it('extracts an image input node correctly', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-img': {
          type: 'input',
          data: {
            label: 'Reference image',
            inputType: 'image',
          },
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].inputType).toBe('image');
    expect(inputs[0].required).toBe(true); // defaults to true when undefined
  });

  it('uses nodeId as label when data.label is absent', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-unlabelled': {
          type: 'input',
          data: { inputType: 'text' },
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs[0].label).toBe('node-unlabelled');
  });

  it('defaults inputType to "text" when not specified', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-1': {
          type: 'input',
          data: {},
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs[0].inputType).toBe('text');
  });

  it('skips non-input node types', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'model-node': { type: 'flux-model', data: {} },
        'output-node': { type: 'output', data: {} },
        'input-node': {
          type: 'input',
          data: { label: 'Prompt', inputType: 'text' },
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].nodeId).toBe('input-node');
  });

  it('skips input nodes that have no data', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-nodata': { type: 'input' },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs).toHaveLength(0);
  });

  it('extracts multiple ordered inputs', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        a: { type: 'input', data: { label: 'A', inputType: 'text' } },
        b: { type: 'input', data: { label: 'B', inputType: 'image' } },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs).toHaveLength(2);
    // Both must be present; order follows Object.entries which is insertion order in V8
    const labels = inputs.map((i) => i.label);
    expect(labels).toContain('A');
    expect(labels).toContain('B');
  });

  it('treats required: false correctly', () => {
    const workflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'Test',
      nodes: {
        'node-opt': {
          type: 'input',
          data: { label: 'Optional', inputType: 'text', required: false },
        },
      },
    };

    const inputs = extractWorkflowInputs(workflow);
    expect(inputs[0].required).toBe(false);
  });
});

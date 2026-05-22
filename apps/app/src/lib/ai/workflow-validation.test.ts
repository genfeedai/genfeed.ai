import { describe, expect, it } from 'vitest';
import {
  parseJSONFromResponse,
  repairWorkflowJSON,
  validateWorkflowJSON,
} from './workflow-validation';

const validNodes = [
  {
    data: { prompt: 'Launch copy' },
    id: 'prompt-1',
    position: { x: 0, y: 0 },
    type: 'prompt',
  },
  {
    data: { inputPrompt: null },
    id: 'image-1',
    position: { x: 100, y: 0 },
    type: 'imageGen',
  },
];

const validEdge = {
  id: 'edge-1',
  source: 'prompt-1',
  sourceHandle: 'text',
  target: 'image-1',
  targetHandle: 'prompt',
};

describe('parseJSONFromResponse', () => {
  it('extracts direct, fenced, and embedded workflow JSON', () => {
    const workflow = {
      description: 'Generated',
      edges: [validEdge],
      name: 'Launch workflow',
      nodes: validNodes,
    };

    expect(parseJSONFromResponse(JSON.stringify(workflow))).toEqual(workflow);
    expect(
      parseJSONFromResponse(
        `Here is the workflow:\n\`\`\`json\n${JSON.stringify(workflow)}\n\`\`\``,
      ),
    ).toEqual(workflow);
    const embeddedWorkflow = {
      name: 'Launch workflow',
      description: 'Generated',
      nodes: validNodes,
      edges: [validEdge],
    };
    expect(
      parseJSONFromResponse(
        `prefix ${JSON.stringify(embeddedWorkflow)} suffix`,
      ),
    ).toEqual(embeddedWorkflow);
  });

  it('returns null for malformed responses', () => {
    expect(parseJSONFromResponse('{bad json')).toBeNull();
    expect(parseJSONFromResponse('```json\n{bad json}\n```')).toBeNull();
    expect(parseJSONFromResponse('no workflow here')).toBeNull();
  });
});

describe('validateWorkflowJSON', () => {
  it('accepts compatible generated workflow graphs', () => {
    expect(
      validateWorkflowJSON({
        description: 'Generated',
        edges: [validEdge],
        name: 'Launch workflow',
        nodes: validNodes,
      }),
    ).toEqual({ errors: [], valid: true, warnings: [] });
  });

  it('reports structural, node, edge, and incompatible handle errors', () => {
    const result = validateWorkflowJSON({
      description: 'Generated',
      edges: [
        validEdge,
        validEdge,
        {
          id: 'missing-source',
          source: 'missing',
          sourceHandle: 'text',
          target: 'image-1',
          targetHandle: 'prompt',
        },
        {
          id: 'missing-target',
          source: 'prompt-1',
          sourceHandle: 'text',
          target: 'missing',
          targetHandle: 'prompt',
        },
        {
          id: 'missing-handles',
          source: 'prompt-1',
          sourceHandle: '',
          target: 'image-1',
          targetHandle: '',
        },
        {
          id: 'incompatible',
          source: 'prompt-1',
          sourceHandle: 'text',
          target: 'download-1',
          targetHandle: 'image',
        },
      ],
      name: '',
      nodes: [
        ...validNodes,
        validNodes[0],
        {
          data: null,
          id: '',
          position: { x: 'bad', y: null },
          type: '',
        },
        {
          data: {},
          id: 'legacy-1',
          position: { x: 0, y: 0 },
          type: 'legacy',
        },
        {
          data: {},
          id: 'download-1',
          position: { x: 200, y: 0 },
          type: 'download',
        },
      ],
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing or invalid workflow name',
        'Duplicate node id: prompt-1',
        'Node missing id',
        'Node  missing type',
        'Node  missing or invalid position',
        'Node  missing data',
        'Node legacy-1 has invalid type: legacy',
        'Duplicate edge id: edge-1',
        'Edge missing-source references non-existent source: missing',
        'Edge missing-target references non-existent target: missing',
        'Edge missing-handles missing sourceHandle',
        'Edge missing-handles missing targetHandle',
        'Edge incompatible: incompatible types text → image (prompt.text → download.image)',
      ]),
    );
  });

  it('warns on unknown handles and short-circuits invalid arrays', () => {
    expect(
      validateWorkflowJSON({
        description: 'Generated',
        edges: [
          {
            id: 'unknown',
            source: 'prompt-1',
            sourceHandle: 'custom-output',
            target: 'image-1',
            targetHandle: 'custom-input',
          },
        ],
        name: 'Unknown handles',
        nodes: validNodes,
      }),
    ).toEqual({
      errors: [],
      valid: true,
      warnings: [
        'Edge unknown: unknown source handle "custom-output" on prompt',
        'Edge unknown: unknown target handle "custom-input" on imageGen',
      ],
    });

    expect(
      validateWorkflowJSON({
        description: '',
        edges: [],
        name: 'Bad nodes',
        nodes: null,
      } as never),
    ).toEqual({
      errors: ['nodes must be an array'],
      valid: false,
      warnings: [],
    });

    expect(
      validateWorkflowJSON({
        description: '',
        edges: null,
        name: 'Bad edges',
        nodes: [],
      } as never),
    ).toEqual({
      errors: ['edges must be an array'],
      valid: false,
      warnings: [],
    });
  });
});

describe('repairWorkflowJSON', () => {
  it('fills missing metadata, arrays, ids, positions, and node defaults', () => {
    const repaired = repairWorkflowJSON({
      description: null,
      edges: null,
      name: '',
      nodes: [
        {
          data: null,
          id: '',
          position: null,
          type: 'prompt',
        },
        {
          data: { label: 'Duplicate prompt' },
          id: '',
          position: { x: 10, y: 20 },
          type: 'prompt',
        },
      ],
    } as never);

    expect(repaired).toMatchObject({
      description: '',
      name: 'Generated Workflow',
    });
    expect(repaired.edges).toEqual([]);
    expect(repaired.nodes).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Prompt',
          prompt: '',
          status: 'idle',
        }),
        id: 'node-repair-1',
        position: { x: 100, y: 200 },
        type: 'prompt',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Duplicate prompt',
          prompt: '',
          status: 'idle',
        }),
        id: 'node-repair-2',
        position: { x: 10, y: 20 },
        type: 'prompt',
      }),
    ]);
  });

  it('repairs edge ids and removes invalid, incomplete, and incompatible edges', () => {
    const repaired = repairWorkflowJSON({
      description: 'Generated',
      edges: [
        {
          id: '',
          source: 'prompt-1',
          sourceHandle: 'text',
          target: 'image-1',
          targetHandle: 'prompt',
        },
        {
          id: '',
          source: 'missing',
          sourceHandle: 'text',
          target: 'image-1',
          targetHandle: 'prompt',
        },
        {
          id: 'missing-target',
          source: 'prompt-1',
          sourceHandle: 'text',
          target: 'missing',
          targetHandle: 'prompt',
        },
        {
          id: 'missing-handle',
          source: 'prompt-1',
          sourceHandle: '',
          target: 'image-1',
          targetHandle: 'prompt',
        },
        {
          id: 'incompatible',
          source: 'prompt-1',
          sourceHandle: 'text',
          target: 'download-1',
          targetHandle: 'image',
        },
      ],
      name: 'Valid workflow',
      nodes: [
        {
          data: {},
          id: 'prompt-1',
          position: { x: 0, y: 0 },
          type: 'prompt',
        },
        {
          data: {},
          id: 'image-1',
          position: { x: 100, y: 0 },
          type: 'imageGen',
        },
        {
          data: {},
          id: 'download-1',
          position: { x: 200, y: 0 },
          type: 'download',
        },
      ],
    });

    expect(repaired.edges).toEqual([
      {
        id: 'edge-repair-1',
        source: 'prompt-1',
        sourceHandle: 'text',
        target: 'image-1',
        targetHandle: 'prompt',
      },
    ]);
  });

  it('keeps edges with unknown handles when node endpoints exist', () => {
    const repaired = repairWorkflowJSON({
      description: 'Generated',
      edges: [
        {
          id: 'unknown-handles',
          source: 'prompt-1',
          sourceHandle: 'custom-output',
          target: 'image-1',
          targetHandle: 'custom-input',
        },
      ],
      name: 'Unknown handles',
      nodes: [
        {
          data: {},
          id: 'prompt-1',
          position: { x: 0, y: 0 },
          type: 'prompt',
        },
        {
          data: {},
          id: 'image-1',
          position: { x: 100, y: 0 },
          type: 'imageGen',
        },
      ],
    });

    expect(repaired.edges).toEqual([
      {
        id: 'unknown-handles',
        source: 'prompt-1',
        sourceHandle: 'custom-output',
        target: 'image-1',
        targetHandle: 'custom-input',
      },
    ]);
  });

  it('drops invalid legacy node types instead of rewriting them', () => {
    const repaired = repairWorkflowJSON({
      description: '',
      edges: [
        {
          id: 'edge-1',
          source: 'legacy-node',
          sourceHandle: 'text',
          target: 'prompt-node',
          targetHandle: 'prompt',
        },
      ],
      name: 'Test Workflow',
      nodes: [
        {
          data: {},
          id: 'legacy-node',
          position: { x: 0, y: 0 },
          type: 'text_input',
        },
        {
          data: { label: 'Prompt', prompt: '', status: 'idle' },
          id: 'prompt-node',
          position: { x: 120, y: 0 },
          type: 'prompt',
        },
      ],
    });

    expect(repaired.nodes).toEqual([
      expect.objectContaining({
        id: 'prompt-node',
        type: 'prompt',
      }),
    ]);
    expect(repaired.edges).toEqual([]);
  });
});

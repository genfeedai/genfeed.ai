import { describe, expect, it } from 'vitest';
import {
  FALLBACK_WORKFLOW_NODE_TYPE,
  normalizeWorkflowNodeCollection,
  normalizeWorkflowNodeTypes,
  restoreWorkflowNodeTypes,
  type WorkflowNodeLike,
} from './node-type-normalization';

describe('node type normalization', () => {
  it('maps unsupported node types to a render-safe fallback', () => {
    const nodes = [
      {
        data: { label: 'Supported' },
        id: '1',
        position: { x: 0, y: 0 },
        type: 'brand',
      },
      {
        data: { label: 'Legacy' },
        id: '2',
        position: { x: 1, y: 1 },
        type: 'legacy-node',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(nodes, new Set(['brand']));

    const supportedNode = normalized[0];
    const fallbackNode = normalized[1];

    expect(supportedNode).toBeDefined();
    expect(fallbackNode).toBeDefined();
    expect(supportedNode.type).toBe('brand');
    expect(fallbackNode.type).toBe(FALLBACK_WORKFLOW_NODE_TYPE);
    expect(fallbackNode.data?.originalType).toBe('legacy-node');
    expect(fallbackNode.data?.label).toBe('Legacy');
  });

  it('hydrates supported nodes with a render-safe data object and label', () => {
    const nodes = [
      {
        id: '1',
        position: { x: 0, y: 0 },
        type: 'brand',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(nodes, new Set(['brand']));

    const supportedNode = normalized[0];

    expect(supportedNode).toBeDefined();
    expect(supportedNode.type).toBe('brand');
    expect(supportedNode.data).toEqual({ label: 'Read Brand' });
  });

  it('hydrates extended cloud nodes with their definition label', () => {
    const nodes = [
      {
        id: '1',
        position: { x: 0, y: 0 },
        type: 'captionGen',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(
      nodes,
      new Set(['captionGen']),
    );

    const supportedNode = normalized[0];

    expect(supportedNode).toBeDefined();
    expect(supportedNode.type).toBe('captionGen');
    expect(supportedNode.data).toEqual({ label: 'Caption Generator' });
  });

  it('hydrates persisted action nodes into their editor presentation types', () => {
    const nodes = [
      {
        data: {
          config: { actionId: 'imageGen', parameters: { model: 'flux' } },
          label: 'Image',
        },
        id: '1',
        position: { x: 0, y: 0 },
        type: 'genfeedAction',
      },
      {
        data: {
          config: {
            actionId: 'effect-captions',
            parameters: { language: 'en' },
          },
          label: 'Captions',
        },
        id: '2',
        position: { x: 0, y: 0 },
        type: 'genfeedAction',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(
      nodes,
      new Set(['imageGen', 'captionGen', 'genfeedAction']),
    );

    expect(normalized.map((node) => node.type)).toEqual([
      'imageGen',
      'captionGen',
    ]);
    expect(normalized[0]?.data).toMatchObject({
      actionId: 'imageGen',
      model: 'flux',
    });
  });

  it('keeps persisted product operations in the action envelope when aliases are hidden', () => {
    const normalized = normalizeWorkflowNodeTypes(
      [
        {
          data: {
            config: {
              actionId: 'socialRead',
              parameters: { platform: 'twitter' },
            },
            label: 'Read social posts',
          },
          id: 'read-social',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ],
      new Set(['genfeedAction']),
    );

    expect(normalized[0]).toMatchObject({
      data: {
        actionId: 'socialRead',
        label: 'Read social posts',
        parameters: { platform: 'twitter' },
      },
      type: 'genfeedAction',
    });
  });

  it('injects a safe default position when persisted nodes are missing x/y', () => {
    const nodes = [
      {
        id: '1',
        position: {},
        type: 'brand',
      },
      {
        id: '2',
        type: 'legacy-node',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(nodes, new Set(['brand']));

    expect(normalized[0]?.position).toEqual({ x: 0, y: 0 });
    expect(normalized[1]?.position).toEqual({ x: 0, y: 0 });
  });

  it('repairs missing and duplicate node ids before render', () => {
    const nodes = [
      {
        id: 'brand-node',
        position: { x: 0, y: 0 },
        type: 'brand',
      },
      {
        id: 'brand-node',
        position: { x: 10, y: 20 },
        type: 'brand',
      },
      {
        id: '   ',
        position: { x: 30, y: 40 },
        type: 'captionGen',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeCollection(
      nodes,
      new Set(['brand', 'captionGen']),
    );

    expect(normalized.nodes.map((node) => node.id)).toEqual([
      'brand-node',
      'brand-node-2',
      'captionGen-3',
    ]);
    expect(normalized.repairs).toEqual([
      {
        index: 1,
        kind: 'duplicate-id',
        nextId: 'brand-node-2',
        originalId: 'brand-node',
        type: 'brand',
      },
      {
        index: 2,
        kind: 'missing-id',
        nextId: 'captionGen-3',
        originalId: null,
        type: 'captionGen',
      },
    ]);
  });

  it('drops malformed unknown nodes that have no recoverable type metadata', () => {
    const nodes = [
      {
        id: 'broken-node',
        position: { x: 0, y: 0 },
        type: 'unknown',
      },
      {
        data: { label: 'Legacy Caption' },
        id: 'legacy-caption',
        position: { x: 10, y: 10 },
        type: 'caption',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeCollection(
      nodes,
      new Set(['captionGen']),
    );

    expect(normalized.nodes).toHaveLength(1);
    expect(normalized.nodes[0]?.id).toBe('legacy-caption');
    expect(normalized.repairs).toContainEqual({
      index: 0,
      kind: 'dropped-malformed-node',
      nextId: '',
      originalId: 'broken-node',
      type: 'unknown',
    });
  });

  it('fails closed instead of restoring an unsupported product node', () => {
    const nodes = [
      {
        data: {
          label: 'Legacy',
          originalType: 'legacy-node',
        },
        id: '2',
        position: { x: 1, y: 1 },
        type: FALLBACK_WORKFLOW_NODE_TYPE,
      },
    ] as WorkflowNodeLike[];

    expect(() => restoreWorkflowNodeTypes(nodes)).toThrow(
      'uses unsupported product node type legacy-node',
    );
  });

  it('fails closed when an unsupported node bypasses load normalization', () => {
    expect(() =>
      restoreWorkflowNodeTypes([
        {
          data: { label: 'Unsupported' },
          id: 'unsupported',
          position: { x: 0, y: 0 },
          type: 'unsupported-product-operation',
        },
      ]),
    ).toThrow(
      'uses unsupported product node type unsupported-product-operation',
    );
  });

  it('fails closed for a persisted action ID outside the action catalog', () => {
    expect(() =>
      restoreWorkflowNodeTypes([
        {
          data: {
            actionId: 'missing.action',
            label: 'Missing action',
          },
          id: 'missing-action',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ]),
    ).toThrow('uses unsupported product node type genfeedAction');
  });

  it('folds editor prompt text into data.config before save', () => {
    const restored = restoreWorkflowNodeTypes([
      {
        data: { label: 'Prompt', prompt: 'Write a FUD News brief' },
        id: 'PyHRz6uB',
        position: { x: 0, y: 0 },
        type: 'prompt',
      },
      {
        data: { label: 'Constructor', template: 'Hello {{topic}}' },
        id: 'constructor-1',
        position: { x: 0, y: 0 },
        type: 'promptConstructor',
      },
    ] as WorkflowNodeLike[]);

    // The prompt node is a source node, not an action: it persists as the
    // engine's text `workflowInput`, the same way the media input nodes do.
    expect(restored[0]).toMatchObject({
      data: {
        config: {
          defaultValue: 'Write a FUD News brief',
          inputName: 'PyHRz6uB',
          inputType: 'text',
          required: false,
        },
        label: 'Prompt',
      },
      type: 'workflowInput',
    });
    expect(restored[0]?.data).not.toHaveProperty('prompt');
    expect(restored[1]).toMatchObject({
      data: {
        config: {
          actionId: 'promptConstructor',
          parameters: { template: 'Hello {{topic}}' },
        },
        label: 'Constructor',
      },
      type: 'genfeedAction',
    });
    expect(restored[1]?.data).not.toHaveProperty('template');
  });

  it('hydrates persisted data.config back onto editor prompt fields', () => {
    const normalized = normalizeWorkflowNodeTypes(
      [
        {
          data: {
            config: {
              actionId: 'promptConstructor',
              parameters: { template: 'Hello {{topic}}' },
            },
            label: 'Constructor',
          },
          id: 'constructor-1',
          position: { x: 0, y: 0 },
          type: 'genfeedAction',
        },
      ] as WorkflowNodeLike[],
      new Set(['promptConstructor']),
    );

    expect(normalized[0]?.data).toMatchObject({
      label: 'Constructor',
      template: 'Hello {{topic}}',
    });
  });

  it('persists product editor nodes as action-backed nodes', () => {
    const nodes = [
      {
        data: { label: 'Input' },
        id: '1',
        position: { x: 0, y: 0 },
        type: 'workflowInput',
      },
      {
        data: { label: 'Output' },
        id: '2',
        position: { x: 0, y: 0 },
        type: 'workflowOutput',
      },
      {
        data: { label: 'Image' },
        id: '3',
        position: { x: 0, y: 0 },
        type: 'imageGen',
      },
      {
        data: { label: 'Prompt' },
        id: '4',
        position: { x: 0, y: 0 },
        type: 'promptConstructor',
      },
    ] as WorkflowNodeLike[];

    const restored = restoreWorkflowNodeTypes(nodes);

    expect(restored.map((node) => node.type)).toEqual([
      'workflowInput',
      'genfeedAction',
      'genfeedAction',
      'genfeedAction',
    ]);
    expect(restored.slice(1).map((node) => node.data?.config)).toEqual([
      { actionId: 'workflow.collect-output', parameters: {} },
      { actionId: 'imageGen', parameters: {} },
      { actionId: 'promptConstructor', parameters: {} },
    ]);
  });

  it('persists media input presentation nodes as workflow inputs', () => {
    const [restored] = restoreWorkflowNodeTypes([
      {
        data: { image: 'https://example.com/input.png', label: 'Reference' },
        id: 'reference-image',
        position: { x: 0, y: 0 },
        type: 'imageInput',
      },
    ]);

    expect(restored).toMatchObject({
      data: {
        config: {
          defaultValue: 'https://example.com/input.png',
          inputName: 'reference-image',
          inputType: 'image',
          required: false,
        },
        label: 'Reference',
      },
      type: 'workflowInput',
    });
  });
});

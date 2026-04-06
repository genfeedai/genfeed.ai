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
    expect(supportedNode.data).toEqual({ label: 'Brand' });
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

  it('normalizes legacy template aliases to canonical editor node types', () => {
    const nodes = [
      {
        id: '1',
        position: { x: 0, y: 0 },
        type: 'workflow-input',
      },
      {
        id: '2',
        position: { x: 0, y: 0 },
        type: 'workflow-output',
      },
      {
        id: '3',
        position: { x: 0, y: 0 },
        type: 'ai-generate-image',
      },
      {
        id: '4',
        position: { x: 0, y: 0 },
        type: 'ai-prompt-constructor',
      },
    ] as WorkflowNodeLike[];

    const normalized = normalizeWorkflowNodeTypes(
      nodes,
      new Set([
        'workflowInput',
        'workflowOutput',
        'imageGen',
        'promptConstructor',
      ]),
    );

    expect(normalized.map((node) => node.type)).toEqual([
      'workflowInput',
      'workflowOutput',
      'imageGen',
      'promptConstructor',
    ]);
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

  it('restores the original type before save', () => {
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

    const restored = restoreWorkflowNodeTypes(nodes);

    const restoredNode = restored[0];

    expect(restoredNode).toBeDefined();
    expect(restoredNode.type).toBe('legacy-node');
    expect(restoredNode.data?.originalType).toBeUndefined();
    expect(restoredNode.data?.label).toBe('Legacy');
  });

  it('restores canonical editor aliases to legacy api types before save', () => {
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

    expect(restoreWorkflowNodeTypes(nodes).map((node) => node.type)).toEqual([
      'workflow-input',
      'workflow-output',
      'ai-generate-image',
      'ai-prompt-constructor',
    ]);
  });
});

import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '@workflow-engine/types';
import {
  getInputNodes,
  getOutputNodes,
  hasInputNodes,
  hasOutputNodes,
  validateNodeConfig,
  validateWorkflow,
} from '@workflow-engine/validation/workflow-validator';
import { describe, expect, it } from 'vitest';

function makeNode(
  id: string,
  type = 'generate',
  overrides: Partial<ExecutableNode> = {},
): ExecutableNode {
  return {
    config: {},
    id,
    inputs: [],
    label: id,
    type,
    ...overrides,
  };
}

function makeEdge(
  source: string,
  target: string,
  overrides: Partial<ExecutableEdge> = {},
): ExecutableEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...overrides,
  };
}

function makeWorkflow(
  nodes: ExecutableNode[],
  edges: ExecutableEdge[] = [],
  overrides: Partial<ExecutableWorkflow> = {},
): ExecutableWorkflow {
  return {
    edges,
    id: 'wf-1',
    lockedNodeIds: [],
    nodes,
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('validateWorkflow', () => {
  it('should return valid for a well-formed workflow', () => {
    const workflow = makeWorkflow(
      [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
      [makeEdge('n1', 'n2')],
    );

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error when workflow ID is missing', () => {
    const workflow = makeWorkflow([makeNode('n1')], [], { id: '' });

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_ID' }),
    );
  });

  it('should return error when organization ID is missing', () => {
    const workflow = makeWorkflow([makeNode('n1')], [], {
      organizationId: '',
    });

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_ORG' }),
    );
  });

  it('should return error when workflow has no nodes', () => {
    const workflow = makeWorkflow([]);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'NO_NODES' }),
    );
  });

  it('should return error when workflow has too many nodes', () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeNode(`n${i}`, 'generate'),
    );
    const workflow = makeWorkflow(nodes);

    const result = validateWorkflow(workflow, { maxNodes: 3 });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'TOO_MANY_NODES' }),
    );
  });

  it('should use default maxNodes of 100', () => {
    const nodes = Array.from({ length: 101 }, (_, i) =>
      makeNode(`n${i}`, 'generate'),
    );
    const workflow = makeWorkflow(nodes);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'TOO_MANY_NODES' }),
    );
  });

  it('should return error for duplicate node IDs', () => {
    const workflow = makeWorkflow([
      makeNode('n1', 'generate'),
      makeNode('n1', 'upscale'),
    ]);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_NODE_ID',
        nodeId: 'n1',
      }),
    );
  });

  it('should return error when a node is missing type', () => {
    const workflow = makeWorkflow([makeNode('n1', '')]);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_NODE_TYPE',
        nodeId: 'n1',
      }),
    );
  });

  it('should return warning when a node is missing label', () => {
    const workflow = makeWorkflow([makeNode('n1', 'generate', { label: '' })]);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_NODE_LABEL',
        nodeId: 'n1',
      }),
    );
  });

  it('should return error for duplicate edge IDs', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e1', source: 'n2', target: 'n3' },
      ],
    );

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_EDGE_ID' }),
    );
  });

  it('should return error when edge references non-existent source', () => {
    const workflow = makeWorkflow(
      [makeNode('n1')],
      [makeEdge('nonexistent', 'n1')],
    );

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_EDGE_SOURCE' }),
    );
  });

  it('should return error when edge references non-existent target', () => {
    const workflow = makeWorkflow(
      [makeNode('n1')],
      [makeEdge('n1', 'nonexistent')],
    );

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_EDGE_TARGET' }),
    );
  });

  it('should return error for self-loop edges', () => {
    const workflow = makeWorkflow([makeNode('n1')], [makeEdge('n1', 'n1')]);

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'SELF_LOOP' }),
    );
  });

  describe('cycle detection', () => {
    it('should detect a simple cycle A->B->A', () => {
      const workflow = makeWorkflow(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B'), makeEdge('B', 'A')],
      );

      const result = validateWorkflow(workflow);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'CYCLE_DETECTED' }),
      );
    });

    it('should detect a 3-node cycle A->B->C->A', () => {
      const workflow = makeWorkflow(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')],
      );

      const result = validateWorkflow(workflow);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'CYCLE_DETECTED' }),
      );
    });

    it('should not flag a DAG as having a cycle', () => {
      // Diamond: A->B, A->C, B->D, C->D
      const workflow = makeWorkflow(
        [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')],
        [
          makeEdge('A', 'B'),
          makeEdge('A', 'C'),
          makeEdge('B', 'D'),
          makeEdge('C', 'D'),
        ],
      );

      const result = validateWorkflow(workflow);

      expect(result.isValid).toBe(true);
      const cycleErrors = result.errors.filter(
        (e) => e.code === 'CYCLE_DETECTED',
      );
      expect(cycleErrors).toHaveLength(0);
    });
  });

  describe('disconnected node detection', () => {
    it('should warn about disconnected nodes when checkDisconnected is true', () => {
      const workflow = makeWorkflow(
        [makeNode('n1'), makeNode('n2'), makeNode('n3')],
        [makeEdge('n1', 'n2')],
      );

      const result = validateWorkflow(workflow, { checkDisconnected: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DISCONNECTED_NODE',
          nodeId: 'n3',
        }),
      );
    });

    it('should not warn about disconnected nodes when checkDisconnected is false', () => {
      const workflow = makeWorkflow(
        [makeNode('n1'), makeNode('n2'), makeNode('n3')],
        [makeEdge('n1', 'n2')],
      );

      const result = validateWorkflow(workflow, { checkDisconnected: false });

      const disconnectedWarnings = result.warnings.filter(
        (w) => w.code === 'DISCONNECTED_NODE',
      );
      expect(disconnectedWarnings).toHaveLength(0);
    });

    it('should not check disconnected when there is only one node', () => {
      const workflow = makeWorkflow([makeNode('n1')]);

      const result = validateWorkflow(workflow, { checkDisconnected: true });

      const disconnectedWarnings = result.warnings.filter(
        (w) => w.code === 'DISCONNECTED_NODE',
      );
      expect(disconnectedWarnings).toHaveLength(0);
    });
  });

  describe('required node types', () => {
    it('should return error when required node type is missing', () => {
      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const result = validateWorkflow(workflow, {
        requiredNodeTypes: ['publish'],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_REQUIRED_TYPE' }),
      );
    });

    it('should pass when all required node types are present', () => {
      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'publish')],
        [makeEdge('n1', 'n2')],
      );

      const result = validateWorkflow(workflow, {
        requiredNodeTypes: ['generate', 'publish'],
      });

      expect(result.isValid).toBe(true);
    });
  });

  it('should accumulate multiple errors', () => {
    const workflow = makeWorkflow([], [], {
      id: '',
      organizationId: '',
    });

    const result = validateWorkflow(workflow);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('MISSING_ID');
    expect(codes).toContain('MISSING_ORG');
  });
});

describe('validateNodeConfig', () => {
  it('should return no errors for a valid node config', () => {
    const node = makeNode('n1', 'generate', {
      config: { model: 'dall-e', prompt: 'a sunset' },
    });
    const schema = {
      model: { required: true, type: 'string' },
      prompt: { required: true, type: 'string' },
    };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toHaveLength(0);
  });

  it('should return error for missing required field', () => {
    const node = makeNode('n1', 'generate', { config: {} });
    const schema = { prompt: { required: true } };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'prompt',
      nodeId: 'n1',
    });
  });

  it('should treat null as missing for required fields', () => {
    const node = makeNode('n1', 'generate', { config: { prompt: null } });
    const schema = { prompt: { required: true } };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' }),
    );
  });

  it('should treat empty string as missing for required fields', () => {
    const node = makeNode('n1', 'generate', { config: { prompt: '' } });
    const schema = { prompt: { required: true } };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' }),
    );
  });

  it('should return error for wrong field type', () => {
    const node = makeNode('n1', 'generate', { config: { steps: 'ten' } });
    const schema = { steps: { type: 'number' } };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'INVALID_FIELD_TYPE',
      field: 'steps',
      nodeId: 'n1',
    });
  });

  it('should not check type when value is undefined', () => {
    const node = makeNode('n1', 'generate', { config: {} });
    const schema = { steps: { type: 'number' } };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toHaveLength(0);
  });

  it('should return multiple errors for multiple violations', () => {
    const node = makeNode('n1', 'generate', { config: { steps: 'ten' } });
    const schema = {
      prompt: { required: true },
      steps: { type: 'number' },
    };

    const errors = validateNodeConfig(node, schema);

    expect(errors).toHaveLength(2);
    const codes = errors.map((e) => e.code);
    expect(codes).toContain('MISSING_REQUIRED_FIELD');
    expect(codes).toContain('INVALID_FIELD_TYPE');
  });
});

describe('hasInputNodes', () => {
  it('should return true when workflow has input nodes (not targeted by any edge)', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2')],
      [makeEdge('n1', 'n2')],
    );

    expect(hasInputNodes(workflow)).toBe(true);
  });

  it('should return false when all nodes are targets', () => {
    // n1->n2, n2->n1 — both are targets
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2')],
      [makeEdge('n1', 'n2'), makeEdge('n2', 'n1')],
    );

    expect(hasInputNodes(workflow)).toBe(false);
  });

  it('should return true for a single node with no edges', () => {
    const workflow = makeWorkflow([makeNode('n1')]);

    expect(hasInputNodes(workflow)).toBe(true);
  });
});

describe('hasOutputNodes', () => {
  it('should return true when workflow has output nodes (not a source of any edge)', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2')],
      [makeEdge('n1', 'n2')],
    );

    expect(hasOutputNodes(workflow)).toBe(true);
  });

  it('should return false when all nodes are sources', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2')],
      [makeEdge('n1', 'n2'), makeEdge('n2', 'n1')],
    );

    expect(hasOutputNodes(workflow)).toBe(false);
  });

  it('should return true for a single node with no edges', () => {
    const workflow = makeWorkflow([makeNode('n1')]);

    expect(hasOutputNodes(workflow)).toBe(true);
  });
});

describe('getInputNodes', () => {
  it('should return nodes that are not targets of any edge', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [makeEdge('n1', 'n2'), makeEdge('n1', 'n3')],
    );

    const inputNodes = getInputNodes(workflow);

    expect(inputNodes).toHaveLength(1);
    expect(inputNodes[0].id).toBe('n1');
  });

  it('should return all nodes when there are no edges', () => {
    const workflow = makeWorkflow([makeNode('n1'), makeNode('n2')]);

    const inputNodes = getInputNodes(workflow);

    expect(inputNodes).toHaveLength(2);
  });

  it('should return multiple input nodes in a fan-in graph', () => {
    // n1->n3, n2->n3
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [makeEdge('n1', 'n3'), makeEdge('n2', 'n3')],
    );

    const inputNodes = getInputNodes(workflow);

    expect(inputNodes).toHaveLength(2);
    const ids = inputNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['n1', 'n2']);
  });
});

describe('getOutputNodes', () => {
  it('should return nodes that are not sources of any edge', () => {
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [makeEdge('n1', 'n2'), makeEdge('n1', 'n3')],
    );

    const outputNodes = getOutputNodes(workflow);

    expect(outputNodes).toHaveLength(2);
    const ids = outputNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['n2', 'n3']);
  });

  it('should return all nodes when there are no edges', () => {
    const workflow = makeWorkflow([makeNode('n1'), makeNode('n2')]);

    const outputNodes = getOutputNodes(workflow);

    expect(outputNodes).toHaveLength(2);
  });

  it('should return single output node in a chain', () => {
    // n1->n2->n3
    const workflow = makeWorkflow(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
    );

    const outputNodes = getOutputNodes(workflow);

    expect(outputNodes).toHaveLength(1);
    expect(outputNodes[0].id).toBe('n3');
  });
});

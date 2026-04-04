import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/workflows/registry/node-registry', () => ({
  getNodeDefinition: vi.fn(),
  validateConnection: vi.fn(),
}));

import {
  getNodeDefinition,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry';

import {
  type WorkflowEdge,
  WorkflowValidator,
  type WorkflowVisualNode,
} from './workflow.validator';

const mockGetNodeDefinition = vi.mocked(getNodeDefinition);
const mockValidateConnection = vi.mocked(validateConnection);

const knownNodeDef = {
  category: 'processing' as const,
  configSchema: {},
  description: 'A processing node',
  icon: 'icon',
  inputs: { default: { label: 'Input', type: 'any' as const } },
  label: 'Processor',
  outputs: { default: { label: 'Output', type: 'any' as const } },
};

const inputNodeDef = {
  ...knownNodeDef,
  category: 'input' as const,
  inputs: {},
};

function makeNode(id: string, type: string): WorkflowVisualNode {
  return { id, type };
}

function makeEdge(id: string, source: string, target: string): WorkflowEdge {
  return { id, source, target };
}

describe('WorkflowValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNodeDefinition.mockReturnValue(knownNodeDef as never);
    mockValidateConnection.mockReturnValue(true);
  });

  describe('validate()', () => {
    it('returns valid=true for an empty workflow', () => {
      const result = WorkflowValidator.validate({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid=true for a single input node with no edges', () => {
      mockGetNodeDefinition.mockReturnValue(inputNodeDef as never);
      const result = WorkflowValidator.validate({
        nodes: [makeNode('n1', 'source')],
      });
      expect(result.valid).toBe(true);
    });

    it('returns valid=false for unknown node type', () => {
      mockGetNodeDefinition.mockReturnValue(undefined);
      const result = WorkflowValidator.validate({
        nodes: [makeNode('n1', 'unknown-type')],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        message: expect.stringContaining('Unknown node type'),
        nodeId: 'n1',
      });
    });

    it('accumulates errors from multiple invalid nodes', () => {
      mockGetNodeDefinition.mockReturnValue(undefined);
      const result = WorkflowValidator.validate({
        nodes: [makeNode('n1', 'bad1'), makeNode('n2', 'bad2')],
      });
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('validateEdges()', () => {
    it('returns error when source node not found', () => {
      const validator = new WorkflowValidator({
        edges: [makeEdge('e1', 'missing-source', 'n1')],
        nodes: [makeNode('n1', 'processor')],
      });
      const errors = validator.validateEdges();
      expect(errors[0]).toMatchObject({
        edgeId: 'e1',
        message: expect.stringContaining('Source node not found'),
      });
    });

    it('returns error when target node not found', () => {
      const validator = new WorkflowValidator({
        edges: [makeEdge('e1', 'n1', 'missing-target')],
        nodes: [makeNode('n1', 'processor')],
      });
      const errors = validator.validateEdges();
      expect(errors[0]).toMatchObject({
        edgeId: 'e1',
        message: expect.stringContaining('Target node not found'),
      });
    });

    it('returns error for invalid connection between nodes', () => {
      mockValidateConnection.mockReturnValue(false);
      const validator = new WorkflowValidator({
        edges: [makeEdge('e1', 'n1', 'n2')],
        nodes: [makeNode('n1', 'typeA'), makeNode('n2', 'typeB')],
      });
      const errors = validator.validateEdges();
      expect(errors[0]).toMatchObject({
        edgeId: 'e1',
        message: expect.stringContaining('Invalid connection'),
      });
    });

    it('returns no errors for valid connection', () => {
      mockValidateConnection.mockReturnValue(true);
      const validator = new WorkflowValidator({
        edges: [makeEdge('e1', 'n1', 'n2')],
        nodes: [makeNode('n1', 'typeA'), makeNode('n2', 'typeB')],
      });
      expect(validator.validateEdges()).toHaveLength(0);
    });
  });

  describe('validateConnectivity()', () => {
    it('flags non-input node with inputs but no incoming edges', () => {
      const validator = new WorkflowValidator({
        nodes: [makeNode('n1', 'processor')],
      });
      const errors = validator.validateConnectivity();
      expect(errors[0]).toMatchObject({
        message: expect.stringContaining('no incoming connections'),
        nodeId: 'n1',
      });
    });

    it('does not flag input-category node even with no incoming edges', () => {
      mockGetNodeDefinition.mockReturnValue(inputNodeDef as never);
      const validator = new WorkflowValidator({
        nodes: [makeNode('n1', 'source')],
      });
      expect(validator.validateConnectivity()).toHaveLength(0);
    });

    it('does not flag processing node that has an incoming edge', () => {
      mockGetNodeDefinition.mockImplementation((type: string) => {
        if (type === 'source') return inputNodeDef as never;
        return knownNodeDef as never;
      });
      const validator = new WorkflowValidator({
        edges: [makeEdge('e1', 'n0', 'n1')],
        nodes: [makeNode('n0', 'source'), makeNode('n1', 'processor')],
      });
      expect(validator.validateConnectivity()).toHaveLength(0);
    });
  });

  describe('static validate()', () => {
    it('delegates to instance validate and returns same result shape', () => {
      const result = WorkflowValidator.validate({ edges: [], nodes: [] });
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });
  });
});

import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import type { ExecutableNode } from '../types';
import { createExecutableActionNode } from './action-node';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
  filterByBudget,
  getNodeCreditCost,
  hasInsufficientCredits,
} from './credit-calculator';

function makeNode(
  id: string,
  type: string,
  overrides: Partial<ExecutableNode> = {},
): ExecutableNode {
  if (getActionDefinition(type)) {
    return {
      ...createExecutableActionNode({
        actionId: type,
        id,
        label: id,
        parameters: overrides.config ?? {},
      }),
      ...overrides,
      config: {
        actionId: type,
        parameters: overrides.config ?? {},
      },
      type: 'genfeedAction',
    };
  }

  return {
    config: {},
    id,
    inputs: [],
    label: id,
    type,
    ...overrides,
  };
}

describe('calculateCreditEstimate', () => {
  it('should return zero credits for empty node list', () => {
    const result = calculateCreditEstimate([], 100);

    expect(result.totalCredits).toBe(0);
    expect(result.breakdown).toHaveLength(0);
    expect(result.hasInsufficientCredits).toBe(false);
    expect(result.availableCredits).toBe(100);
  });

  it('should calculate cost for a single node using default costs', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'imageGen')], 100);

    expect(result.totalCredits).toBe(5);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toEqual({
      credits: 5,
      nodeId: 'n1',
      nodeType: 'imageGen',
    });
  });

  it('should sum costs for multiple nodes', () => {
    const result = calculateCreditEstimate(
      [
        makeNode('n1', 'imageGen'),
        makeNode('n2', 'videoGen'),
        makeNode('n3', 'upscale'),
      ],
      100,
    );

    // imageGen=5, videoGen=10, upscale=2
    expect(result.totalCredits).toBe(17);
    expect(result.breakdown).toHaveLength(3);
  });

  it('should use custom costs when provided', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'imageGen')], 100, {
      imageGen: 20,
    });

    expect(result.totalCredits).toBe(20);
    expect(result.breakdown[0].credits).toBe(20);
  });

  it('should reject raw product node types', () => {
    expect(() =>
      calculateCreditEstimate([makeNode('n1', 'unknownType')], 100),
    ).toThrow('must use the Genfeed action envelope');
  });

  it('should flag insufficient credits when total exceeds available', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'videoGen')], 5);

    // videoGen = 10, available = 5
    expect(result.hasInsufficientCredits).toBe(true);
  });

  it('should not flag insufficient credits when total equals available', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'videoGen')], 10);

    // videoGen = 10, available = 10
    expect(result.hasInsufficientCredits).toBe(false);
  });

  it('should not flag insufficient credits when under budget', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'effect-captions')],
      100,
    );

    expect(result.hasInsufficientCredits).toBe(false);
  });

  it('should correctly report available credits', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'imageGen')], 42);

    expect(result.availableCredits).toBe(42);
  });
});

describe('getNodeCreditCost', () => {
  it('should return default cost for known node types', () => {
    expect(getNodeCreditCost('imageGen')).toBe(5);
    expect(getNodeCreditCost('videoGen')).toBe(10);
    expect(getNodeCreditCost('upscale')).toBe(2);
    expect(getNodeCreditCost('effect-captions')).toBe(1);
    expect(getNodeCreditCost('talkingHeadScript')).toBe(3);
  });

  it('should return 0 for unknown node types', () => {
    expect(getNodeCreditCost('unknownType')).toBe(0);
    expect(getNodeCreditCost('')).toBe(0);
  });

  it('should return 0 for free node types', () => {
    expect(getNodeCreditCost('output-webhook')).toBe(0);
    expect(getNodeCreditCost('control-branch')).toBe(0);
    expect(getNodeCreditCost('brand')).toBe(0);
    expect(getNodeCreditCost('publish')).toBe(0);
    expect(getNodeCreditCost('input-video')).toBe(0);
  });

  it('should use custom cost when provided', () => {
    expect(getNodeCreditCost('imageGen', { imageGen: 99 })).toBe(99);
  });

  it('should fall back to default if custom cost does not cover the type', () => {
    expect(getNodeCreditCost('imageGen', { upscale: 99 })).toBe(5);
  });
});

describe('hasInsufficientCredits', () => {
  it('should return true when cost exceeds available credits', () => {
    const result = hasInsufficientCredits(
      [makeNode('n1', 'videoGen'), makeNode('n2', 'imageGen')],
      10,
    );

    // 10 + 5 = 15 > 10
    expect(result).toBe(true);
  });

  it('should return false when cost is within budget', () => {
    const result = hasInsufficientCredits(
      [makeNode('n1', 'effect-captions')],
      100,
    );

    expect(result).toBe(false);
  });

  it('should return false when cost equals available credits', () => {
    const result = hasInsufficientCredits([makeNode('n1', 'videoGen')], 10);

    expect(result).toBe(false);
  });

  it('should return false for empty nodes', () => {
    const result = hasInsufficientCredits([], 0);

    expect(result).toBe(false);
  });

  it('should use custom costs when provided', () => {
    const result = hasInsufficientCredits([makeNode('n1', 'imageGen')], 3, {
      imageGen: 100,
    });

    expect(result).toBe(true);
  });
});

describe('filterByBudget', () => {
  it('should include all nodes when budget is sufficient', () => {
    const nodes = [
      makeNode('n1', 'effect-captions'),
      makeNode('n2', 'upscale'),
    ];
    const edges = [{ source: 'n1', target: 'n2' }];

    const result = filterByBudget(nodes, edges, 100);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('should exclude nodes when budget is exceeded', () => {
    const nodes = [makeNode('n1', 'videoGen'), makeNode('n2', 'imageGen')];
    const edges = [{ source: 'n1', target: 'n2' }];

    // videoGen=10, only 10 credits => n1 fits but n2 (5) would make 15
    const result = filterByBudget(nodes, edges, 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });

  it('should return empty array when no nodes fit the budget', () => {
    const nodes = [makeNode('n1', 'videoGen')];

    const result = filterByBudget(nodes, [], 5);

    expect(result).toHaveLength(0);
  });

  it('should process nodes in topological order', () => {
    // n1->n2->n3, each costs 5
    const nodes = [
      makeNode('n1', 'imageGen'),
      makeNode('n2', 'imageGen'),
      makeNode('n3', 'imageGen'),
    ];
    const edges = [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ];

    // Budget allows only 2 nodes (5+5=10)
    const result = filterByBudget(nodes, edges, 10);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('n1');
    expect(result[1].id).toBe('n2');
  });

  it('should handle nodes with no edges', () => {
    const nodes = [
      makeNode('n1', 'effect-captions'),
      makeNode('n2', 'effect-captions'),
    ];

    const result = filterByBudget(nodes, [], 100);

    expect(result).toHaveLength(2);
  });

  it('should use custom costs', () => {
    const nodes = [makeNode('n1', 'effect-captions')];

    // Default caption = 1, custom = 200
    const result = filterByBudget(nodes, [], 50, { 'effect-captions': 200 });

    expect(result).toHaveLength(0);
  });
});

describe('DEFAULT_CREDIT_COSTS', () => {
  it('should have expected values for AI node types', () => {
    expect(DEFAULT_CREDIT_COSTS.imageGen).toBe(5);
    expect(DEFAULT_CREDIT_COSTS.videoGen).toBe(10);
    expect(DEFAULT_CREDIT_COSTS.talkingHeadScript).toBe(3);
  });

  it('should have zero cost for free node types', () => {
    expect(DEFAULT_CREDIT_COSTS.brand).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.brandAsset).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.brandContext).toBe(0);
    expect(DEFAULT_CREDIT_COSTS['control-branch']).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.publish).toBe(0);
    expect(DEFAULT_CREDIT_COSTS['input-video']).toBe(0);
    expect(DEFAULT_CREDIT_COSTS['output-webhook']).toBe(0);
  });

  it('should have expected values for processing node types', () => {
    expect(DEFAULT_CREDIT_COSTS['effect-captions']).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.videoFrameExtract).toBe(2);
    expect(DEFAULT_CREDIT_COSTS['process-resize']).toBe(1);
    expect(DEFAULT_CREDIT_COSTS['process-transform']).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.upscale).toBe(2);
  });
});

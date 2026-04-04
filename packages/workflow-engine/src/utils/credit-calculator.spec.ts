import type { ExecutableNode } from '@workflow-engine/types';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
  filterByBudget,
  getNodeCreditCost,
  groupCostsByCategory,
  hasInsufficientCredits,
} from '@workflow-engine/utils/credit-calculator';
import { describe, expect, it } from 'vitest';

function makeNode(
  id: string,
  type: string,
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

describe('calculateCreditEstimate', () => {
  it('should return zero credits for empty node list', () => {
    const result = calculateCreditEstimate([], 100);

    expect(result.totalCredits).toBe(0);
    expect(result.breakdown).toHaveLength(0);
    expect(result.hasInsufficientCredits).toBe(false);
    expect(result.availableCredits).toBe(100);
  });

  it('should calculate cost for a single node using default costs', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'generateImage')],
      100,
    );

    expect(result.totalCredits).toBe(5);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toEqual({
      credits: 5,
      nodeId: 'n1',
      nodeType: 'generateImage',
    });
  });

  it('should sum costs for multiple nodes', () => {
    const result = calculateCreditEstimate(
      [
        makeNode('n1', 'generateImage'),
        makeNode('n2', 'generateVideo'),
        makeNode('n3', 'upscale'),
      ],
      100,
    );

    // generateImage=5, generateVideo=10, upscale=2
    expect(result.totalCredits).toBe(17);
    expect(result.breakdown).toHaveLength(3);
  });

  it('should use custom costs when provided', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'generateImage')],
      100,
      { generateImage: 20 },
    );

    expect(result.totalCredits).toBe(20);
    expect(result.breakdown[0].credits).toBe(20);
  });

  it('should return 0 credits for unknown node types', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'unknownType')],
      100,
    );

    expect(result.totalCredits).toBe(0);
    expect(result.breakdown[0].credits).toBe(0);
  });

  it('should flag insufficient credits when total exceeds available', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'generateVideo')],
      5,
    );

    // generateVideo = 10, available = 5
    expect(result.hasInsufficientCredits).toBe(true);
  });

  it('should not flag insufficient credits when total equals available', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'generateVideo')],
      10,
    );

    // generateVideo = 10, available = 10
    expect(result.hasInsufficientCredits).toBe(false);
  });

  it('should not flag insufficient credits when under budget', () => {
    const result = calculateCreditEstimate([makeNode('n1', 'caption')], 100);

    expect(result.hasInsufficientCredits).toBe(false);
  });

  it('should correctly report available credits', () => {
    const result = calculateCreditEstimate(
      [makeNode('n1', 'generateImage')],
      42,
    );

    expect(result.availableCredits).toBe(42);
  });
});

describe('getNodeCreditCost', () => {
  it('should return default cost for known node types', () => {
    expect(getNodeCreditCost('generateImage')).toBe(5);
    expect(getNodeCreditCost('generateVideo')).toBe(10);
    expect(getNodeCreditCost('upscale')).toBe(2);
    expect(getNodeCreditCost('caption')).toBe(1);
    expect(getNodeCreditCost('generateMusic')).toBe(8);
  });

  it('should return 0 for unknown node types', () => {
    expect(getNodeCreditCost('unknownType')).toBe(0);
    expect(getNodeCreditCost('')).toBe(0);
  });

  it('should return 0 for free node types', () => {
    expect(getNodeCreditCost('webhook')).toBe(0);
    expect(getNodeCreditCost('delay')).toBe(0);
    expect(getNodeCreditCost('condition')).toBe(0);
    expect(getNodeCreditCost('publish')).toBe(0);
    expect(getNodeCreditCost('rssInput')).toBe(0);
  });

  it('should use custom cost when provided', () => {
    expect(getNodeCreditCost('generateImage', { generateImage: 99 })).toBe(99);
  });

  it('should fall back to default if custom cost does not cover the type', () => {
    expect(getNodeCreditCost('generateImage', { upscale: 99 })).toBe(5);
  });
});

describe('hasInsufficientCredits', () => {
  it('should return true when cost exceeds available credits', () => {
    const result = hasInsufficientCredits(
      [makeNode('n1', 'generateVideo'), makeNode('n2', 'generateImage')],
      10,
    );

    // 10 + 5 = 15 > 10
    expect(result).toBe(true);
  });

  it('should return false when cost is within budget', () => {
    const result = hasInsufficientCredits([makeNode('n1', 'caption')], 100);

    expect(result).toBe(false);
  });

  it('should return false when cost equals available credits', () => {
    const result = hasInsufficientCredits(
      [makeNode('n1', 'generateVideo')],
      10,
    );

    expect(result).toBe(false);
  });

  it('should return false for empty nodes', () => {
    const result = hasInsufficientCredits([], 0);

    expect(result).toBe(false);
  });

  it('should use custom costs when provided', () => {
    const result = hasInsufficientCredits(
      [makeNode('n1', 'generateImage')],
      3,
      { generateImage: 100 },
    );

    expect(result).toBe(true);
  });
});

describe('filterByBudget', () => {
  it('should include all nodes when budget is sufficient', () => {
    const nodes = [makeNode('n1', 'caption'), makeNode('n2', 'upscale')];
    const edges = [{ source: 'n1', target: 'n2' }];

    const result = filterByBudget(nodes, edges, 100);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('should exclude nodes when budget is exceeded', () => {
    const nodes = [
      makeNode('n1', 'generateVideo'),
      makeNode('n2', 'generateImage'),
    ];
    const edges = [{ source: 'n1', target: 'n2' }];

    // generateVideo=10, only 10 credits => n1 fits but n2 (5) would make 15
    const result = filterByBudget(nodes, edges, 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });

  it('should return empty array when no nodes fit the budget', () => {
    const nodes = [makeNode('n1', 'generateVideo')];

    const result = filterByBudget(nodes, [], 5);

    expect(result).toHaveLength(0);
  });

  it('should process nodes in topological order', () => {
    // n1->n2->n3, each costs 5
    const nodes = [
      makeNode('n1', 'generateImage'),
      makeNode('n2', 'generateImage'),
      makeNode('n3', 'generateImage'),
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
    const nodes = [makeNode('n1', 'caption'), makeNode('n2', 'caption')];

    const result = filterByBudget(nodes, [], 100);

    expect(result).toHaveLength(2);
  });

  it('should use custom costs', () => {
    const nodes = [makeNode('n1', 'caption')];

    // Default caption = 1, custom = 200
    const result = filterByBudget(nodes, [], 50, { caption: 200 });

    expect(result).toHaveLength(0);
  });
});

describe('groupCostsByCategory', () => {
  it('should group AI nodes together', () => {
    const nodes = [
      makeNode('n1', 'generateImage'),
      makeNode('n2', 'generateVideo'),
    ];

    const result = groupCostsByCategory(nodes);

    expect(result.ai).toBeDefined();
    expect(result.ai.nodes).toContain('n1');
    expect(result.ai.nodes).toContain('n2');
    expect(result.ai.totalCredits).toBe(15); // 5 + 10
  });

  it('should group input nodes together', () => {
    const nodes = [
      makeNode('n1', 'rssInput'),
      makeNode('n2', 'tweetInput'),
      makeNode('n3', 'brand'),
    ];

    const result = groupCostsByCategory(nodes);

    expect(result.input).toBeDefined();
    expect(result.input.nodes).toHaveLength(3);
    expect(result.input.totalCredits).toBe(0); // all free
  });

  it('should group output nodes together', () => {
    const nodes = [
      makeNode('n1', 'publish'),
      makeNode('n2', 'socialPublish'),
      makeNode('n3', 'webhook'),
    ];

    const result = groupCostsByCategory(nodes);

    expect(result.output).toBeDefined();
    expect(result.output.nodes).toHaveLength(3);
    expect(result.output.totalCredits).toBe(0);
  });

  it('should group control nodes together', () => {
    const nodes = [
      makeNode('n1', 'condition'),
      makeNode('n2', 'delay'),
      makeNode('n3', 'loop'),
    ];

    const result = groupCostsByCategory(nodes);

    expect(result.control).toBeDefined();
    expect(result.control.nodes).toHaveLength(3);
    expect(result.control.totalCredits).toBe(0);
  });

  it('should fall back to processing category for unknown types', () => {
    const nodes = [makeNode('n1', 'resize'), makeNode('n2', 'transform')];

    const result = groupCostsByCategory(nodes);

    expect(result.processing).toBeDefined();
    expect(result.processing.nodes).toHaveLength(2);
    // resize=1, transform=1
    expect(result.processing.totalCredits).toBe(2);
  });

  it('should handle empty node list', () => {
    const result = groupCostsByCategory([]);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should produce multiple categories for mixed node types', () => {
    const nodes = [
      makeNode('n1', 'generateImage'),
      makeNode('n2', 'rssInput'),
      makeNode('n3', 'publish'),
      makeNode('n4', 'condition'),
      makeNode('n5', 'resize'),
    ];

    const result = groupCostsByCategory(nodes);

    expect(Object.keys(result).sort()).toEqual([
      'ai',
      'control',
      'input',
      'output',
      'processing',
    ]);
  });

  it('should use custom costs when provided', () => {
    const nodes = [makeNode('n1', 'generateImage')];

    const result = groupCostsByCategory(nodes, { generateImage: 50 });

    expect(result.ai.totalCredits).toBe(50);
  });
});

describe('DEFAULT_CREDIT_COSTS', () => {
  it('should have expected values for AI node types', () => {
    expect(DEFAULT_CREDIT_COSTS.generateImage).toBe(5);
    expect(DEFAULT_CREDIT_COSTS.generateVideo).toBe(10);
    expect(DEFAULT_CREDIT_COSTS.generateArticle).toBe(3);
    expect(DEFAULT_CREDIT_COSTS.generateMusic).toBe(8);
    expect(DEFAULT_CREDIT_COSTS.imageGen).toBe(5);
    expect(DEFAULT_CREDIT_COSTS.videoGen).toBe(10);
  });

  it('should have zero cost for free node types', () => {
    expect(DEFAULT_CREDIT_COSTS.brand).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.brandAsset).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.brandContext).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.condition).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.delay).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.loop).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.publish).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.rssInput).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.socialPublish).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.tweetInput).toBe(0);
    expect(DEFAULT_CREDIT_COSTS.webhook).toBe(0);
  });

  it('should have expected values for processing node types', () => {
    expect(DEFAULT_CREDIT_COSTS.caption).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.clip).toBe(2);
    expect(DEFAULT_CREDIT_COSTS.resize).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.transform).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.tweetRemix).toBe(1);
    expect(DEFAULT_CREDIT_COSTS.upscale).toBe(2);
  });
});

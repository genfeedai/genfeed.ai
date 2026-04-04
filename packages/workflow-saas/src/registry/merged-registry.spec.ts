import {
  getAllNodeTypes,
  getNodeDefinition,
  getNodesByExtendedCategory,
  isCoreNode,
  isValidNodeType,
  NODE_DEFINITIONS,
} from '@workflow-saas/registry/merged-registry';
import { describe, expect, it } from 'vitest';

describe('isCoreNode', () => {
  it('false for saas nodes', () => {
    expect(isCoreNode('brand')).toBe(false);
  });
});

describe('isValidNodeType', () => {
  it('true for saas', () => expect(isValidNodeType('brand')).toBe(true));
  it('false for unknown', () => expect(isValidNodeType('xxx')).toBe(false));
});

describe('getNodeDefinition', () => {
  it('saas node', () => {
    expect(getNodeDefinition('brand')?.label).toBe('Brand');
  });
  it('unknown', () => expect(getNodeDefinition('xxx')).toBeUndefined());
});

describe('NODE_DEFINITIONS', () => {
  it('has brand', () => expect(NODE_DEFINITIONS.brand).toBeDefined());
});

describe('getNodesByExtendedCategory', () => {
  it('returns categories', () => {
    const cats = getNodesByExtendedCategory();
    expect(Object.values(cats).flat().length).toBeGreaterThan(0);
  });
});

describe('getAllNodeTypes', () => {
  it('includes saas types', () => {
    const types = getAllNodeTypes();
    expect(types).toContain('brand');
    expect(types.length).toBeGreaterThan(5);
  });
});

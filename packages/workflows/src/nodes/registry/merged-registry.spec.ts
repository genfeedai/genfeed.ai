import { describe, expect, it } from 'vitest';
import {
  getAllNodeTypes,
  getNodeDefinition,
  getNodesByExtendedCategory,
  isCatalogActionNode,
  isCoreNode,
  isValidNodeType,
} from './merged-registry';

describe('isCoreNode', () => {
  it('false for catalog action nodes', () => {
    expect(isCoreNode('brand')).toBe(false);
  });
});

describe('isValidNodeType', () => {
  it('true for catalog actions', () =>
    expect(isValidNodeType('brand')).toBe(true));
  it('false for unknown', () => expect(isValidNodeType('xxx')).toBe(false));
});

describe('getNodeDefinition', () => {
  it('catalog action node', () => {
    expect(getNodeDefinition('brand')?.label).toBe('Brand');
  });
});

describe('getNodesByExtendedCategory', () => {
  it('returns categories', () => {
    const cats = getNodesByExtendedCategory();
    expect(Object.values(cats).flat().length).toBeGreaterThan(0);
  });
});

describe('getAllNodeTypes', () => {
  it('includes catalog action types', () => {
    const types = getAllNodeTypes();
    expect(types).toContain('brand');
    expect(types.length).toBeGreaterThan(5);
  });
});

describe('isCatalogActionNode', () => {
  it('true for workflow-visible actions', () =>
    expect(isCatalogActionNode('publish')).toBe(true));
  it('false for engine-native triggers', () =>
    expect(isCatalogActionNode('commentTrigger')).toBe(false));
});

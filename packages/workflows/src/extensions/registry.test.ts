import { describe, expect, it } from 'vitest';
import { InMemoryNodeRegistry } from './registry';
import type { ExtensionPack, NodeDefinition } from './types';

function makeNode(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    inputs: {},
    label: 'Test Node',
    outputs: {},
    type: 'test-node',
    version: 1,
    ...overrides,
  };
}

describe('InMemoryNodeRegistry', () => {
  it('registers and retrieves a node by type and version', () => {
    const registry = new InMemoryNodeRegistry();
    const node = makeNode();
    registry.register(node);

    expect(registry.get('test-node', 1)).toBe(node);
  });

  it('returns undefined for an unknown type', () => {
    const registry = new InMemoryNodeRegistry();
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.get('missing', 2)).toBeUndefined();
  });

  it('resolves the highest version when no version is given', () => {
    const registry = new InMemoryNodeRegistry();
    const v1 = makeNode({ version: 1 });
    const v3 = makeNode({ version: 3 });
    const v2 = makeNode({ version: 2 });
    registry.registerMany([v1, v3, v2]);

    expect(registry.get('test-node')).toBe(v3);
    expect(registry.get('test-node', 2)).toBe(v2);
  });

  it('replaces a node registered with the same type and version', () => {
    const registry = new InMemoryNodeRegistry();
    registry.register(makeNode({ label: 'First' }));
    const replacement = makeNode({ label: 'Second' });
    registry.register(replacement);

    expect(registry.get('test-node', 1)).toBe(replacement);
    expect(registry.list()).toHaveLength(1);
  });

  it('registerPack registers all pack nodes', () => {
    const registry = new InMemoryNodeRegistry();
    const pack: ExtensionPack = {
      id: 'pack-1',
      nodes: [makeNode({ type: 'a' }), makeNode({ type: 'b' })],
      version: '1.0.0',
    };
    registry.registerPack(pack);

    expect(registry.get('a')).toBeDefined();
    expect(registry.get('b')).toBeDefined();
    expect(registry.list()).toHaveLength(2);
  });

  it('list returns every registered definition', () => {
    const registry = new InMemoryNodeRegistry();
    registry.registerMany([
      makeNode({ type: 'a', version: 1 }),
      makeNode({ type: 'a', version: 2 }),
    ]);

    expect(registry.list()).toHaveLength(2);
  });
});

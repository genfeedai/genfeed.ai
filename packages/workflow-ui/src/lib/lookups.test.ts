import { describe, expect, it } from 'vitest';

import { createIdMap, createSourceMap, createTargetMap } from './lookups';

describe('createIdMap', () => {
  it('indexes items by id', () => {
    const map = createIdMap([
      { id: 'node-1', label: 'One' },
      { id: 'node-2', label: 'Two' },
    ]);

    expect(map.get('node-1')).toEqual({ id: 'node-1', label: 'One' });
    expect(map.get('node-2')).toEqual({ id: 'node-2', label: 'Two' });
    expect(map.get('node-3')).toBeUndefined();
  });
});

describe('createSourceMap', () => {
  it('groups items by source', () => {
    const map = createSourceMap([
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
      { id: 'edge-2', source: 'node-1', target: 'node-3' },
      { id: 'edge-3', source: 'node-2', target: 'node-4' },
    ]);

    expect(map.get('node-1')).toEqual([
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
      { id: 'edge-2', source: 'node-1', target: 'node-3' },
    ]);
    expect(map.get('node-2')).toEqual([
      { id: 'edge-3', source: 'node-2', target: 'node-4' },
    ]);
    expect(map.get('node-9')).toBeUndefined();
  });
});

describe('createTargetMap', () => {
  it('groups items by target', () => {
    const map = createTargetMap([
      { id: 'edge-1', source: 'node-1', target: 'node-3' },
      { id: 'edge-2', source: 'node-2', target: 'node-3' },
      { id: 'edge-3', source: 'node-4', target: 'node-5' },
    ]);

    expect(map.get('node-3')).toEqual([
      { id: 'edge-1', source: 'node-1', target: 'node-3' },
      { id: 'edge-2', source: 'node-2', target: 'node-3' },
    ]);
    expect(map.get('node-5')).toEqual([
      { id: 'edge-3', source: 'node-4', target: 'node-5' },
    ]);
    expect(map.get('node-9')).toBeUndefined();
  });
});

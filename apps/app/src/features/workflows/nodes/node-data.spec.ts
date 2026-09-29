import { describe, expect, it } from 'vitest';

import { coerceNodeData, isNodeDataRecord } from './node-data';

describe('node-data helpers', () => {
  it('falls back to defaults when node data is not a record', () => {
    const result = coerceNodeData(null, {
      label: 'Default',
      status: 'idle',
    });

    expect(result).toEqual({
      label: 'Default',
      status: 'idle',
    });
  });

  it('detects plain object node data safely', () => {
    expect(isNodeDataRecord({ label: 'Valid' })).toBe(true);
    expect(isNodeDataRecord(null)).toBe(false);
    expect(isNodeDataRecord('nope')).toBe(false);
  });
});

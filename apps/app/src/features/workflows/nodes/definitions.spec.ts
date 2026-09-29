import { describe, expect, it } from 'vitest';

import { extendedNodeDefinitions } from './definitions';

describe('extendedNodeDefinitions', () => {
  it('should have a label for every definition', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      expect(definition.label).toBeDefined();
      expect(typeof definition.label).toBe('string');
      expect(definition.label.length).toBeGreaterThan(0);
    }
  });
});

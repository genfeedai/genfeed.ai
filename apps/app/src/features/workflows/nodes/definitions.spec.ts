import { describe, expect, it } from 'vitest';

import { extendedNodeDefinitions } from './definitions';

describe('extendedNodeDefinitions', () => {
  it('should contain all expected extended node types', () => {
    const expectedTypes = [
      'captionGen',
      'clipSelector',
      'colorGrade',
      'platformExport',
      'platformMultiplier',
      'reviewGate',
      'webhookTrigger',
    ];

    for (const type of expectedTypes) {
      expect(extendedNodeDefinitions).toHaveProperty(type);
    }
  });

  it('should have consistent type field matching the key', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      expect(definition.type).toBe(key);
    }
  });

  it('should have a label for every definition', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      expect(definition.label).toBeDefined();
      expect(typeof definition.label).toBe('string');
      expect(definition.label.length).toBeGreaterThan(0);
    }
  });

  it('should have a category for every definition', () => {
    const validCategories = new Set([
      'automation',
      'distribution',
      'effects',
      'repurposing',
    ]);

    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      expect(validCategories.has(definition.category)).toBe(true);
    }
  });

  it('should have at least one output for every definition', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      expect(definition.outputs.length).toBeGreaterThan(0);
    }
  });

  it('should have unique output ids within each definition', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      const outputIds = definition.outputs.map(
        (output: { id: string }) => output.id,
      );
      expect(new Set(outputIds).size).toBe(outputIds.length);
    }
  });

  it('should have unique input ids within each definition', () => {
    for (const [key, definition] of Object.entries(extendedNodeDefinitions)) {
      if (definition.inputs.length === 0) continue;
      const inputIds = definition.inputs.map(
        (input: { id: string }) => input.id,
      );
      expect(new Set(inputIds).size).toBe(inputIds.length);
    }
  });
});

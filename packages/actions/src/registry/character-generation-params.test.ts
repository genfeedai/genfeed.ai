import { describe, expect, it } from 'vitest';
import { CURATED_ACTION_CATALOG } from './curated-action-catalog';
import { OVERLAP_TOOLS } from './source/overlap.tools';

describe('character generation tool params (#3441)', () => {
  const generate = OVERLAP_TOOLS.find((tool) => tool.name === 'generate');
  const listAssets = OVERLAP_TOOLS.find((tool) => tool.name === 'list_assets');

  it('declares every image parameter consumed by confirmed generation', () => {
    expect(generate?.parameters.properties).toMatchObject({
      aspectRatio: { type: 'string' },
      characterHandles: { maxItems: 4, type: 'array' },
      outputs: { maximum: 8, minimum: 1, type: 'integer' },
      references: { maxItems: 10, type: 'array' },
    });
  });

  it('declares references, characterHandles and imageUrl for video on generate', () => {
    expect(generate?.parameters.properties).toMatchObject({
      characterHandles: { maxItems: 4, type: 'array' },
      imageUrl: {
        description: expect.stringMatching(/start[\s-]frame/i),
        type: 'string',
      },
      references: { maxItems: 10, type: 'array' },
    });
  });

  it('registers list_assets as a zero-credit read tool that covers characters', () => {
    expect(listAssets?.creditCost).toBe(0);
    expect(listAssets?.parameters.properties.type).toMatchObject({
      enum: ['image', 'video', 'music', 'avatar', 'character'],
    });
    expect(listAssets?.parameters.required).toEqual(['type']);
    expect(
      CURATED_ACTION_CATALOG.find((entry) => entry.name === 'list_assets'),
    ).toEqual({
      name: 'list_assets',
      surfaces: ['agent', 'mcp'],
      toolset: 'generation',
    });
    expect(CURATED_ACTION_CATALOG.map((entry) => entry.name)).not.toContain(
      'list_characters',
    );
  });

  it('lets agent and MCP callers filter list_assets by up to 25 characters (#6053)', () => {
    expect(listAssets?.parameters.properties.characterIds).toMatchObject({
      items: { type: 'string' },
      maxItems: 25,
      type: 'array',
    });
    expect(listAssets?.parameters.required).not.toContain('characterIds');
  });
});

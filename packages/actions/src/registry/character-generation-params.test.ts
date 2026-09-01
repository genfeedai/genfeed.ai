import { describe, expect, it } from 'vitest';
import { CURATED_ACTION_CATALOG } from './curated-action-catalog';
import { OVERLAP_TOOLS } from './source/overlap.tools';

describe('character generation tool params (#3441)', () => {
  const generateImage = OVERLAP_TOOLS.find(
    (tool) => tool.name === 'generate_image',
  );
  const generateVideo = OVERLAP_TOOLS.find(
    (tool) => tool.name === 'generate_video',
  );
  const listCharacters = OVERLAP_TOOLS.find(
    (tool) => tool.name === 'list_characters',
  );

  it('declares every image parameter consumed by confirmed generation', () => {
    expect(generateImage?.parameters.properties).toMatchObject({
      aspectRatio: { type: 'string' },
      characterHandles: { maxItems: 4, type: 'array' },
      outputs: { maximum: 8, minimum: 1, type: 'integer' },
      references: { maxItems: 8, type: 'array' },
    });
  });

  it('adds references and characterHandles to generate_video without dropping imageUrl', () => {
    expect(generateVideo?.parameters.properties).toMatchObject({
      characterHandles: { maxItems: 4, type: 'array' },
      imageUrl: { type: 'string' },
      references: { maxItems: 8, type: 'array' },
    });
    expect(
      String(generateVideo?.parameters.properties.imageUrl.description)
        .toLowerCase()
        .replaceAll('-', ' '),
    ).toContain('start frame');
  });

  it('registers list_characters as a zero-credit read tool on agent and MCP', () => {
    expect(listCharacters?.creditCost).toBe(0);
    expect(
      CURATED_ACTION_CATALOG.find((entry) => entry.name === 'list_characters'),
    ).toEqual({ name: 'list_characters', surfaces: ['agent', 'mcp'] });
  });
});

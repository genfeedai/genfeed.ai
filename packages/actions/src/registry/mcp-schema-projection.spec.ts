import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import { getToolByName } from './tool-registry';

describe('MCP schema projection (#7178)', () => {
  const canonical = getToolByName('create_post');

  it('hides the app-only create_post fields from the MCP schema', () => {
    const [tool] = toMcpTools(canonical ? [canonical] : []);
    const properties = Object.keys(tool.inputSchema.properties);

    for (const hidden of [
      'confirmed',
      'contentId',
      'ingredientId',
      'sourceActionId',
      'targets',
    ]) {
      expect(properties).not.toContain(hidden);
    }
    expect(properties).toEqual(
      expect.arrayContaining(['content', 'caption', 'mediaUrls', 'platforms']),
    );
    expect(tool.description).not.toMatch(/Genfeed app|confirmed/);
  });

  it('keeps the shared definition the agent surface uses', () => {
    expect(Object.keys(canonical?.parameters.properties ?? {})).toEqual(
      expect.arrayContaining(['confirmed', 'contentId', 'targets']),
    );
  });
});

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
      expect.arrayContaining(['brandId', 'content', 'mediaUrls', 'visibility']),
    );
    expect(tool.description).not.toMatch(/Genfeed app|confirmed/);
  });

  it('lists one post text field and no scheduling fields, since a draft never schedules (#10071)', () => {
    const [tool] = toMcpTools(canonical ? [canonical] : []);
    const properties = Object.keys(tool.inputSchema.properties);

    for (const inert of [
      'caption',
      'textContent',
      'scheduledAt',
      'timezone',
      'postingSetId',
      'platform',
      'platforms',
    ]) {
      expect(properties).not.toContain(inert);
    }
    expect(tool.description).toContain('never publishes or schedules');
  });

  it('asks for brandId only when the organization has several brands (#10071)', () => {
    const [tool] = toMcpTools(canonical ? [canonical] : []);

    expect(tool.inputSchema.required ?? []).not.toContain('brandId');
    expect(tool.inputSchema.properties.brandId).toMatchObject({
      type: 'string',
    });
    expect(tool.description).toContain(
      'brandId is required when the organization has more than one brand',
    );
  });

  it('keeps the shared definition the agent surface uses', () => {
    expect(Object.keys(canonical?.parameters.properties ?? {})).toEqual(
      expect.arrayContaining(['confirmed', 'contentId', 'targets']),
    );
  });
});

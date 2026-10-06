import { describe, expect, it } from 'vitest';
import { getToolByName } from './tool-registry';
import { getToolsForToolsets } from './toolsets';

describe('generate_content as the single content generation tool', () => {
  const tool = getToolByName('generate_content');

  it('is available on the agent and on MCP in the content toolset', () => {
    expect(tool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(tool?.toolset).toBe('content');
    expect(tool?.mutationPolicy).toBe('approval-required');
  });

  it('keeps batch generation as a separate approval-required tool', () => {
    expect(getToolByName('generate_content_batch')?.mutationPolicy).toBe(
      'approval-required',
    );
  });

  it('generates saved articles as well as social text', () => {
    expect(tool?.parameters.properties.type).toMatchObject({
      enum: expect.arrayContaining(['article', 'x-article', 'post']),
    });
    expect(tool?.parameters.required).toEqual(['topic', 'type']);
    expect(Object.keys(tool?.parameters.properties ?? {})).toEqual(
      expect.arrayContaining([
        'keywords',
        'length',
        'targetAudience',
        'tone',
        'variationsCount',
      ]),
    );
  });

  it('bounds LinkedIn variations at five', () => {
    expect(tool?.parameters.properties.variationsCount).toMatchObject({
      maximum: 5,
      minimum: 1,
    });
  });

  it('removes the MCP-only LinkedIn and article generators', () => {
    expect(getToolByName('generate_linkedin_content')).toBeUndefined();
    expect(getToolByName('create_article')).toBeUndefined();
    expect(getToolByName('create_article_draft')?.surfaces).toMatchObject({
      mcp: true,
    });
  });
});

describe('get_generation_options', () => {
  const tool = getToolByName('get_generation_options');

  it('is one read-only agent and MCP generation tool with an optional type', () => {
    expect(tool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(tool?.toolset).toBe('generation');
    expect(tool?.mutationPolicy).toBeUndefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.parameters.required ?? []).toEqual([]);
    expect(tool?.parameters.properties.type).toMatchObject({
      enum: ['image', 'image-edit', 'video', 'voice', 'music'],
    });
  });

  it('replaces the separate cost and settings readers', () => {
    expect(getToolByName('get_generation_cost')).toBeUndefined();
    expect(getToolByName('get_generation_settings')).toBeUndefined();
    expect(getToolByName('set_generation_settings')).toBeDefined();
  });
});

describe('default MCP profile after the write-tool merges', () => {
  it('loads transform_media and get_generation_options by default', () => {
    const names = new Set<string>(
      getToolsForToolsets('mcp', [
        'core',
        'generation',
        'content',
        'scheduler',
      ]).map((tool) => tool.name),
    );
    expect(names.has('transform_media')).toBe(true);
    expect(names.has('get_generation_options')).toBe(true);
    expect(names.has('generate_content')).toBe(true);
    for (const removed of [
      'edit_image',
      'reframe_image',
      'upscale_image',
      'merge_videos',
      'get_generation_cost',
      'get_generation_settings',
      'generate_linkedin_content',
      'create_article',
    ]) {
      expect(names.has(removed), removed).toBe(false);
    }
  });
});

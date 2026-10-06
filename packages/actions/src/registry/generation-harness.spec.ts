import { describe, expect, it } from 'vitest';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('generation harness catalog', () => {
  it.each(['generate', 'enhance_prompt', 'prepare_generation'])(
    'declares bounded skill selections on %s',
    (name) => {
      expect(
        getToolByName(name)?.parameters.properties.requestedSkillSlugs,
      ).toMatchObject({
        type: 'array',
        maxItems: 8,
        items: { type: 'string', maxLength: 160 },
      });
      expect(getToolByName(name)?.parameters.properties.harness).toMatchObject({
        type: 'boolean',
      });
    },
  );

  it.each(['agent', 'mcp'] as const)(
    'exposes the implemented preview on %s',
    (surface) => {
      expect(
        getToolsForSurface(surface).find(
          (tool) => tool.name === 'enhance_prompt',
        ),
      ).toMatchObject({ creditCost: 1, mutationPolicy: 'approval-required' });
    },
  );
  it.each(['agent', 'mcp'] as const)(
    'exposes settings on %s without credit charges',
    (surface) => {
      const tools = getToolsForSurface(surface);
      for (const name of [
        'get_generation_options',
        'set_generation_settings',
      ]) {
        expect(tools.find((tool) => tool.name === name)).toMatchObject({
          creditCost: 0,
        });
      }
    },
  );
  it('routes settings writes through mutation authorization', () => {
    expect(getToolByName('set_generation_settings')?.mutationPolicy).toBe(
      'direct',
    );
    expect(
      getToolByName('get_generation_options')?.mutationPolicy,
    ).toBeUndefined();
    expect(getToolByName('get_generation_options')?.toolset).toBe('generation');
    expect(getToolByName('get_generation_cost')).toBeUndefined();
    expect(getToolByName('get_generation_settings')).toBeUndefined();
  });
  it('declares a strict optional boolean on generate', () => {
    const tool = getToolByName('generate');
    expect(tool?.parameters.properties.harness).toMatchObject({
      type: 'boolean',
    });
    expect(tool?.parameters.required).not.toContain('harness');
  });

  it('publishes the video audio toggle on get_generation_options so audio-on pricing is reachable', () => {
    const properties = getToolByName('get_generation_options')?.parameters
      .properties as Record<string, { type?: string }> | undefined;
    expect(properties?.isAudioEnabled).toMatchObject({ type: 'boolean' });
  });
});

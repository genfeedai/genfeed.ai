import { describe, expect, it } from 'vitest';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('generation harness catalog', () => {
  it.each([
    'generate_image',
    'generate_video',
    'enhance_prompt',
    'prepare_generation',
  ])('declares bounded skill selections on %s', (name) => {
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
  });

  it.each(['agent', 'mcp'] as const)(
    'exposes the implemented preview on %s',
    (surface) => {
      expect(
        getToolsForSurface(surface).find(
          (tool) => tool.name === 'enhance_prompt',
        ),
      ).toMatchObject({ creditCost: 1, mutationPolicy: 'direct' });
    },
  );
  it.each(['agent', 'mcp'] as const)(
    'exposes settings on %s without credit charges',
    (surface) => {
      const tools = getToolsForSurface(surface);
      for (const name of [
        'get_generation_settings',
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
      getToolByName('get_generation_settings')?.mutationPolicy,
    ).toBeUndefined();
  });
  it.each(['generate_image', 'generate_video'])(
    'declares a strict optional boolean on %s',
    (name) => {
      const tool = getToolByName(name);
      expect(tool?.parameters.properties.harness).toMatchObject({
        type: 'boolean',
      });
      expect(tool?.parameters.required).not.toContain('harness');
    },
  );
});

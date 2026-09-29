import { describe, expect, it } from 'vitest';
import { getToolByName } from './tool-registry';

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

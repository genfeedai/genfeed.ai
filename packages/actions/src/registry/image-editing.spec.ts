import { describe, expect, it } from 'vitest';
import {
  getVisualGenerationReviewType,
  resolveEffectiveMutationPolicy,
} from './agent-action-class';
import { getToolByName } from './tool-registry';

describe('image editing surfaces and approval', () => {
  it('exposes transform_media edit to Agent and MCP with explicit editing inputs', () => {
    const tool = getToolByName('transform_media');
    expect(tool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(tool?.toolset).toBe('generation');
    expect(tool?.parameters.required).toEqual(['operation']);
    expect(tool?.parameters.properties).toHaveProperty('maskId');
    expect(tool?.parameters.properties.maskId).toMatchObject({
      description: expect.stringMatching(/^edit\./),
    });
  });
  it('removes the per-operation tool names', () => {
    for (const name of [
      'edit_image',
      'reframe_image',
      'upscale_image',
      'merge_videos',
    ]) {
      expect(getToolByName(name), name).toBeUndefined();
    }
  });
  it('uses the paid mutation approval matrix, independently of ordinary generation cards', () => {
    expect(
      resolveEffectiveMutationPolicy('transform_media', 'manual', 'direct'),
    ).toBe('approval-required');
    expect(
      resolveEffectiveMutationPolicy('transform_media', 'auto', 'direct'),
    ).toBe('direct');
    expect(
      getVisualGenerationReviewType('transform_media', { operation: 'edit' }),
    ).toBeUndefined();
  });
});

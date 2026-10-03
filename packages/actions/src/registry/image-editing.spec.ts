import { describe, expect, it } from 'vitest';
import {
  getVisualGenerationReviewType,
  resolveEffectiveMutationPolicy,
} from './agent-action-class';
import { getToolByName } from './tool-registry';

describe('image editing surfaces and approval', () => {
  it('exposes edit_image to Agent and MCP with explicit editing inputs', () => {
    const tool = getToolByName('edit_image');
    expect(tool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(tool?.parameters.required).toEqual(['imageId', 'prompt']);
    expect(tool?.parameters.properties).toHaveProperty('maskId');
  });
  it('uses the paid mutation approval matrix, independently of ordinary generation cards', () => {
    expect(
      resolveEffectiveMutationPolicy('edit_image', 'manual', 'direct'),
    ).toBe('approval-required');
    expect(resolveEffectiveMutationPolicy('edit_image', 'auto', 'direct')).toBe(
      'direct',
    );
    expect(
      getVisualGenerationReviewType('edit_image', { type: 'image' }),
    ).toBeUndefined();
  });
});

import {
  getNodeDefinition,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry-adapter';
import { describe, expect, it } from 'vitest';

describe('node-registry-adapter', () => {
  it('allows image input to connect into ai-generate-image', () => {
    expect(
      validateConnection('input-image', 'image', 'ai-generate-image', 'image'),
    ).toBe(true);
  });

  it('allows image input to connect into canonical imageGen', () => {
    expect(
      validateConnection('input-image', 'image', 'imageGen', 'images'),
    ).toBe(true);
  });

  it('exposes ai-generate-image with optional image input and image-gen controls', () => {
    const definition = getNodeDefinition('ai-generate-image');

    expect(definition?.inputs).toMatchObject({
      image: { label: 'Source Image', required: false, type: 'image' },
      prompt: { label: 'Prompt', type: 'text' },
    });
    expect(definition?.configSchema).toMatchObject({
      model: expect.any(Object),
      negativePrompt: expect.any(Object),
      strength: expect.any(Object),
    });
  });

  it('resolves canonical workflow input aliases', () => {
    const definition = getNodeDefinition('workflowInput');

    expect(definition?.label).toBe('Workflow Input');
    expect(definition?.outputs).toMatchObject({
      value: { label: 'Value', type: 'image' },
    });
  });
});

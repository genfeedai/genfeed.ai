import {
  getNodeDefinition,
  UNIFIED_NODE_REGISTRY,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry-adapter';
import { describe, expect, it } from 'vitest';

describe('node-registry-adapter', () => {
  it('does not expose presentation nodes that cannot be persisted', () => {
    expect(UNIFIED_NODE_REGISTRY).not.toHaveProperty('workflow-ref');
    expect(UNIFIED_NODE_REGISTRY).not.toHaveProperty('animation');
    expect(UNIFIED_NODE_REGISTRY).toHaveProperty('genfeedAction');
    expect(UNIFIED_NODE_REGISTRY).toHaveProperty('workflowInput');
  });

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

  it('exposes talking-head script generation to the workflow builder and agent graph generator', () => {
    const definition = getNodeDefinition('talkingHeadScript');

    expect(definition).toMatchObject({
      category: 'processing',
      inputs: {
        brandVoice: { required: false, type: 'text' },
        clipCount: { required: false, type: 'number' },
        durationSeconds: { required: false, type: 'number' },
        harnessContext: { required: false, type: 'any' },
        productContext: { required: true, type: 'text' },
        wordsPerSecond: { required: false, type: 'number' },
      },
      outputs: {
        clipCount: { type: 'number' },
        fullText: { type: 'text' },
        script: { type: 'any' },
        segments: { type: 'any' },
        totalWordCount: { type: 'number' },
      },
      type: 'talkingHeadScript',
    });
  });
});

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
      validateConnection('input-image', 'image', 'imageGen', 'image'),
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

  it('exposes talking-head script generation from the action catalog', () => {
    const definition = getNodeDefinition('talkingHeadScript');

    expect(definition?.category).toBe('ai');
    expect(definition?.type).toBe('talkingHeadScript');
    expect(Object.keys(definition?.inputs ?? {})).toEqual(
      expect.arrayContaining([
        'productContext',
        'brandVoice',
        'durationSeconds',
        'clipCount',
        'wordsPerSecond',
      ]),
    );
    expect(Object.keys(definition?.outputs ?? {})).toEqual(
      expect.arrayContaining(['script', 'segments', 'fullText']),
    );
  });
});

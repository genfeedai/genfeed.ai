import { PresetSerializer } from '@serializers/server/elements/preset.serializer';
import { describe, expect, it } from 'vitest';

describe('PresetSerializer', () => {
  it('exposes persisted generation config while keeping scalar scope and activation authoritative', () => {
    const config = {
      label: 'Edited banner',
      prompt: 'New campaign',
      aspectRatio: '4:5',
      duration: 8,
      promptTemplate: 'video-default',
      lighting: 'soft',
      lens: '35mm',
      cameraMovement: 'pan',
      organizationId: 'forged-org',
      brandId: 'forged-brand',
      isActive: true,
      category: 'image',
      internalSecret: 'hidden',
    };
    const output = PresetSerializer.serialize({
      id: 'preset-1',
      organizationId: null,
      brandId: null,
      isActive: false,
      category: 'video',
      config,
    }) as { data: { attributes: Record<string, unknown> } };
    expect(output.data.attributes).toMatchObject({
      label: config.label,
      prompt: config.prompt,
      aspectRatio: config.aspectRatio,
      duration: config.duration,
      promptTemplate: config.promptTemplate,
      lighting: config.lighting,
      lens: config.lens,
      cameraMovement: config.cameraMovement,
      organizationId: null,
      brandId: null,
      isActive: false,
      category: 'video',
    });
    expect(output.data.attributes).not.toHaveProperty('internalSecret');
    expect(output.data.attributes).not.toHaveProperty('config');
  });
});

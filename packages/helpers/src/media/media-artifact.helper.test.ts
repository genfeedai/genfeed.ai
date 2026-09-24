import {
  serializeMediaArtifact,
  toMcpMediaToolResult,
} from './media-artifact.helper';

describe('media artifact helper', () => {
  it.each(['image', 'video'])(
    'includes the stored %s prompt receipt for text-only MCP clients',
    (kind) => {
      const receipt = {
        originalPrompt: 'A bicycle',
        enhancedPrompt: 'A red bicycle at dusk',
        status: 'applied',
        source: 'brand',
        brandId: 'brand-1',
        appliedPacks: [{ id: 'test-pack', version: '1' }],
      };
      const result = toMcpMediaToolResult({
        id: 'asset-1',
        kind,
        status: 'PROCESSING',
        generationHarness: receipt,
      });
      expect(result.content).toContainEqual({
        type: 'text',
        text: JSON.stringify({ generationHarness: receipt }, null, 2),
      });
      expect(result.structuredContent.data.generationHarness).toEqual(receipt);
    },
  );
  it('exposes a resource link for native image rendering plus structured metadata and text fallback', () => {
    const result = toMcpMediaToolResult({
      id: 'img-1',
      kind: 'image',
      status: 'GENERATED',
      url: 'https://cdn.example.com/images/img-1.png',
    });

    expect(result.content[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('img-1'),
        type: 'text',
      }),
    );
    expect(result.content[1]).toEqual({
      mimeType: 'image/png',
      name: 'img-1',
      type: 'resource_link',
      uri: 'https://cdn.example.com/images/img-1.png',
    });
    expect(result.structuredContent.artifact).toEqual(
      expect.objectContaining({
        id: 'img-1',
        kind: 'image',
        renderMode: 'native_image',
      }),
    );
  });

  it('returns a file link for video without claiming inline playback', () => {
    const artifact = serializeMediaArtifact({
      id: 'vid-1',
      kind: 'video',
      status: 'GENERATED',
      url: 'https://cdn.example.com/videos/vid-1.mp4',
    });

    expect(artifact?.renderMode).toBe('file_download');
    const result = toMcpMediaToolResult({
      id: 'vid-1',
      kind: 'video',
      status: 'GENERATED',
      url: 'https://cdn.example.com/videos/vid-1.mp4',
    });
    expect(result.content.some((part) => part.type === 'image')).toBe(false);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'vid-1',
          type: 'resource_link',
          uri: 'https://cdn.example.com/videos/vid-1.mp4',
        }),
      ]),
    );
  });

  it('keeps processing jobs inspectable without a media URL', () => {
    const result = toMcpMediaToolResult({
      id: 'img-2',
      kind: 'image',
      status: 'PROCESSING',
    });
    expect(result.structuredContent.artifact?.id).toBe('img-2');
    expect(result.content.every((part) => part.type !== 'image')).toBe(true);
  });
});

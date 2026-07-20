import { ClipProjectSerializer } from '@serializers/server/content/clip-project.serializer';
import { describe, expect, it } from 'vitest';

describe('ClipProjectSerializer reference-frame contract', () => {
  type SerializedResource = {
    data: { id: string; type: string; attributes: Record<string, unknown> };
  };

  it('exposes versioned reference-frame state when present', () => {
    const referenceFrames = {
      candidates: [
        {
          diagnostics: [],
          id: 'frame-1',
          status: 'available',
          storageKey: 'organizations/org-1/clips/project-1/frame-1.jpg',
          timestampSeconds: 12.5,
        },
      ],
      diagnostics: [],
      schemaVersion: 1,
      selectedCandidateId: null,
      status: 'ready',
    };

    const output = ClipProjectSerializer.serialize({
      id: 'project-1',
      referenceFrames,
      status: 'analyzed',
    }) as SerializedResource;

    expect(output.data.type).toBe('clip-project');
    expect(output.data.attributes.referenceFrames).toEqual(referenceFrames);
  });

  it('omits reference-frame state for legacy projects', () => {
    const output = ClipProjectSerializer.serialize({
      id: 'project-legacy',
      status: 'analyzed',
    }) as SerializedResource;

    expect('referenceFrames' in output.data.attributes).toBe(false);
  });
});

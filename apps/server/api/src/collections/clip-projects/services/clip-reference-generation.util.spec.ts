import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  CLIP_REFERENCE_CAPABILITIES,
  resolveSelectedClipReference,
} from '@api/collections/clip-projects/services/clip-reference-generation.util';
import { BadRequestException } from '@nestjs/common';

function makeProject(
  candidateOverrides: Record<string, unknown> = {},
  selectedCandidateId: string | null = 'frame-1',
): ClipProjectDocument {
  return {
    id: 'project-1',
    organizationId: 'org-1',
    referenceFrames: {
      candidates: [
        {
          assetId: 'asset-frame-1',
          diagnostics: [],
          id: 'frame-1',
          mimeType: 'image/jpeg',
          status: 'available',
          storageKey:
            'ingredients/images/organizations/org-1/clips/project-1/frame-1.jpg',
          timestampSeconds: 12.5,
          url: 'https://cdn.example.com/frame-1.jpg',
          ...candidateOverrides,
        },
      ],
      diagnostics: [],
      schemaVersion: 1,
      selectedCandidateId,
      status: selectedCandidateId ? 'selected' : 'ready',
    },
    status: 'analyzed',
  } as unknown as ClipProjectDocument;
}

describe('clip reference generation policy', () => {
  it('declares reference-image support for every current mode/provider route', () => {
    expect(CLIP_REFERENCE_CAPABILITIES).toEqual({
      avatar: {
        argil: expect.objectContaining({ supported: false }),
        genfeedai: { nativeField: 'imageUrl', supported: true },
        did: expect.objectContaining({ supported: false }),
        heygen: { nativeField: 'photo_url', supported: true },
        musetalk: expect.objectContaining({ supported: false }),
        tavus: expect.objectContaining({ supported: false }),
      },
      'raw-cut': {
        'raw-cut': expect.objectContaining({ supported: false }),
      },
    });
  });

  it('preserves no-selection behavior without adding provider input or provenance', () => {
    expect(
      resolveSelectedClipReference({
        mode: 'avatar',
        policy: 'strict',
        project: makeProject({}, null),
        provider: 'heygen',
      }),
    ).toEqual({});
  });

  it('maps a supported HeyGen reference to its native photo URL field', () => {
    const result = resolveSelectedClipReference({
      mode: 'avatar',
      policy: 'strict',
      project: makeProject(),
      provider: 'heygen',
    });

    expect(result.referenceImageUrl).toBe(
      'https://cdn.example.com/frame-1.jpg',
    );
    expect(result.application).toEqual({
      provenance: {
        application: {
          mode: 'avatar',
          nativeField: 'photo_url',
          provider: 'heygen',
          state: 'applied',
        },
        schemaVersion: 1,
        source: {
          assetId: 'asset-frame-1',
          candidateId: 'frame-1',
          mimeType: 'image/jpeg',
          storageKey:
            'ingredients/images/organizations/org-1/clips/project-1/frame-1.jpg',
          timestampSeconds: 12.5,
        },
      },
      state: 'applied',
    });
    expect(result.application?.provenance).not.toHaveProperty('url');
    expect(JSON.stringify(result.application?.provenance)).not.toContain(
      'cdn.example.com',
    );
  });

  it.each(['argil', 'did', 'tavus', 'musetalk'] as const)(
    'blocks strict reference use for unsupported avatar provider %s',
    (provider) => {
      expect(() =>
        resolveSelectedClipReference({
          mode: 'avatar',
          policy: 'strict',
          project: makeProject(),
          provider,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('blocks unsupported strict raw-cut requests', () => {
    expect(() =>
      resolveSelectedClipReference({
        mode: 'raw-cut',
        policy: 'strict',
        project: makeProject(),
        provider: 'heygen',
      }),
    ).toThrow(/cannot apply a separate reference image/);
  });

  it('returns an explicit redacted degradation for guided raw-cut requests', () => {
    const result = resolveSelectedClipReference({
      mode: 'raw-cut',
      policy: 'guided',
      project: makeProject(),
      provider: 'heygen',
    });

    expect(result.referenceImageUrl).toBeUndefined();
    expect(result.application).toEqual(
      expect.objectContaining({
        reason: expect.stringContaining('cannot apply'),
        state: 'degraded',
      }),
    );
    expect(result.application?.provenance.application).toEqual(
      expect.objectContaining({
        mode: 'raw-cut',
        provider: 'raw-cut',
        reason: expect.stringContaining('cannot apply'),
        state: 'degraded',
      }),
    );
  });

  it('rejects a missing or unavailable selected candidate', () => {
    expect(() =>
      resolveSelectedClipReference({
        mode: 'avatar',
        policy: 'guided',
        project: makeProject({}, 'missing-frame'),
        provider: 'heygen',
      }),
    ).toThrow(/missing or no longer available/);

    expect(() =>
      resolveSelectedClipReference({
        mode: 'avatar',
        policy: 'guided',
        project: makeProject({ status: 'failed' }),
        provider: 'heygen',
      }),
    ).toThrow(/missing or no longer available/);
  });

  it.each([
    { mimeType: undefined },
    { mimeType: 'text/html' },
    { storageKey: '../frame.jpg' },
    { storageKey: 'https://cdn.example.com/frame.jpg' },
    { storageKey: 'user:password@cdn.example.com/frame.jpg' },
    {
      storageKey: 'ingredients/images/frame.jpg?X-Amz-Signature=secret',
    },
    {
      url: 'https://cdn.example.com/frame.jpg?X-Amz-Signature=secret',
    },
    { url: 'https://user:password@cdn.example.com/frame.jpg' },
  ])(
    'rejects unsafe selected media before capability dispatch',
    (overrides) => {
      expect(() =>
        resolveSelectedClipReference({
          mode: 'avatar',
          policy: 'guided',
          project: makeProject(overrides),
          provider: 'heygen',
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects supported dispatch when the selected media has no provider-readable URL', () => {
    expect(() =>
      resolveSelectedClipReference({
        mode: 'avatar',
        policy: 'strict',
        project: makeProject({ url: undefined }),
        provider: 'heygen',
      }),
    ).toThrow(/provider-readable image URL/);
  });
});

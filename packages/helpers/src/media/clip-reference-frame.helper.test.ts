import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipReferenceFrameSet,
} from '@genfeedai/interfaces';
import {
  ClipReferenceFrameValidationError,
  normalizeClipReferenceFrameSet,
  normalizeClipReferenceTimestamps,
} from '@helpers/media/clip-reference-frame.helper';

function createReferenceFrames(
  overrides: Partial<ClipReferenceFrameSet> = {},
): ClipReferenceFrameSet {
  return {
    candidates: [
      {
        diagnostics: [],
        height: 720,
        id: 'frame-1',
        mimeType: 'image/jpeg',
        status: 'available',
        storageKey: 'organizations/org-1/clips/project-1/frame-1.jpg',
        timestampSeconds: 12.5,
        url: 'https://cdn.example.com/frame-1.jpg',
        width: 1280,
      },
    ],
    diagnostics: [],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'ready',
    ...overrides,
  };
}

describe('normalizeClipReferenceFrameSet', () => {
  it('normalizes a valid ready candidate set', () => {
    expect(normalizeClipReferenceFrameSet(createReferenceFrames())).toEqual(
      createReferenceFrames(),
    );
  });

  it('accepts selected state only for an available candidate', () => {
    const normalized = normalizeClipReferenceFrameSet(
      createReferenceFrames({
        selectedCandidateId: 'frame-1',
        status: 'selected',
      }),
    );

    expect(normalized.selectedCandidateId).toBe('frame-1');
    expect(normalized.status).toBe('selected');
  });

  it('normalizes null optional candidate fields as absent', () => {
    const referenceFrames = createReferenceFrames();
    const normalized = normalizeClipReferenceFrameSet({
      ...referenceFrames,
      candidates: [
        {
          ...referenceFrames.candidates[0],
          assetId: null,
          height: null,
          mimeType: null,
          url: null,
          width: null,
        },
      ],
    });

    expect(normalized.candidates[0]).toEqual(
      expect.objectContaining({
        assetId: undefined,
        height: undefined,
        mimeType: undefined,
        url: undefined,
        width: undefined,
      }),
    );
  });

  it('supports pending and unavailable states without candidates', () => {
    expect(
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [],
          status: 'pending',
        }),
      ).status,
    ).toBe('pending');
    expect(
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [],
          diagnostics: [
            {
              code: 'clip_reference_extraction_failed',
              message: 'No source frame could be extracted.',
              severity: 'warning',
            },
          ],
          status: 'unavailable',
        }),
      ).status,
    ).toBe('unavailable');
  });

  it('rejects duplicate candidate ids', () => {
    const candidate = createReferenceFrames().candidates[0];

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({ candidates: [candidate, candidate] }),
      ),
    ).toThrow(/duplicate candidate id frame-1/);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
  ])('rejects invalid timestamp %s', (timestampSeconds) => {
    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [
            {
              ...createReferenceFrames().candidates[0],
              timestampSeconds,
            },
          ],
        }),
      ),
    ).toThrow(/finite non-negative number/);
  });

  it('rejects unsafe URLs, storage traversal, and non-image media types', () => {
    const candidate = createReferenceFrames().candidates[0];

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [{ ...candidate, url: 'file:///tmp/frame.jpg' }],
        }),
      ),
    ).toThrow(/absolute HTTP\(S\) URL/);

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [{ ...candidate, storageKey: '../frame.jpg' }],
        }),
      ),
    ).toThrow(/without traversal segments/);

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [{ ...candidate, mimeType: 'text/html' }],
        }),
      ),
    ).toThrow(/image media type/);
  });

  it('rejects dangling or unavailable selections', () => {
    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          selectedCandidateId: 'missing-frame',
          status: 'selected',
        }),
      ),
    ).toThrow(/available candidate/);

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [
            {
              ...createReferenceFrames().candidates[0],
              status: 'failed',
            },
          ],
          selectedCandidateId: 'frame-1',
          status: 'selected',
        }),
      ),
    ).toThrow(ClipReferenceFrameValidationError);
  });

  it('rejects state that disagrees with candidate readiness', () => {
    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({ status: 'partial' }),
      ),
    ).toThrow(/status must be ready/);
  });

  it('requires a stable media reference without binary payloads', () => {
    const candidate = createReferenceFrames().candidates[0];

    expect(() =>
      normalizeClipReferenceFrameSet(
        createReferenceFrames({
          candidates: [
            {
              ...candidate,
              assetId: undefined,
              storageKey: undefined,
              url: undefined,
            },
          ],
        }),
      ),
    ).toThrow(/assetId, storageKey, or url/);
  });
});

describe('normalizeClipReferenceTimestamps', () => {
  it('filters, rounds, deduplicates, sorts, and caps timestamps', () => {
    expect(
      normalizeClipReferenceTimestamps([
        30,
        Number.NaN,
        10.0004,
        -1,
        20,
        40,
        50,
        60,
        10.00049,
      ]),
    ).toEqual([10, 20, 30, 40, 50]);
  });
});

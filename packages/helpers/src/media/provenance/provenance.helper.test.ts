import type { IMediaProvenanceInput } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildMediaProvenancePackage,
  buildMediaWatermarkAttributionEvaluation,
  buildProvenanceManifest,
  buildTranscriptSidecar,
  formatVttTimestamp,
  parseSrt,
} from './provenance.helper';

const baseInput = (
  overrides: Partial<IMediaProvenanceInput> = {},
): IMediaProvenanceInput => ({
  assetId: 'clvideo123',
  generatedAt: '2026-06-21T00:00:00.000Z',
  ...overrides,
});

describe('formatVttTimestamp', () => {
  it('formats zero', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000');
  });

  it('formats sub-second milliseconds', () => {
    expect(formatVttTimestamp(1.234)).toBe('00:00:01.234');
    expect(formatVttTimestamp(0.5)).toBe('00:00:00.500');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatVttTimestamp(3661.5)).toBe('01:01:01.500');
    expect(formatVttTimestamp(60)).toBe('00:01:00.000');
  });

  it('clamps negative and non-finite values to zero', () => {
    expect(formatVttTimestamp(-5)).toBe('00:00:00.000');
    expect(formatVttTimestamp(Number.NaN)).toBe('00:00:00.000');
    expect(formatVttTimestamp(Number.POSITIVE_INFINITY)).toBe('00:00:00.000');
  });
});

describe('parseSrt', () => {
  it('parses well-formed SRT with comma milliseconds', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello world',
      '',
      '2',
      '00:00:04,500 --> 00:00:06,250',
      'Second line',
    ].join('\n');

    expect(parseSrt(srt)).toEqual([
      { end: 4, start: 1, text: 'Hello world' },
      { end: 6.25, start: 4.5, text: 'Second line' },
    ]);
  });

  it('accepts dot milliseconds and multi-line cue text', () => {
    const srt = ['1', '00:00:00.000 --> 00:00:02.000', 'Line A', 'Line B'].join(
      '\n',
    );

    expect(parseSrt(srt)).toEqual([
      { end: 2, start: 0, text: 'Line A\nLine B' },
    ]);
  });

  it('skips malformed blocks and empty input', () => {
    expect(parseSrt('')).toEqual([]);
    expect(parseSrt('not an srt block')).toEqual([]);
    const partial = [
      'garbage without arrow',
      '',
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Valid',
    ].join('\n');
    expect(parseSrt(partial)).toEqual([{ end: 2, start: 1, text: 'Valid' }]);
  });
});

describe('buildTranscriptSidecar', () => {
  it('builds a VTT sidecar from structured segments', () => {
    const sidecar = buildTranscriptSidecar(
      'asset1',
      {
        language: 'en',
        segments: [
          { end: 2, start: 0, text: 'Hello' },
          { end: 5, start: 2, text: 'World' },
        ],
      },
      {},
    );

    expect(sidecar.filename).toBe('asset1.transcript.vtt');
    expect(sidecar.format).toBe('vtt');
    expect(sidecar.language).toBe('en');
    expect(sidecar.hasTimestamps).toBe(true);
    expect(sidecar.segmentCount).toBe(2);
    expect(sidecar.vtt).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n2\n00:00:02.000 --> 00:00:05.000\nWorld\n',
    );
  });

  it('falls back to SRT parsing when no segments are provided', () => {
    const sidecar = buildTranscriptSidecar('asset1', {
      srt: '1\n00:00:00,000 --> 00:00:01,000\nHi',
    });

    expect(sidecar.segmentCount).toBe(1);
    expect(sidecar.segments).toEqual([{ end: 1, start: 0, text: 'Hi' }]);
    expect(sidecar.hasTimestamps).toBe(true);
  });

  it('builds a single cue from plain text using the fallback duration', () => {
    const sidecar = buildTranscriptSidecar(
      'asset1',
      { text: 'A spoken line' },
      { fallbackDurationSeconds: 10 },
    );

    expect(sidecar.segments).toEqual([
      { end: 10, start: 0, text: 'A spoken line' },
    ]);
    expect(sidecar.hasTimestamps).toBe(true);
  });

  it('emits a single zero-length cue (no timestamps) when text has no duration', () => {
    const sidecar = buildTranscriptSidecar('asset1', { text: 'No timing' });

    expect(sidecar.segments).toEqual([{ end: 0, start: 0, text: 'No timing' }]);
    expect(sidecar.hasTimestamps).toBe(false);
    expect(sidecar.vtt).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.000\nNo timing\n',
    );
  });

  it('returns a valid empty sidecar when no transcript data exists', () => {
    const sidecar = buildTranscriptSidecar('asset1', null);

    expect(sidecar.segments).toEqual([]);
    expect(sidecar.segmentCount).toBe(0);
    expect(sidecar.hasTimestamps).toBe(false);
    expect(sidecar.language).toBeNull();
    expect(sidecar.vtt).toBe('WEBVTT\n');
  });

  it('prefers transcript language, then options language', () => {
    expect(
      buildTranscriptSidecar(
        'a',
        { language: 'fr', text: 'x' },
        { language: 'en' },
      ).language,
    ).toBe('fr');
    expect(
      buildTranscriptSidecar('a', { text: 'x' }, { language: 'en' }).language,
    ).toBe('en');
  });

  it('sorts segments by start and drops invalid ones', () => {
    const sidecar = buildTranscriptSidecar('a', {
      segments: [
        { end: 5, start: 3, text: 'second' },
        { end: 2, start: 0, text: 'first' },
        { end: 1, start: 9, text: 'invalid end < start' },
        { end: 8, start: 7, text: '   ' },
        { end: Number.NaN, start: 0, text: 'invalid number' },
      ],
    });

    expect(sidecar.segments).toEqual([
      { end: 2, start: 0, text: 'first' },
      { end: 5, start: 3, text: 'second' },
    ]);
  });

  it('treats a zero-duration cue at a non-zero start as timestamped', () => {
    const sidecar = buildTranscriptSidecar('a', {
      segments: [{ end: 5, start: 5, text: 'chapter marker' }],
    });

    expect(sidecar.segmentCount).toBe(1);
    expect(sidecar.hasTimestamps).toBe(true);
  });
});

describe('buildMediaProvenancePackage', () => {
  it('builds the full package and maps every manifest field', () => {
    const input = baseInput({
      canonicalUrl: 'https://cdn.example.com/v/clvideo123.mp4',
      contentHash: 'sha256:abc',
      generation: {
        completedAt: '2026-06-20T12:00:00.000Z',
        lora: 'lora-x',
        model: 'wan-2.2',
        negativePrompt: 'blurry',
        prompt: 'a cat surfing',
        seed: 42,
        source: 'studio',
        workflow: 'wf-1',
      },
      language: 'en',
      media: {
        durationSeconds: 12.5,
        fps: 24,
        hasAudio: true,
        height: 1920,
        resolution: '1080x1920',
        width: 1080,
      },
      mimeType: 'video/mp4',
      sizeBytes: 1024,
      storageKey: 'videos/clvideo123.mp4',
      transcript: { segments: [{ end: 3, start: 0, text: 'hi' }] },
    });

    const pkg = buildMediaProvenancePackage(input);

    expect(pkg.assetId).toBe('clvideo123');
    expect(pkg.manifestFilename).toBe('clvideo123.manifest.json');
    expect(pkg.transcriptSidecar.filename).toBe('clvideo123.transcript.vtt');

    expect(pkg.manifest).toEqual({
      assetId: 'clvideo123',
      canonicalUrl: 'https://cdn.example.com/v/clvideo123.mp4',
      contentHash: 'sha256:abc',
      generatedAt: '2026-06-21T00:00:00.000Z',
      generation: {
        completedAt: '2026-06-20T12:00:00.000Z',
        lora: 'lora-x',
        model: 'wan-2.2',
        negativePrompt: 'blurry',
        prompt: 'a cat surfing',
        seed: 42,
        source: 'studio',
        workflow: 'wf-1',
      },
      kind: 'video',
      language: 'en',
      media: {
        durationSeconds: 12.5,
        fps: 24,
        hasAudio: true,
        height: 1920,
        resolution: '1080x1920',
        width: 1080,
      },
      mimeType: 'video/mp4',
      schemaVersion: 1,
      sizeBytes: 1024,
      storageKey: 'videos/clvideo123.mp4',
      transcript: {
        filename: 'clvideo123.transcript.vtt',
        format: 'vtt',
        hasTimestamps: true,
        language: 'en',
        segmentCount: 1,
      },
    });
  });

  it('normalizes missing media and generation to nulls', () => {
    const pkg = buildMediaProvenancePackage(baseInput());

    expect(pkg.manifest.media).toEqual({
      durationSeconds: null,
      fps: null,
      hasAudio: null,
      height: null,
      resolution: null,
      width: null,
    });
    expect(pkg.manifest.generation).toEqual({
      completedAt: null,
      lora: null,
      model: null,
      negativePrompt: null,
      prompt: null,
      seed: null,
      source: null,
      workflow: null,
    });
    expect(pkg.manifest.canonicalUrl).toBeNull();
    expect(pkg.manifest.kind).toBe('video');
    expect(pkg.transcriptSidecar.vtt).toBe('WEBVTT\n');
  });

  it('uses media duration as the transcript fallback for text-only transcripts', () => {
    const pkg = buildMediaProvenancePackage(
      baseInput({
        media: { durationSeconds: 8 },
        transcript: { text: 'spoken' },
      }),
    );

    expect(pkg.transcriptSidecar.segments).toEqual([
      { end: 8, start: 0, text: 'spoken' },
    ]);
    expect(pkg.manifest.transcript.hasTimestamps).toBe(true);
  });

  it('honors a custom kind', () => {
    expect(
      buildMediaProvenancePackage(baseInput({ kind: 'avatar' })).manifest.kind,
    ).toBe('avatar');
  });

  it('throws when assetId is empty or whitespace', () => {
    expect(() =>
      buildMediaProvenancePackage(baseInput({ assetId: '' })),
    ).toThrow(/assetId/);
    expect(() =>
      buildMediaProvenancePackage(baseInput({ assetId: '   ' })),
    ).toThrow(/assetId/);
  });

  it('is deterministic for identical input', () => {
    const input = baseInput({
      media: { durationSeconds: 4 },
      transcript: { segments: [{ end: 1, start: 0, text: 'a' }] },
    });

    expect(buildMediaProvenancePackage(input)).toEqual(
      buildMediaProvenancePackage(input),
    );
  });
});

describe('buildProvenanceManifest', () => {
  it('reuses an already-built sidecar reference', () => {
    const sidecar = buildTranscriptSidecar('asset1', {
      segments: [{ end: 2, start: 0, text: 'hi' }],
    });
    const manifest = buildProvenanceManifest(
      baseInput({ assetId: 'asset1' }),
      sidecar,
    );

    expect(manifest.transcript).toEqual({
      filename: 'asset1.transcript.vtt',
      format: 'vtt',
      hasTimestamps: true,
      language: null,
      segmentCount: 1,
    });
  });
});

describe('buildMediaWatermarkAttributionEvaluation', () => {
  it('prefers the manifest and transcript sidecar over hidden watermarking', () => {
    const pkg = buildMediaProvenancePackage(
      baseInput({
        canonicalUrl: 'https://cdn.example.com/video-1.mp4',
        contentHash: 'sha256:abc',
        storageKey: 'videos/video-1.mp4',
        transcript: { segments: [{ end: 2, start: 0, text: 'hello' }] },
      }),
    );

    const evaluation = buildMediaWatermarkAttributionEvaluation(pkg);

    expect(evaluation).toMatchObject({
      assetId: 'clvideo123',
      fallbackBehavior:
        'Keep exporting the manifest and transcript sidecar; fall back to visible overlay only when the export target needs a viewer-facing brand mark.',
      missingSignals: [],
      primaryApproach: 'provenance_manifest',
      schemaVersion: 1,
    });
    expect(evaluation.recommendedAction).toContain('verify the content hash');
    expect(evaluation.approaches.map((approach) => approach.approach)).toEqual([
      'provenance_manifest',
      'visible_watermark',
      'hidden_watermark',
      'content_credentials',
    ]);
    expect(evaluation.approaches[0]).toMatchObject({
      attributionStrength: 'high',
      readiness: 'ready',
      tamperDetection: 'high',
      viewerImpact: 'none',
    });
    expect(evaluation.approaches[2]).toMatchObject({
      approach: 'hidden_watermark',
      readiness: 'blocked',
    });
  });

  it('reports missing signals that block tamper-detection claims', () => {
    const pkg = buildMediaProvenancePackage(baseInput());

    const evaluation = buildMediaWatermarkAttributionEvaluation(pkg);

    expect(evaluation.missingSignals).toEqual([
      'canonicalUrl_or_storageKey',
      'contentHash',
      'timestampedTranscript',
    ]);
    expect(evaluation.recommendedAction).toContain('add a content hash');
    expect(evaluation.approaches[0]).toMatchObject({
      attributionStrength: 'medium',
      readiness: 'partial',
      tamperDetection: 'low',
    });
    expect(evaluation.approaches[3]).toMatchObject({
      approach: 'content_credentials',
      readiness: 'blocked',
      tamperDetection: 'none',
    });
  });
});

import type {
  IMediaGenerationProvenance,
  IMediaProvenanceInput,
  IMediaProvenanceManifest,
  IMediaProvenancePackage,
  IMediaTechnicalMetadata,
  IMediaTranscriptInput,
  IMediaTranscriptReference,
  IMediaTranscriptSidecar,
  IMediaWatermarkAttributionEvaluation,
  IProvenanceTranscriptSegment,
} from '@genfeedai/interfaces';

/** Current manifest schema version. Bump when the manifest shape changes. */
export const MEDIA_PROVENANCE_SCHEMA_VERSION = 1;
export const MEDIA_WATERMARK_ATTRIBUTION_SCHEMA_VERSION = 1;

const DEFAULT_KIND = 'video';
const VTT_HEADER = 'WEBVTT';

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * Format a number of seconds as a WebVTT timestamp (`HH:MM:SS.mmm`).
 * Negative or non-finite inputs are clamped to zero.
 */
export function formatVttTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const secs = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value: number, size = 2): string =>
    value.toString().padStart(size, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

function parseSrtTimestamp(value: string): number | null {
  // Accepts `HH:MM:SS,mmm` or `HH:MM:SS.mmm`.
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) {
    return null;
  }
  const [, hours, minutes, secs, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(secs) +
    Number(millis.padEnd(3, '0')) / 1000
  );
}

/** Parse an SRT document into timestamped segments. Malformed blocks are skipped. */
export function parseSrt(srt: string): IProvenanceTranscriptSegment[] {
  if (typeof srt !== 'string' || srt.trim().length === 0) {
    return [];
  }

  const segments: IProvenanceTranscriptSegment[] = [];
  const blocks = srt.replace(/\r\n/g, '\n').split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      continue;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) {
      continue;
    }

    const [rawStart, rawEnd] = lines[timeLineIndex].split('-->');
    const start = parseSrtTimestamp(rawStart ?? '');
    const end = parseSrtTimestamp(rawEnd ?? '');
    if (start === null || end === null) {
      continue;
    }

    const text = lines
      .slice(timeLineIndex + 1)
      .join('\n')
      .trim();
    if (text.length === 0) {
      continue;
    }

    segments.push({ end, start, text });
  }

  return segments;
}

function sanitizeSegments(
  segments: IProvenanceTranscriptSegment[],
): IProvenanceTranscriptSegment[] {
  return segments
    .filter(
      (segment) =>
        segment &&
        typeof segment.text === 'string' &&
        segment.text.trim().length > 0 &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end >= segment.start,
    )
    .map((segment) => ({
      end: Math.max(0, segment.end),
      start: Math.max(0, segment.start),
      text: segment.text.trim(),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Resolve raw transcript input into normalized timestamped segments.
 * Priority: explicit `segments` → `srt` → single cue from `text`.
 */
function resolveSegments(
  transcript: IMediaTranscriptInput | null | undefined,
  fallbackDurationSeconds: number | null,
): IProvenanceTranscriptSegment[] {
  if (!transcript) {
    return [];
  }

  if (Array.isArray(transcript.segments) && transcript.segments.length > 0) {
    return sanitizeSegments(transcript.segments);
  }

  if (stringOrNull(transcript.srt)) {
    return sanitizeSegments(parseSrt(transcript.srt as string));
  }

  const text = stringOrNull(transcript.text);
  if (text) {
    const end =
      fallbackDurationSeconds && fallbackDurationSeconds > 0
        ? fallbackDurationSeconds
        : 0;
    return [{ end, start: 0, text: text.trim() }];
  }

  return [];
}

function buildVtt(segments: IProvenanceTranscriptSegment[]): string {
  if (segments.length === 0) {
    return `${VTT_HEADER}\n`;
  }

  const cues = segments.map((segment, index) => {
    const range = `${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end)}`;
    return `${index + 1}\n${range}\n${segment.text}`;
  });

  return `${VTT_HEADER}\n\n${cues.join('\n\n')}\n`;
}

/**
 * Build the transcript sidecar (WebVTT + structured segments) for an asset.
 * Always returns a valid sidecar, even when no transcript data is available.
 */
export function buildTranscriptSidecar(
  assetId: string,
  transcript: IMediaTranscriptInput | null | undefined,
  options: {
    fallbackDurationSeconds?: number | null;
    language?: string | null;
  } = {},
): IMediaTranscriptSidecar {
  const segments = resolveSegments(
    transcript,
    numberOrNull(options.fallbackDurationSeconds ?? null),
  );

  return {
    filename: `${assetId}.transcript.vtt`,
    format: 'vtt',
    // A cue carries real timing if it has a positive duration OR a non-zero
    // start (e.g. a zero-duration chapter marker at t=5s). Only the text-only
    // fallback cue at 0→0 counts as "no timestamps".
    hasTimestamps: segments.some(
      (segment) => segment.start > 0 || segment.end > segment.start,
    ),
    language:
      stringOrNull(transcript?.language) ?? stringOrNull(options.language),
    segmentCount: segments.length,
    segments,
    vtt: buildVtt(segments),
  };
}

function normalizeMedia(
  media: Partial<IMediaTechnicalMetadata> | null | undefined,
): IMediaTechnicalMetadata {
  return {
    durationSeconds: numberOrNull(media?.durationSeconds),
    fps: numberOrNull(media?.fps),
    hasAudio: booleanOrNull(media?.hasAudio),
    height: numberOrNull(media?.height),
    resolution: stringOrNull(media?.resolution),
    width: numberOrNull(media?.width),
  };
}

function normalizeGeneration(
  generation: Partial<IMediaGenerationProvenance> | null | undefined,
): IMediaGenerationProvenance {
  return {
    completedAt: stringOrNull(generation?.completedAt),
    lora: stringOrNull(generation?.lora),
    model: stringOrNull(generation?.model),
    negativePrompt: stringOrNull(generation?.negativePrompt),
    prompt: stringOrNull(generation?.prompt),
    seed: numberOrNull(generation?.seed),
    source: stringOrNull(generation?.source),
    workflow: stringOrNull(generation?.workflow),
  };
}

function toTranscriptReference(
  sidecar: IMediaTranscriptSidecar,
): IMediaTranscriptReference {
  return {
    filename: sidecar.filename,
    format: sidecar.format,
    hasTimestamps: sidecar.hasTimestamps,
    language: sidecar.language,
    segmentCount: sidecar.segmentCount,
  };
}

/**
 * Build the canonical provenance manifest for an asset from resolved input and
 * the already-built transcript sidecar.
 */
export function buildProvenanceManifest(
  input: IMediaProvenanceInput,
  sidecar: IMediaTranscriptSidecar,
): IMediaProvenanceManifest {
  return {
    assetId: input.assetId,
    canonicalUrl: stringOrNull(input.canonicalUrl),
    contentHash: stringOrNull(input.contentHash),
    generatedAt: input.generatedAt,
    generation: normalizeGeneration(input.generation),
    kind: stringOrNull(input.kind) ?? DEFAULT_KIND,
    language: stringOrNull(input.language),
    media: normalizeMedia(input.media),
    mimeType: stringOrNull(input.mimeType),
    schemaVersion: MEDIA_PROVENANCE_SCHEMA_VERSION,
    sizeBytes: numberOrNull(input.sizeBytes),
    storageKey: stringOrNull(input.storageKey),
    transcript: toTranscriptReference(sidecar),
  };
}

/**
 * Build the full canonical media package for a single video: a stable asset ID,
 * a transcript sidecar with timestamps, and a JSON manifest with canonical URLs
 * and generation metadata. Pure and deterministic — the caller supplies
 * `generatedAt`.
 */
export function buildMediaProvenancePackage(
  input: IMediaProvenanceInput,
): IMediaProvenancePackage {
  const assetId = stringOrNull(input.assetId);
  if (!assetId) {
    throw new Error(
      'buildMediaProvenancePackage: a non-empty assetId is required',
    );
  }

  const sidecar = buildTranscriptSidecar(assetId, input.transcript, {
    fallbackDurationSeconds: input.media?.durationSeconds ?? null,
    language: input.language,
  });

  const manifest = buildProvenanceManifest({ ...input, assetId }, sidecar);

  return {
    assetId,
    manifest,
    manifestFilename: `${assetId}.manifest.json`,
    transcriptSidecar: sidecar,
  };
}

export function buildMediaWatermarkAttributionEvaluation(
  mediaPackage: IMediaProvenancePackage,
): IMediaWatermarkAttributionEvaluation {
  const { manifest, transcriptSidecar } = mediaPackage;
  const hasAddressableAsset = Boolean(
    manifest.canonicalUrl ?? manifest.storageKey,
  );
  const hasContentHash = Boolean(manifest.contentHash);
  const hasTimestampedTranscript =
    transcriptSidecar.hasTimestamps && transcriptSidecar.segmentCount > 0;

  const missingSignals = [
    hasAddressableAsset ? null : 'canonicalUrl_or_storageKey',
    hasContentHash ? null : 'contentHash',
    hasTimestampedTranscript ? null : 'timestampedTranscript',
  ].filter((signal): signal is string => signal !== null);

  const manifestReadiness = hasAddressableAsset ? 'ready' : 'partial';
  const manifestTamperDetection = hasContentHash ? 'high' : 'low';
  const manifestAttributionStrength =
    hasAddressableAsset && hasTimestampedTranscript ? 'high' : 'medium';

  const recommendedAction = hasContentHash
    ? 'Use the provenance manifest and transcript sidecar as the primary attribution signal; verify the content hash before claiming tamper detection.'
    : 'Use the provenance manifest and transcript sidecar as the primary attribution signal; add a content hash before claiming tamper detection.';

  return {
    approaches: [
      {
        approach: 'provenance_manifest',
        attributionStrength: manifestAttributionStrength,
        detectionMethod:
          'Read the manifest, transcript sidecar, canonical URL or storage key, and optional content hash.',
        fallbackBehavior:
          'If the package cannot be verified, show manifest/transcript attribution as informational only.',
        label: 'Manifest and transcript sidecar',
        rationale:
          'This path is deterministic, has no viewer impact, and already follows the Genfeed provenance export contract.',
        readiness: manifestReadiness,
        requiredSignals: [
          'assetId',
          'generatedAt',
          'canonicalUrl_or_storageKey',
          'transcriptSidecar',
          'contentHash_for_tamper_detection',
        ],
        tamperDetection: manifestTamperDetection,
        viewerImpact: 'none',
      },
      {
        approach: 'visible_watermark',
        attributionStrength: 'low',
        detectionMethod:
          'Inspect rendered pixels or visible overlay text such as @genfeedai.',
        fallbackBehavior:
          'Use only for preview or social exports where a viewer-facing mark is acceptable.',
        label: 'Visible overlay watermark',
        rationale:
          'The files service can add visible overlays today, but the mark is removable and changes the viewer experience.',
        readiness: 'ready',
        requiredSignals: ['watermarkText', 'renderedOutput'],
        tamperDetection: 'low',
        viewerImpact: 'medium',
      },
      {
        approach: 'hidden_watermark',
        attributionStrength: 'medium',
        detectionMethod:
          'A future keyed embedder and detector would need to read the media payload and return confidence scores.',
        fallbackBehavior:
          'Do not claim hidden-watermark attribution until an embedder, detector, key policy, and false-positive threshold exist.',
        label: 'Hidden media watermark',
        rationale:
          'No hidden-watermark embedder or detector exists in the current Genfeed media pipeline, so this remains an evaluation target rather than a serving dependency.',
        readiness: 'blocked',
        requiredSignals: [
          'watermarkKeyId',
          'embedderVersion',
          'detectorVersion',
          'confidenceThreshold',
        ],
        tamperDetection: 'medium',
        viewerImpact: 'none',
      },
      {
        approach: 'content_credentials',
        attributionStrength: hasContentHash ? 'high' : 'medium',
        detectionMethod:
          'Verify a signed C2PA/content-credentials assertion against the exported media hash.',
        fallbackBehavior:
          'Emit the Genfeed manifest package until signing and media embedding are available.',
        label: 'Content credentials',
        rationale:
          'Content credentials are the strongest portable path, but this repo currently has the manifest data contract rather than a signer/embedder.',
        readiness: hasContentHash ? 'partial' : 'blocked',
        requiredSignals: [
          'contentHash',
          'signingCertificate',
          'embeddedAssertion',
          'verificationTooling',
        ],
        tamperDetection: hasContentHash ? 'high' : 'none',
        viewerImpact: 'none',
      },
    ],
    assetId: mediaPackage.assetId,
    fallbackBehavior:
      'Keep exporting the manifest and transcript sidecar; fall back to visible overlay only when the export target needs a viewer-facing brand mark.',
    generatedAt: manifest.generatedAt,
    missingSignals,
    primaryApproach: 'provenance_manifest',
    recommendedAction,
    schemaVersion: MEDIA_WATERMARK_ATTRIBUTION_SCHEMA_VERSION,
  };
}

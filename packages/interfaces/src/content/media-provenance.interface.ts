/**
 * Media provenance types.
 *
 * Shapes for the canonical "media package" emitted by the provenance export step
 * (issue #31): a stable asset ID, a transcript sidecar with timestamps, and a
 * JSON manifest carrying canonical URLs + generation metadata.
 *
 * These are pure data shapes with no framework or DB coupling so the builder in
 * `@genfeedai/helpers` (and any consumer) can produce a deterministic package.
 */

/** Sidecar transcript output format. Currently WebVTT only. */
export type MediaTranscriptFormat = 'vtt';

/**
 * A timestamped transcript segment. `start`/`end` are in SECONDS to match the
 * `ITranscriptSegment` shape produced across the Whisper/clip pipeline.
 */
export interface IProvenanceTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** Technical media metadata for a video asset (sourced from the Metadata row). */
export interface IMediaTechnicalMetadata {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  resolution: string | null;
  hasAudio: boolean | null;
}

/** Generation provenance for a media asset (model, prompt, seed, etc.). */
export interface IMediaGenerationProvenance {
  model: string | null;
  lora: string | null;
  prompt: string | null;
  negativePrompt: string | null;
  seed: number | null;
  source: string | null;
  workflow: string | null;
  completedAt: string | null;
}

/**
 * Raw transcript input. Resolution priority: `segments` → `srt` → `text`.
 * Whichever is present (in that order) is used to build the sidecar.
 */
export interface IMediaTranscriptInput {
  segments?: IProvenanceTranscriptSegment[] | null;
  srt?: string | null;
  text?: string | null;
  language?: string | null;
}

/**
 * Input describing a single video for which to build a provenance package.
 * Pure data only — callers map their DB records onto this shape.
 */
export interface IMediaProvenanceInput {
  /** Stable asset identifier (e.g. the Ingredient id). Required, non-empty. */
  assetId: string;
  /** Media kind. Defaults to `'video'`. */
  kind?: string;
  /** Public/canonical URL of the asset (e.g. the CDN URL). */
  canonicalUrl?: string | null;
  /** Storage key/path of the asset (e.g. the S3 key). */
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  language?: string | null;
  /** Content hash (e.g. sha256), when known. Reserved for content-addressing. */
  contentHash?: string | null;
  media?: Partial<IMediaTechnicalMetadata> | null;
  generation?: Partial<IMediaGenerationProvenance> | null;
  transcript?: IMediaTranscriptInput | null;
  /**
   * ISO timestamp marking when the package was generated. Supplied by the caller
   * so the builder stays pure and deterministic.
   */
  generatedAt: string;
}

/** The transcript sidecar artifact emitted alongside the manifest. */
export interface IMediaTranscriptSidecar {
  filename: string;
  format: MediaTranscriptFormat;
  language: string | null;
  hasTimestamps: boolean;
  segmentCount: number;
  segments: IProvenanceTranscriptSegment[];
  /** The serialized WebVTT document. */
  vtt: string;
}

/** Reference to the transcript sidecar embedded in the manifest. */
export interface IMediaTranscriptReference {
  filename: string;
  format: MediaTranscriptFormat;
  language: string | null;
  hasTimestamps: boolean;
  segmentCount: number;
}

/** The canonical provenance manifest (serialized to `<assetId>.manifest.json`). */
export interface IMediaProvenanceManifest {
  schemaVersion: number;
  assetId: string;
  kind: string;
  canonicalUrl: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  language: string | null;
  contentHash: string | null;
  media: IMediaTechnicalMetadata;
  generation: IMediaGenerationProvenance;
  transcript: IMediaTranscriptReference;
  generatedAt: string;
}

/** The full canonical media package emitted by the export step. */
export interface IMediaProvenancePackage {
  assetId: string;
  manifestFilename: string;
  manifest: IMediaProvenanceManifest;
  transcriptSidecar: IMediaTranscriptSidecar;
}

/** Public API route references for a generated media provenance package. */
export interface IPublicMediaRouteReference {
  assetId: string;
  kind: string;
  canonicalUrl: string | null;
  /**
   * Path to the public page for this asset. `null` for media kinds that do not
   * have a dedicated public page (mirrors the nullability of `mediaPath`).
   * Currently only `'video'` produces a non-null value.
   */
  publicPagePath: string | null;
  mediaPath: string | null;
  provenancePath: string;
  manifestPath: string;
  transcriptPath: string;
  manifestFilename: string;
  transcriptFilename: string;
}

/*
 * Read shapes consumed by the API provenance export service. They describe the
 * narrow projection of DB rows the service reads when assembling a package, kept
 * here (not inline in the service) so the type contracts stay centralized.
 */

/** Caller scope used to constrain a provenance lookup to the requester's user/org. */
export interface IProvenanceScope {
  organizationId?: string;
  userId?: string;
}

/** Read shape of the fields the provenance export consumes from a video Ingredient row. */
export interface IVideoProvenanceRecord {
  _id?: string;
  id?: string;
  category?: string;
  cdnUrl?: string | null;
  s3Key?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  language?: string | null;
  metadataId?: string | null;
  modelUsed?: string | null;
  loraUsed?: string | null;
  generationPrompt?: string | null;
  negativePrompt?: string | null;
  generationSeed?: number | null;
  generationSource?: string | null;
  workflowUsed?: string | null;
  generationCompletedAt?: Date | string | null;
}

/** Read shape of the fields the provenance export consumes from a Metadata row. */
export interface IMetadataProvenanceRecord {
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  resolution?: string | null;
  hasAudio?: boolean | null;
}

import {
  type BrandDecodedVisual,
  type BrandEncodedVisual,
  decodeBrandImage,
  encodeBrandAnalysisImage,
  sampleBrandVideoPngFrames,
} from '@api/services/brand-validation/brand-validation-pixels.util';
import type { BrandArtifactValidationInputV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const VISUAL_ROLES = ['primary', 'image', 'video'];

export interface BrandVisualPart {
  id: string;
  version: string;
  hash: string;
  mediaKind: 'image' | 'video';
}
export type BrandVisualSelection =
  | { kind: 'unknown'; reasonCode: string }
  | { kind: 'selected'; part: BrandVisualPart; bytes: Uint8Array };

/**
 * The single final image or video of one artifact, decoded at most once per
 * validation however many checks read it. Every method answers null or an
 * `unknown` reason instead of throwing, so a check that cannot be proven stays
 * unknown.
 */
export class BrandArtifactVisual {
  private readonly selected: BrandVisualSelection;
  private encoded: Promise<BrandEncodedVisual | null> | null = null;
  private decoded: Promise<BrandDecodedVisual | null> | null = null;

  constructor(input: BrandArtifactValidationInputV1) {
    this.selected = select(input);
  }

  get selection(): BrandVisualSelection {
    return this.selected;
  }

  /** Frames as PNGs a vision model can read; null when the bytes cannot be decoded. */
  analysisFrames(): Promise<BrandEncodedVisual | null> {
    if (this.selected.kind !== 'selected') return Promise.resolve(null);
    const { bytes, part } = this.selected;
    this.encoded ??=
      part.mediaKind === 'video'
        ? sampleBrandVideoPngFrames(bytes)
        : encodeBrandAnalysisImage(bytes);
    return this.encoded;
  }

  /** Bounded raw pixels of every frame, for palette measurement. */
  pixels(): Promise<BrandDecodedVisual | null> {
    if (this.selected.kind !== 'selected') return Promise.resolve(null);
    const { bytes, part } = this.selected;
    this.decoded ??= (async () => {
      if (part.mediaKind === 'image') return decodeBrandImage(bytes);
      const sampled = await this.analysisFrames();
      if (!sampled) return null;
      const frames = [];
      for (const png of sampled.frames) {
        const frame = (await decodeBrandImage(png))?.frames[0];
        if (!frame) return null;
        frames.push(frame);
      }
      return { decoder: sampled.decoder, frames };
    })();
    return this.decoded;
  }
}

function select(input: BrandArtifactValidationInputV1): BrandVisualSelection {
  const { artifact, material } = input;
  if (artifact.mediaKind === 'text')
    return { kind: 'unknown', reasonCode: 'visual_part_unavailable' };
  const visuals = artifact.parts.filter((part) =>
    VISUAL_ROLES.includes(part.role),
  );
  if (visuals.length !== 1)
    return { kind: 'unknown', reasonCode: 'visual_part_unavailable' };
  // A layer placed over the base changes the final pixels; the base alone proves nothing.
  if (artifact.parts.some((part) => part.role === 'overlay'))
    return { kind: 'unknown', reasonCode: 'visual_composite_unproven' };
  const descriptor = visuals[0];
  const bytes = material.parts.find(
    (part) =>
      part.partId === descriptor.id && part.partVersion === descriptor.version,
  )?.bytes;
  if (!bytes) return { kind: 'unknown', reasonCode: 'visual_part_unavailable' };
  return {
    kind: 'selected',
    bytes,
    part: {
      hash: descriptor.contentHash,
      id: descriptor.id,
      mediaKind: artifact.mediaKind === 'video' ? 'video' : 'image',
      version: descriptor.version,
    },
  };
}

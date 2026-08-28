import type { VideoGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import {
  type GenerationBriefConstraint,
  type GenerationBriefProvenance,
  type GenerationBriefReference,
  type GenerationFidelityMode,
  videoGenerationBriefSchema,
} from '@api-types/contracts/generation-brief.contract';
import { calculateAspectRatio } from '@genfeedai/helpers';

export interface AssembleVideoGenerationBriefInput {
  audioDirection?: string;
  avoid?: string[];
  cinematography?: string;
  composition?: string;
  durationSeconds?: number;
  endFrameId?: string;
  fidelityMode: GenerationFidelityMode;
  height?: number;
  lighting?: string;
  motion?: string;
  objective: string;
  referenceIds?: string[];
  references?: readonly GenerationBriefReference[];
  resolution?: string;
  requestedText?: string[];
  scene?: string;
  subjects?: string[];
  visualDirection?: string;
  visualDirectionSource?: GenerationBriefProvenance['source'];
  videoReferenceIds?: string[];
  width?: number;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueTexts(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value): value is string => value.length > 0),
    ),
  ];
}

export function assembleVideoGenerationBrief(
  input: AssembleVideoGenerationBriefInput,
): VideoGenerationBrief {
  const provenance: GenerationBriefProvenance[] = [
    { field: 'intent.objective', source: 'user' },
  ];
  const scene = optionalText(input.scene);
  const lighting = optionalText(input.lighting);
  const composition = optionalText(input.composition);
  const visualDirection = optionalText(input.visualDirection);
  const cinematography = optionalText(input.cinematography);
  const motion = optionalText(input.motion);
  const audioDirection = optionalText(input.audioDirection);
  const subjects = uniqueTexts(input.subjects);
  const requestedText = uniqueTexts(input.requestedText);
  const constraints: GenerationBriefConstraint[] = uniqueTexts(input.avoid).map(
    (value) => ({
      kind: 'avoid' as const,
      required: input.fidelityMode === 'strict',
      value,
    }),
  );

  if (scene) {
    provenance.push({ field: 'intent.scene', source: 'user' });
  }
  if (lighting) {
    provenance.push({ field: 'intent.lighting', source: 'user' });
  }
  if (composition) {
    provenance.push({ field: 'intent.composition', source: 'user' });
  }
  if (visualDirection) {
    provenance.push({
      field: 'intent.visualDirection',
      source: input.visualDirectionSource ?? 'user',
    });
  }
  if (cinematography) {
    provenance.push({ field: 'intent.cinematography', source: 'user' });
  }
  if (motion) {
    provenance.push({ field: 'intent.motion', source: 'user' });
  }
  if (audioDirection) {
    provenance.push({ field: 'intent.audioDirection', source: 'user' });
  }

  const referenceIds = uniqueTexts(input.referenceIds);
  const references: GenerationBriefReference[] = input.references
    ? [...input.references]
    : referenceIds.map((assetId, index) => ({
        assetId,
        role: index === 0 ? ('first_frame' as const) : ('subject' as const),
      }));

  const endFrameId = optionalText(input.endFrameId);
  if (endFrameId) {
    references.push({ assetId: endFrameId, role: 'last_frame' as const });
    provenance.push({ field: 'references.last_frame', source: 'user' });
  }

  for (const assetId of uniqueTexts(input.videoReferenceIds)) {
    references.push({ assetId, role: 'reference_video' as const });
  }
  if (input.videoReferenceIds?.length) {
    provenance.push({ field: 'references.reference_video', source: 'user' });
  }

  const width = input.width;
  const height = input.height;
  const hasPairedDimensions =
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0;
  const aspectRatio = hasPairedDimensions
    ? calculateAspectRatio(width, height)
    : undefined;

  const durationSeconds =
    typeof input.durationSeconds === 'number' && input.durationSeconds > 0
      ? input.durationSeconds
      : undefined;

  const brief = videoGenerationBriefSchema.parse({
    constraints,
    fidelityMode: input.fidelityMode,
    intent: {
      ...(audioDirection ? { audioDirection } : {}),
      ...(cinematography ? { cinematography } : {}),
      ...(composition ? { composition } : {}),
      ...(lighting ? { lighting } : {}),
      ...(motion ? { motion } : {}),
      objective: input.objective.trim(),
      requestedText,
      ...(scene ? { scene } : {}),
      subjects,
      ...(visualDirection ? { visualDirection } : {}),
    },
    mediaKind: 'video',
    output: {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(durationSeconds ? { durationSeconds } : {}),
      ...(optionalText(input.resolution)
        ? { resolution: optionalText(input.resolution) }
        : {}),
      ...(hasPairedDimensions ? { height, width } : {}),
    },
    provenance,
    references,
    version: 1,
  });

  return brief;
}

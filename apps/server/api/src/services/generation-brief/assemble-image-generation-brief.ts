import type { ImageGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  type GenerationBriefConstraint,
  type GenerationBriefProvenance,
  type GenerationFidelityMode,
  type ImageGenerationBriefReference,
  imageGenerationBriefSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { calculateAspectRatio } from '@genfeedai/helpers';

export interface AssembleImageGenerationBriefInput {
  avoid?: string[];
  composition?: string;
  fidelityMode: GenerationFidelityMode;
  height?: number;
  lighting?: string;
  objective: string;
  referenceIds?: string[];
  references?: readonly ImageGenerationBriefReference[];
  requestedText?: string[];
  scene?: string;
  subjects?: string[];
  visualDirection?: string;
  visualDirectionSource?: GenerationBriefProvenance['source'];
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

export function assembleImageGenerationBrief(
  input: AssembleImageGenerationBriefInput,
): ImageGenerationBrief {
  const provenance: GenerationBriefProvenance[] = [
    { field: 'intent.objective', source: 'user' },
  ];
  const scene = optionalText(input.scene);
  const lighting = optionalText(input.lighting);
  const composition = optionalText(input.composition);
  const visualDirection = optionalText(input.visualDirection);
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

  const references: ImageGenerationBriefReference[] = input.references
    ? [...input.references]
    : uniqueTexts(input.referenceIds).map((assetId) => ({
        assetId,
        role: 'subject' as const,
      }));

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

  const brief = imageGenerationBriefSchema.parse({
    constraints,
    fidelityMode: input.fidelityMode,
    intent: {
      ...(composition ? { composition } : {}),
      ...(lighting ? { lighting } : {}),
      objective: input.objective.trim(),
      requestedText,
      ...(scene ? { scene } : {}),
      subjects,
      ...(visualDirection ? { visualDirection } : {}),
    },
    mediaKind: 'image',
    output: {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(hasPairedDimensions ? { height, width } : {}),
    },
    provenance,
    references,
    version: 1,
  });

  return brief;
}

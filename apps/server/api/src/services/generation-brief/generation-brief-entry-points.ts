import type {
  GenerationBriefExemptionReason,
  GenerationBriefSurface,
} from '@api-types/contracts/generation-brief-compiler.contract';

export interface GenerationBriefGenerativeEntryPoint {
  id: string;
  marker: string;
  source: string;
  surface: GenerationBriefSurface;
}

export interface GenerationBriefExemptEntryPoint {
  id: string;
  reason: GenerationBriefExemptionReason;
  source: string;
}

/**
 * Every generative image/video entry that must call the shared brief pipeline
 * (#3469). The matching spec reads each source file and fails if the marker
 * is missing.
 */
export const GENERATION_BRIEF_GENERATIVE_ENTRY_POINTS: readonly GenerationBriefGenerativeEntryPoint[] =
  [
    {
      id: 'studio-image',
      marker: 'runImageGenerationBrief',
      source:
        'apps/server/api/src/collections/images/services/image-generation.service.ts',
      surface: 'studio',
    },
    {
      id: 'studio-video',
      marker: 'runVideoGenerationBrief',
      source:
        'apps/server/api/src/collections/videos/services/video-generation-preparation.service.ts',
      surface: 'studio',
    },
    {
      id: 'workflow-imageGen',
      marker: 'runImageGenerationBrief',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
      surface: 'workflow',
    },
    {
      id: 'workflow-videoGen',
      marker: 'runVideoGenerationBrief',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
      surface: 'workflow',
    },
    {
      id: 'agent-skill-image',
      marker: 'runImageGenerationBrief',
      source:
        'apps/server/api/src/services/skill-executor/handlers/image-generation.handler.ts',
      surface: 'agent_skill',
    },
  ];

/**
 * Non-generative media operations that must bypass compilation without
 * changing their existing output. Listed explicitly so a new generation
 * executor cannot skip the brief silently.
 */
export const GENERATION_BRIEF_ENTRY_EXEMPTIONS: readonly GenerationBriefExemptEntryPoint[] =
  [
    {
      id: 'workflow-lipSync',
      reason: 'non_generative_transform',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
    },
    {
      id: 'workflow-textToSpeech',
      reason: 'non_generative_transform',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
    },
    {
      id: 'workflow-reframe',
      reason: 'non_generative_transform',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
    },
    {
      id: 'workflow-upscale',
      reason: 'non_generative_transform',
      source:
        'apps/server/api/src/collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
    },
  ];

/**
 * Persona Video Content Node
 *
 * SAAS category node that generates video content for an AI persona.
 * Combines the persona's avatar and voice to create video content
 * using HeyGen or Hedra providers.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Persona Video Content Node Data
 *
 * Inputs:
 * - brand (brand): Brand context
 * - script (text): Video script/narration text
 *
 * Outputs:
 * - video (video): Generated video URL
 */
export interface PersonaVideoContentNodeData extends BaseNodeData {
  type: 'personaVideoContent';

  // Configuration
  personaId: string | null;
  script: string | null;
  aspectRatio: '16:9' | '9:16' | '1:1';

  // Resolved at execution time
  resolvedPersonaId: string | null;
  resolvedPersonaLabel: string | null;
  resolvedAvatarProvider: string | null;
  resolvedVideoUrl: string | null;
  resolvedJobId: string | null;
}

/**
 * Default data for a new Persona Video Content node
 */
export const DEFAULT_PERSONA_VIDEO_CONTENT_DATA: Partial<PersonaVideoContentNodeData> =
  {
    aspectRatio: '16:9',
    label: 'Persona Video',
    personaId: null,
    resolvedAvatarProvider: null,
    resolvedJobId: null,
    resolvedPersonaId: null,
    resolvedPersonaLabel: null,
    resolvedVideoUrl: null,
    script: null,
    status: 'idle',
    type: 'personaVideoContent',
  };

/**
 * Persona Video Content node definition for registry
 */
export const personaVideoContentNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_PERSONA_VIDEO_CONTENT_DATA,
  description: 'Generate video content with AI persona avatar and voice',
  icon: 'Video',
  inputs: [
    { id: 'brand', label: 'Brand', required: true, type: 'brand' },
    { id: 'script', label: 'Script', type: 'text' },
  ],
  label: 'Persona Video',
  outputs: [{ id: 'video', label: 'Generated Video', type: 'video' }],
  type: 'personaVideoContent',
};

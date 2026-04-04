/**
 * Persona Photo Session Node
 *
 * SAAS category node that generates batch photos for an AI persona.
 * Takes a persona reference and generates N photos using the persona's
 * configured avatar provider (HeyGen or Hedra).
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Persona Photo Session Node Data
 *
 * Inputs:
 * - brand (brand): Brand context
 *
 * Outputs:
 * - images (image[]): Generated photo URLs
 */
export interface PersonaPhotoSessionNodeData extends BaseNodeData {
  type: 'personaPhotoSession';

  // Configuration
  personaId: string | null;
  count: number;
  prompt: string | null;

  // Resolved at execution time
  resolvedPersonaId: string | null;
  resolvedPersonaLabel: string | null;
  resolvedAvatarProvider: string | null;
  resolvedImageUrls: string[];
  resolvedJobIds: string[];
}

/**
 * Default data for a new Persona Photo Session node
 */
export const DEFAULT_PERSONA_PHOTO_SESSION_DATA: Partial<PersonaPhotoSessionNodeData> =
  {
    count: 1,
    label: 'Persona Photo Session',
    personaId: null,
    prompt: null,
    resolvedAvatarProvider: null,
    resolvedImageUrls: [],
    resolvedJobIds: [],
    resolvedPersonaId: null,
    resolvedPersonaLabel: null,
    status: 'idle',
    type: 'personaPhotoSession',
  };

/**
 * Persona Photo Session node definition for registry
 */
export const personaPhotoSessionNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_PERSONA_PHOTO_SESSION_DATA,
  description: 'Generate batch photos for an AI persona using their avatar',
  icon: 'Camera',
  inputs: [{ id: 'brand', label: 'Brand', required: true, type: 'brand' }],
  label: 'Persona Photo Session',
  outputs: [
    { id: 'images', label: 'Generated Photos', multiple: true, type: 'image' },
  ],
  type: 'personaPhotoSession',
};

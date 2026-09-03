import { Ingredient } from '@models/content/ingredient.model';

export class Voice extends Ingredient {
  declare public provider?: string;
  declare public externalVoiceId?: string;
  declare public cloneStatus?: string;
  declare public sampleAudioUrl?: string;
  declare public isCloned?: boolean;
  declare public isActive?: boolean;
  declare public isDefaultSelectable?: boolean;
  declare public providerData?: Record<string, unknown>;
  declare public isFeatured?: boolean;
  declare public voiceSource?: 'catalog' | 'cloned' | 'generated';
  // FK to the ExternalVoice catalog entry this voice was generated/cloned from.
  // Catalog entries live in the ExternalVoice table, not in ingredients.
  declare public externalVoiceCatalogId?: string;
}

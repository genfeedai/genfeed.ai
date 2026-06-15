import { Ingredient } from '@models/content/ingredient.model';

export class Voice extends Ingredient {
  public declare provider?: string;
  public declare externalVoiceId?: string;
  public declare cloneStatus?: string;
  public declare sampleAudioUrl?: string;
  public declare isCloned?: boolean;
  public declare isActive?: boolean;
  public declare isDefaultSelectable?: boolean;
  public declare providerData?: Record<string, unknown>;
  public declare isFeatured?: boolean;
  public declare voiceSource?: 'catalog' | 'cloned' | 'generated';
  // FK to the ExternalVoice catalog entry this voice was generated/cloned from.
  // Catalog entries live in the ExternalVoice table, not in ingredients.
  public declare externalVoiceCatalogId?: string;
}

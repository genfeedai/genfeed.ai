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
}

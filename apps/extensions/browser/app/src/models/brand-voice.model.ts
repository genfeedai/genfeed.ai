export interface BrandVoice {
  tone?: string;
  voice?: string;
  audience?: string;
  doNotSoundLike?: string[];
  messagingPillars?: string[];
  sampleOutput?: string;
  values?: string[];
  taglines?: string[];
  hashtags?: string[];
}

export interface BrandListItem {
  id: string;
  label: string;
  handle: string;
  description?: string;
  logoUrl?: string;
  isSelected: boolean;
}

export type BrandCharacterSheetStep = 'describe' | 'candidate' | 'approve';

export interface BrandCharacterListItem {
  avatarIngredientId?: string | null;
  handle?: string | null;
  id: string;
  label: string;
}

export interface BrandCharacterCandidate {
  id: string;
  url: string;
}

export interface ComposeCharacterSheetPromptInput {
  description: string;
  isNonHumanoid?: boolean;
}

export interface ComposeCharacterSheetPromptResult {
  prompt: string;
}

export interface CreatePersonaFromSheetInput {
  assetId: string;
  handle: string;
  label: string;
}

export interface GenerateCharacterSheetInput {
  brandId: string;
  description: string;
  isNonHumanoid: boolean;
  seed?: number;
}

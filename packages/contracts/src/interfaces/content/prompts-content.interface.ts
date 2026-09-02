export interface IPromptData {
  id: string;
  original: string;
  enhanced: string;
  category: string;
  ingredient?: {
    id: string;
    ingredientUrl?: string;
    thumbnailUrl?: string;
    category: string;
    title?: string;
    status: string;
    url?: string;
  };
  promptText: string;
  isFavorite?: boolean;
  createdAt: string;
  style?: string;
  mood?: string;
  camera?: string;
  fontFamily?: string;
  blacklists?: string[];
}

export interface IPresetModalData {
  label: string;
  description: string;
  key: string;
  category: string;
  isActive: boolean;
}

export interface IPromptModalData {
  originalPrompt: string;
  enhancedPrompt: string;
  style?: string;
  mood?: string;
  camera?: string;
  fontFamily?: string;
  blacklists?: string[];
}

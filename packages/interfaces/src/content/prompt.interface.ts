import type {
  AssetScope,
  ImageFormat,
  IngredientFormat,
  TrainingCategory,
  UpscaleFactor,
  VideoResolution,
} from '@genfeedai/enums';
import type {
  IBaseEntity,
  IElementCamera,
  IElementMood,
  IElementStyle,
  IFontFamily,
  IIngredient,
  ITag,
} from '../index';

export interface IPrompt extends IBaseEntity {
  user: string;
  organization?: string;
  brand?: string;
  category: string;
  original: string;
  enhanced: string;
  status: string;
  style?: string;
  mood?: string;
  camera?: string;
  fontFamily?: string;
  blacklists?: string[];
  tags?: ITag[];
  model?: string;
  modelSettings?: Record<string, unknown>;
  duration?: number;
  ratio?: string;
  resolution?: string;
  fps?: number;
  ingredient?: IIngredient;
  isSkipEnhancement: boolean;
  systemPromptKey?: string;
  scope?: AssetScope;
  isFavorite?: boolean;
  hasVoted: boolean;
  totalVotes: number;
  isVoteAnimating: boolean;
}

export interface IEditFormData {
  text: string;
  model: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  fps?: 15 | 30 | 45 | 60;
  resolution?: VideoResolution;
  enhanceModel?:
    | 'Standard V2'
    | 'Low Resolution V2'
    | 'CGI'
    | 'High Fidelity V2'
    | 'Text Refine';
  outputFormat?: ImageFormat.JPG | ImageFormat.PNG;
  upscaleFactor?: UpscaleFactor;
  subjectDetection?: 'None' | 'All' | 'Foreground' | 'Background';
  faceEnhancement?: boolean;
  faceEnhancementStrength?: number;
  faceEnhancementCreativity?: number;
}

export interface ITrainingConfig {
  label: string;
  trigger: string;
  steps: number;
  category: TrainingCategory;
  description?: string;
}

export interface IPromptCollections {
  moods: IElementMood[];
  cameras: IElementCamera[];
  fontFamilies: IFontFamily[];
  styles: IElementStyle[];
  isLoading: boolean;
  error: string | null;
}

export interface IEnhancePromptRequest {
  original: string;
  category: string;
  brand?: string;
  organization?: string;
  systemPromptKey?: string;
}

export interface IEnhancePromptResponse {
  original: string;
  enhanced: string;
  category: string;
}

export interface IPromptModalDraft {
  originalPrompt?: string;
  enhancedPrompt?: string;
  style?: string;
  mood?: string;
  camera?: string;
  fontFamily?: string;
  blacklists?: string[];
}

export interface IPromptEnhancement {
  prompt: string;
  style?: string;
  mood?: string;
  camera?: string;
}

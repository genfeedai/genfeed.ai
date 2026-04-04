import { ModelCategory } from '@genfeedai/enums';

export type BrandingMode = 'off' | 'brand';

/**
 * Universal prompt builder parameters
 * Used across all providers (Replicate, OpenAI, KlingAI, etc.)
 */
export interface PromptBuilderParams {
  // Core prompt
  prompt: string;

  // Model category (REQUIRED - from DB model.category via ModelsGuard)
  modelCategory: ModelCategory;

  // Creative elements (for AI model prompts)
  mood?: string;
  style?: string;
  camera?: string;
  cameraMovement?: string;
  lens?: string;
  scene?: string;
  lighting?: string;
  sounds?: string[];
  speech?: string;

  // UI/Processing parameters (not sent to AI models)
  fontFamily?: string;

  // Dimensions
  width?: number;
  height?: number;

  // Generation parameters
  duration?: number;
  seed?: number;
  outputs?: number;
  resolution?: string;

  // References
  references?: string[];
  endFrame?: string; // For video interpolation (Veo 3.1)
  video?: string; // For video-to-video operations
  audioUrl?: string; // For avatar models (Kling Avatar V2)

  // Branding
  brandingMode?: BrandingMode;
  isBrandingEnabled?: boolean;
  isAudioEnabled?: boolean; // For video audio generation (Veo 3.1)
  brand?: {
    label: string;
    description?: string;
    text?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  branding?: {
    tone?: string;
    voice?: string;
    audience?: string;
    values?: string[];
    taglines?: string[];
    hashtags?: string[];
    messagingPillars?: string[];
    doNotSoundLike?: string[];
    sampleOutput?: string;
  };

  // Blacklist/negative prompt
  blacklist?: string[];
  negativePrompt?: string;
  strength?: number;

  // Model-specific
  target_fps?: number;
  target_resolution?: string;

  // Topaz Image Upscale specific
  enhanceModel?: string;
  outputFormat?: string;
  upscaleFactor?: string;
  faceEnhancement?: boolean;
  subjectDetection?: string;
  faceEnhancementStrength?: number;
  faceEnhancementCreativity?: number;

  // Tags (for metadata)
  tags?: string[];

  // Template support
  promptTemplate?: string;
  systemPromptTemplate?: string; // For TEXT models - system prompt template key
  useTemplate?: boolean;

  // LLM / Text generation parameters
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  thinkingLevel?: 'low' | 'high';
}

/**
 * Universal JSON prompt structure
 * Shared across providers that support structured prompts
 */
export interface JsonPrompt {
  text: string;
  elements: {
    mood?: string;
    style?: string;
    camera?: string;
    cameraMovement?: string;
    lens?: string;
    scene?: string;
    lighting?: string;
    sounds?: string;
    speech?: string;
    brand?: {
      label: string;
      description?: string;
      text?: string;
      primaryColor?: string;
      secondaryColor?: string;
    };
    branding?: {
      tone?: string;
      voice?: string;
      audience?: string;
      values?: string[];
      taglines?: string[];
      hashtags?: string[];
      messagingPillars?: string[];
      doNotSoundLike?: string[];
      sampleOutput?: string;
    };
  };
}

/**
 * Replicate model input type system.
 *
 * Provides typed interfaces for each Replicate model's expected input,
 * replacing `Record<string, unknown>` throughout the prompt builder system.
 *
 * Organization:
 * - Base: shared fields across all/most models
 * - Image: per-model input shapes for image generation
 * - Video: per-model input shapes for video generation
 * - Text: per-model input shapes for LLM/text generation
 * - Media: per-model input shapes for music/upscale operations
 */

// ---------------------------------------------------------------------------
// Base / Common
// ---------------------------------------------------------------------------

/** Fields shared by most image generation models */
interface BaseImageInput extends Record<string, unknown> {
  prompt: string;
  aspect_ratio: string;
}

/** Fields shared by most video generation models */
interface BaseVideoInput extends Record<string, unknown> {
  prompt: string;
}

// ---------------------------------------------------------------------------
// IMAGE model inputs
// ---------------------------------------------------------------------------

/** Google Imagen 3/3 Fast/4/4 Fast/4 Ultra */
export interface ImagenInput extends BaseImageInput {
  output_format: string;
  safety_filter_level: string;
}

/** Google Nano Banana (standard) */
export interface NanoBananaInput extends BaseImageInput {
  output_format: string;
  image_input?: string[];
}

/** Google Nano Banana Pro */
export interface NanoBananaProInput extends BaseImageInput {
  output_format: string;
  safety_filter_level: string;
  resolution?: string;
  image_input?: string[];
}

/** Ideogram Character */
export interface IdeogramCharacterInput extends BaseImageInput {
  character_reference_image: string;
  magic_prompt_option: string;
  seed?: number;
  resolution?: string;
}

/** Ideogram V3 (Balanced/Quality/Turbo) */
export interface IdeogramV3Input extends BaseImageInput {
  magic_prompt_option: string;
  seed?: number;
  resolution?: string;
  image?: string;
}

/** ByteDance SeeDream 4 */
export interface SeeDream4Input extends BaseImageInput {
  enhance_prompt: boolean;
  image_input?: string[];
}

/** ByteDance SeeDream 4.5 */
export interface SeeDream45Input extends BaseImageInput {
  size: string;
  image_input?: string[];
}

/** FLUX 1.1 Pro */
export interface Flux11ProInput extends BaseImageInput {
  output_format: string;
  output_quality: number;
  prompt_upsampling: boolean;
  safety_tolerance: number;
  seed?: number;
  image_prompt?: string;
  width?: number;
  height?: number;
}

/** FLUX 2 Dev */
export interface Flux2DevInput extends BaseImageInput {
  disable_safety_checker: boolean;
  go_fast: boolean;
  output_format: string;
  output_quality: number;
  seed?: number;
  input_images?: string[];
  width?: number;
  height?: number;
}

/** FLUX 2 Pro */
export interface Flux2ProInput extends BaseImageInput {
  output_format: string;
  output_quality: number;
  safety_tolerance: number;
  seed?: number;
  resolution?: string;
  input_images?: string[];
  width?: number;
  height?: number;
}

/** FLUX 2 Flex */
export interface Flux2FlexInput extends BaseImageInput {
  guidance: number;
  output_format: string;
  output_quality: number;
  prompt_upsampling: boolean;
  safety_tolerance: number;
  steps: number;
  seed?: number;
  resolution?: string;
  input_images?: string[];
  width?: number;
  height?: number;
}

/** FLUX Kontext Pro */
export interface FluxKontextProInput extends BaseImageInput {
  output_format: string;
  prompt_upsampling: boolean;
  safety_tolerance: number;
  seed?: number;
  input_image?: string;
}

/** FLUX Schnell */
export interface FluxSchnellInput extends BaseImageInput {
  disable_safety_checker: boolean;
  go_fast: boolean;
  num_inference_steps: number;
  num_outputs: number;
  output_format: string;
  output_quality: number;
  seed?: number;
}

/** Qwen Image */
export interface QwenImageInput extends BaseImageInput {
  disable_safety_checker: boolean;
  enhance_prompt: boolean;
  go_fast: boolean;
  guidance: number;
  negative_prompt: string;
  num_inference_steps: number;
  output_format: string;
  output_quality: number;
  seed?: number;
  image?: string;
  strength?: number;
}

/** RunwayML Gen4 Image Turbo */
export interface Gen4ImageTurboInput extends BaseImageInput {
  resolution: string;
  seed?: number;
  reference_images?: string[];
}

/** Luma Reframe Image */
export interface LumaReframeImageInput extends BaseImageInput {
  image: string | undefined;
  model: string;
}

/** Luma Reframe Video */
export interface LumaReframeVideoInput extends Record<string, unknown> {
  aspect_ratio: string;
  prompt: string;
  video: string | undefined;
}

/** Generic image model input — used for auto-discovered models without dedicated builders */
export interface GenericImageInput extends BaseImageInput {
  output_format?: string;
  seed?: number;
  safety_filter_level?: string;
  resolution?: string;
  image_input?: string[];
  input_images?: string[];
  reference_images?: string[];
  input_image?: string;
  image?: string;
}

// Union of all image model inputs
export type ReplicateImageInput =
  | ImagenInput
  | NanoBananaInput
  | NanoBananaProInput
  | IdeogramCharacterInput
  | IdeogramV3Input
  | SeeDream4Input
  | SeeDream45Input
  | Flux11ProInput
  | Flux2DevInput
  | Flux2ProInput
  | Flux2FlexInput
  | FluxKontextProInput
  | FluxSchnellInput
  | QwenImageInput
  | Gen4ImageTurboInput
  | LumaReframeImageInput
  | LumaReframeVideoInput
  | GenericImageInput;

// ---------------------------------------------------------------------------
// VIDEO model inputs
// ---------------------------------------------------------------------------

/** OpenAI Sora 2 */
export interface Sora2Input extends BaseVideoInput {
  aspect_ratio: string;
  seconds: number;
  input_reference?: string;
}

/** OpenAI Sora 2 Pro */
export interface Sora2ProInput extends BaseVideoInput {
  aspect_ratio: string;
  resolution: string;
  seconds: number;
  input_reference?: string;
}

/** Google Veo 2 */
export interface Veo2Input extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  seed: number;
  image?: string;
}

/** Google Veo 3 / 3 Fast */
export interface Veo3Input extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  generate_audio: boolean;
  negative_prompt: string;
  resolution: string;
  seed: number;
  image?: string;
}

/** Google Veo 3.1 */
export interface Veo31Input extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  generate_audio: boolean;
  negative_prompt: string;
  resolution: string;
  seed?: number;
  image?: string;
  last_frame?: string;
  reference_images?: string[];
}

/** Google Veo 3.1 Fast */
export interface Veo31FastInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  generate_audio: boolean;
  negative_prompt: string;
  resolution: string;
  seed?: number;
  image?: string;
  last_frame?: string;
}

/** WAN Video 2.2 I2V Fast */
export interface WanVideoInput extends BaseVideoInput {
  aspect_ratio: string;
  disable_safety_checker: boolean;
  frames_per_second: number;
  go_fast: boolean;
  image: string;
  num_frames: number;
  resolution: string;
  sample_shift: number;
  last_image?: string;
  seed?: number;
}

/** Kwaivgi Kling V2.1 */
export interface KlingV21Input extends BaseVideoInput {
  duration: number;
  mode: string;
  start_image: string;
  negative_prompt?: string;
  end_image?: string;
}

/** Kwaivgi Kling V2.1 Master / V2.5 Turbo Pro */
export interface KlingMasterInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  negative_prompt?: string;
  start_image?: string;
}

/** Kwaivgi Kling V1.6 Pro */
export interface KlingV16ProInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  negative_prompt?: string;
  start_image?: string;
  end_image?: string;
  reference_images?: string[];
}

/** PrunaAI P-Video (text/image/audio → video) */
export interface PVideoInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  resolution?: string;
  fps?: number;
  draft?: boolean;
  prompt_upsampling?: boolean;
  seed?: number;
  image?: string;
  audio?: string;
}

/** Kwaivgi Kling V3 Video */
export interface KlingV3VideoInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  mode: string;
  generate_audio?: boolean;
  negative_prompt?: string;
  start_image?: string;
  end_image?: string;
}

/** Kwaivgi Kling V3 Omni Video */
export interface KlingV3OmniVideoInput extends BaseVideoInput {
  aspect_ratio: string;
  duration: number;
  mode: string;
  generate_audio?: boolean;
  keep_original_sound?: boolean;
  negative_prompt?: string;
  start_image?: string;
  end_image?: string;
  reference_images?: string[];
  reference_video?: string;
  video_reference_type?: string;
}

/** Kwaivgi Kling Avatar V2 */
export interface KlingAvatarV2Input extends Record<string, unknown> {
  image: string;
  audio: string;
  prompt?: string;
}

// Union of all video model inputs
export type ReplicateVideoInput =
  | Sora2Input
  | Sora2ProInput
  | Veo2Input
  | Veo3Input
  | Veo31Input
  | Veo31FastInput
  | WanVideoInput
  | KlingV21Input
  | KlingMasterInput
  | KlingV16ProInput
  | PVideoInput
  | KlingV3VideoInput
  | KlingV3OmniVideoInput
  | KlingAvatarV2Input;

// ---------------------------------------------------------------------------
// TEXT / LLM model inputs
// ---------------------------------------------------------------------------

/** DeepSeek R1 */
export interface DeepSeekR1Input extends Record<string, unknown> {
  frequency_penalty: number;
  max_tokens: number;
  presence_penalty: number;
  prompt: string;
  temperature: number;
  top_p: number;
}

/** OpenAI GPT 5.2 */
export interface GPT52Input extends Record<string, unknown> {
  max_completion_tokens: number;
  prompt: string;
  system_prompt?: string;
  image_input?: string[];
}

/** Anthropic Claude 4.5 Sonnet */
export interface Claude45SonnetInput extends Record<string, unknown> {
  max_tokens: number;
  prompt: string;
  system_prompt?: string;
  temperature?: number;
}

/** OpenAI GPT Image 1.5 */
export interface GPTImage15Input extends Record<string, unknown> {
  aspect_ratio: string;
  prompt: string;
  output_format?: string;
  input_images?: string[];
  number_of_images?: number;
}

/** Google Gemini 2.5 Flash */
export interface Gemini25FlashInput extends Record<string, unknown> {
  max_output_tokens: number;
  prompt: string;
  temperature: number;
  top_p: number;
  system_instruction?: string;
  images?: string[];
}

/** Google Gemini 3 Pro */
export interface Gemini3ProInput extends Record<string, unknown> {
  max_output_tokens: number;
  prompt: string;
  temperature: number;
  top_p: number;
  system_instruction?: string;
  thinking_level?: 'low' | 'high';
  images?: string[];
}

/** Meta Llama 3.1 405B Instruct */
export interface Llama31405BInput extends Record<string, unknown> {
  frequency_penalty: number;
  max_tokens: number;
  presence_penalty: number;
  prompt: string;
  temperature: number;
  top_k: number;
  top_p: number;
  system_prompt?: string;
}

// Union of all text model inputs
export type ReplicateTextInput =
  | DeepSeekR1Input
  | GPT52Input
  | Claude45SonnetInput
  | GPTImage15Input
  | Gemini25FlashInput
  | Gemini3ProInput
  | Llama31405BInput;

// ---------------------------------------------------------------------------
// MEDIA model inputs
// ---------------------------------------------------------------------------

/** Meta MusicGen */
export interface MusicGenInput extends Record<string, unknown> {
  classifier_free_guidance: number;
  continuation: boolean;
  continuation_start: number;
  duration: number;
  model_version: string;
  normalization_strategy: string;
  output_format: string;
  prompt: string;
  seed: number;
  temperature: number;
  top_k: number;
  top_p: number;
}

/** Topaz Image Upscale */
export interface TopazImageUpscaleInput extends Record<string, unknown> {
  enhance_model: string;
  face_enhancement: boolean;
  face_enhancement_creativity: number;
  face_enhancement_strength: number;
  image: string | undefined;
  output_format: string;
  subject_detection: string;
  upscale_factor: string;
}

/** Topaz Video Upscale */
export interface TopazVideoUpscaleInput extends Record<string, unknown> {
  target_fps: number | undefined;
  target_resolution: string | undefined;
  video: string | undefined;
}

// Union of all media model inputs
export type ReplicateMediaInput =
  | MusicGenInput
  | TopazImageUpscaleInput
  | TopazVideoUpscaleInput;

// ---------------------------------------------------------------------------
// Trained / Custom model input
// ---------------------------------------------------------------------------

/** Trained (custom/finetuned) model input */
export interface TrainedModelInput extends Record<string, unknown> {
  aspect_ratio: string;
  disable_safety_checker: boolean;
  num_outputs: number;
  output_format: string;
  output_quality: number;
  prompt: string;
  seed: number;
  image?: string;
}

// ---------------------------------------------------------------------------
// Top-level union
// ---------------------------------------------------------------------------

/**
 * Union of all possible Replicate model input types.
 * Used as the return type of `buildPrompt()` across the builder hierarchy.
 */
export type ReplicateInput =
  | ReplicateImageInput
  | ReplicateVideoInput
  | ReplicateTextInput
  | ReplicateMediaInput
  | TrainedModelInput;

// ---------------------------------------------------------------------------
// Template variables (for PromptBuilderService)
// ---------------------------------------------------------------------------

/** Variables passed to Handlebars templates for prompt rendering */
export interface PromptTemplateVariables extends Record<string, unknown> {
  prompt: string;
  width: number;
  height: number;
  resolution: string;
  mood?: string;
  style?: string;
  camera?: string;
  cameraMovement?: string;
  lens?: string;
  scene?: string;
  lighting?: string;
  speech?: string;
  duration?: number;
  sounds?: string;
  brandName?: string;
  brandDescription?: string;
  brandText?: string;
  brandTone?: string;
  brandVoice?: string;
  brandAudience?: string;
  brandValues?: string;
  brandTaglines?: string;
  brandHashtags?: string;
}

// ---------------------------------------------------------------------------
// Service-level return type
// ---------------------------------------------------------------------------

/** Return shape of PromptBuilderService.buildPrompt() */
export interface PromptBuilderResult {
  input: ReplicateInput;
  templateUsed?: string;
  templateVersion?: number;
  systemPrompt?: string;
}

/**
 * Auto-generated Replicate model types
 * DO NOT EDIT - Run `bun run sync:replicate` to regenerate
 * Generated at: 2026-03-06T02:26:55.223Z
 */

// This file is auto-generated. Do not edit manually.

// =============================================================================
// IMAGE MODELS
// =============================================================================

/**
 * Input parameters for google/nano-banana
 */
export interface NanoBananaInput {
  /**
   * A text description of the image you want to generate
   */
  prompt: string;
  /**
   * Input images to transform or use as reference (supports multiple images)
   * @default []
   */
  image_input?: string[];
  /**
   * Aspect ratio of the generated image
   * @default "match_input_image"
   */
  aspect_ratio?: unknown;
  /**
   * Format of the output image
   * @default "jpg"
   */
  output_format?: unknown;
}

/** Output type for google/nano-banana */
export type NanoBananaOutput = string;

/**
 * Input parameters for google/nano-banana-2
 */
export interface NanoBanana2Input {
  /**
   * A text description of the image you want to generate
   */
  prompt: string;
  /**
   * Input images to transform or use as reference (supports up to 14 images)
   * @default []
   */
  image_input?: string[];
  /**
   * Aspect ratio of the generated image
   * @default "match_input_image"
   */
  aspect_ratio?: unknown;
  /**
   * Resolution of the generated image. Higher resolutions take longer to generate.
   * @default "1K"
   */
  resolution?: unknown;
  /**
   * Use Google Web Search grounding to generate images based on real-time information (e.g. weather, sports scores, recent events).
   * @default false
   */
  google_search?: boolean;
  /**
   * Use Google Image Search grounding to find web images as visual context for generation. When enabled, web search is also used automatically.
   * @default false
   */
  image_search?: boolean;
  /**
   * Format of the output image
   * @default "jpg"
   */
  output_format?: unknown;
}

/** Output type for google/nano-banana-2 */
export type NanoBanana2Output = string;

/**
 * Input parameters for google/nano-banana-pro
 */
export interface NanoBananaProInput {
  /**
   * A text description of the image you want to generate
   */
  prompt: string;
  /**
   * Input images to transform or use as reference (supports up to 14 images)
   * @default []
   */
  image_input?: string[];
  /**
   * Aspect ratio of the generated image
   * @default "match_input_image"
   */
  aspect_ratio?: unknown;
  /**
   * Resolution of the generated image
   * @default "2K"
   */
  resolution?: unknown;
  /**
   * Format of the output image
   * @default "jpg"
   */
  output_format?: unknown;
  /**
   * block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked
   * @default "block_only_high"
   */
  safety_filter_level?: unknown;
  /**
   * Fallback to another model (currently bytedance/seedream-5) if Nano Banana Pro is at capacity.
   * @default false
   */
  allow_fallback_model?: boolean;
}

/** Output type for google/nano-banana-pro */
export type NanoBananaProOutput = string;

/**
 * Input parameters for prunaai/z-image-turbo
 */
export interface ZImageTurboInput {
  /**
   * Text prompt for image generation
   */
  prompt: string;
  /**
   * Height of the generated image
   * @default 1024
   * @range min: 64, max: 2048
   */
  height?: number;
  /**
   * Width of the generated image
   * @default 1024
   * @range min: 64, max: 2048
   */
  width?: number;
  /**
   * Number of inference steps.
   * @default 8
   * @range min: 1, max: 50
   */
  num_inference_steps?: number;
  /**
   * Guidance scale. Should be 0 for Turbo models
   * @default 0
   * @range min: 0, max: 20
   */
  guidance_scale?: number;
  /**
   * Random seed. Set for reproducible generation
   */
  seed?: number;
  /**
   * Apply additional optimizations for faster generation
   * @default false
   */
  go_fast?: boolean;
  /**
   * Format of the output images
   * @default "jpg"
   */
  output_format?: unknown;
  /**
   * Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs
   * @default 80
   * @range min: 0, max: 100
   */
  output_quality?: number;
}

/** Output type for prunaai/z-image-turbo */
export type ZImageTurboOutput = string;

/**
 * Input parameters for black-forest-labs/flux-schnell
 */
export interface FluxSchnellInput {
  /**
   * Prompt for generated image
   */
  prompt: string;
  /**
   * Aspect ratio for the generated image
   * @default "1:1"
   */
  aspect_ratio?: unknown;
  /**
   * Number of outputs to generate
   * @default 1
   * @range min: 1, max: 4
   */
  num_outputs?: number;
  /**
   * Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster.
   * @default 4
   * @range min: 1, max: 4
   */
  num_inference_steps?: number;
  /**
   * Random seed. Set for reproducible generation
   */
  seed?: number;
  /**
   * Format of the output images
   * @default "webp"
   */
  output_format?: unknown;
  /**
   * Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs
   * @default 80
   * @range min: 0, max: 100
   */
  output_quality?: number;
  /**
   * Disable safety checker for generated images.
   * @default false
   */
  disable_safety_checker?: boolean;
  /**
   * Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed.
   * @default true
   */
  go_fast?: boolean;
  /**
   * Approximate number of megapixels for generated image
   * @default "1"
   */
  megapixels?: unknown;
}

/** Output type for black-forest-labs/flux-schnell */
export type FluxSchnellOutput = string[];

/**
 * Input parameters for black-forest-labs/flux-dev
 */
export interface FluxDevInput {
  /**
   * Prompt for generated image
   */
  prompt: string;
  /**
   * Aspect ratio for the generated image
   * @default "1:1"
   */
  aspect_ratio?: unknown;
  /**
   * Input image for image to image mode. The aspect ratio of your output will match this image
   */
  image?: string;
  /**
   * Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image
   * @default 0.8
   * @range min: 0, max: 1
   */
  prompt_strength?: number;
  /**
   * Number of outputs to generate
   * @default 1
   * @range min: 1, max: 4
   */
  num_outputs?: number;
  /**
   * Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster.
   * @default 28
   * @range min: 1, max: 50
   */
  num_inference_steps?: number;
  /**
   * Guidance for generated image
   * @default 3
   * @range min: 0, max: 10
   */
  guidance?: number;
  /**
   * Random seed. Set for reproducible generation
   */
  seed?: number;
  /**
   * Format of the output images
   * @default "webp"
   */
  output_format?: unknown;
  /**
   * Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs
   * @default 80
   * @range min: 0, max: 100
   */
  output_quality?: number;
  /**
   * Disable safety checker for generated images.
   * @default false
   */
  disable_safety_checker?: boolean;
  /**
   * Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed.
   * @default true
   */
  go_fast?: boolean;
  /**
   * Approximate number of megapixels for generated image
   * @default "1"
   */
  megapixels?: unknown;
}

/** Output type for black-forest-labs/flux-dev */
export type FluxDevOutput = string[];

/**
 * Input parameters for black-forest-labs/flux-1.1-pro
 */
export interface Flux11ProInput {
  /**
   * Aspect ratio for the generated image
   * @default "1:1"
   */
  aspect_ratio?: unknown;
  /**
   * Format of the output images.
   * @default "webp"
   */
  output_format?: unknown;
  /**
   * Random seed. Set for reproducible generation
   */
  seed?: number;
  /**
   * Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes.
   * @range min: 256, max: 1440
   */
  width?: number;
  /**
   * Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes.
   * @range min: 256, max: 1440
   */
  height?: number;
  /**
   * Text prompt for image generation
   */
  prompt: string;
  /**
   * Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp.
   */
  image_prompt?: string;
  /**
   * Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs
   * @default 80
   * @range min: 0, max: 100
   */
  output_quality?: number;
  /**
   * Safety tolerance, 1 is most strict and 6 is most permissive
   * @default 2
   * @range min: 1, max: 6
   */
  safety_tolerance?: number;
  /**
   * Automatically modify the prompt for more creative generation
   * @default false
   */
  prompt_upsampling?: boolean;
}

/** Output type for black-forest-labs/flux-1.1-pro */
export type Flux11ProOutput = string;

/**
 * Input parameters for black-forest-labs/flux-kontext-dev
 */
export interface FluxKontextDevInput {
  /**
   * Text description of what you want to generate, or the instruction on how to edit the given image.
   */
  prompt: string;
  /**
   * Image to use as reference. Must be jpeg, png, gif, or webp.
   */
  input_image: string;
  /**
   * Aspect ratio of the generated image. Use 'match_input_image' to match the aspect ratio of the input image.
   * @default "match_input_image"
   */
  aspect_ratio?: unknown;
  /**
   * Number of inference steps
   * @default 30
   * @range min: 4, max: 50
   */
  num_inference_steps?: number;
  /**
   * Guidance scale for generation
   * @default 2.5
   * @range min: 0, max: 10
   */
  guidance?: number;
  /**
   * Random seed for reproducible generation. Leave blank for random.
   */
  seed?: number;
  /**
   * Output image format
   * @default "webp"
   */
  output_format?: unknown;
  /**
   * Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs
   * @default 80
   * @range min: 0, max: 100
   */
  output_quality?: number;
  /**
   * Disable NSFW safety checker
   * @default false
   */
  disable_safety_checker?: boolean;
}

/** Output type for black-forest-labs/flux-kontext-dev */
export type FluxKontextDevOutput = string;

// =============================================================================
// VIDEO MODELS
// =============================================================================

/**
 * Input parameters for google/veo-3.1-fast
 */
export interface Veo31FastInput {
  /**
   * Text prompt for video generation
   */
  prompt: string;
  /**
   * Video aspect ratio
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * Video duration in seconds
   * @default 8
   */
  duration?: unknown;
  /**
   * Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose.
   */
  image?: string;
  /**
   * Ending image for interpolation. When provided with an input image, creates a transition between the two images.
   */
  last_frame?: string;
  /**
   * Description of what to exclude from the generated video
   */
  negative_prompt?: string;
  /**
   * Resolution of the generated video
   * @default "1080p"
   */
  resolution?: unknown;
  /**
   * Generate audio with the video
   * @default true
   */
  generate_audio?: boolean;
  /**
   * Random seed. Omit for random generations
   */
  seed?: number;
}

/** Output type for google/veo-3.1-fast */
export type Veo31FastOutput = string;

/**
 * Input parameters for google/veo-3.1
 */
export interface Veo31Input {
  /**
   * Text prompt for video generation
   */
  prompt: string;
  /**
   * Video aspect ratio
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * Video duration in seconds
   * @default 8
   */
  duration?: unknown;
  /**
   * Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose.
   */
  image?: string;
  /**
   * Ending image for interpolation. When provided with an input image, creates a transition between the two images.
   */
  last_frame?: string;
  /**
   * 1 to 3 reference images for subject-consistent generation (reference-to-video, or R2V). Reference images only work with 16:9 aspect ratio and 8-second duration. Last frame is ignored if reference images are provided.
   * @default []
   */
  reference_images?: string[];
  /**
   * Description of what to exclude from the generated video
   */
  negative_prompt?: string;
  /**
   * Resolution of the generated video
   * @default "1080p"
   */
  resolution?: unknown;
  /**
   * Generate audio with the video
   * @default true
   */
  generate_audio?: boolean;
  /**
   * Random seed. Omit for random generations
   */
  seed?: number;
}

/** Output type for google/veo-3.1 */
export type Veo31Output = string;

/**
 * Input parameters for kwaivgi/kling-v2.5-turbo-pro
 */
export interface KlingV25TurboProInput {
  /**
   * Text prompt for video generation
   */
  prompt: string;
  /**
   * Things you do not want to see in the video
   * @default ""
   */
  negative_prompt?: string;
  /**
   * First frame of the video
   */
  start_image?: string;
  /**
   * Last frame of the video
   */
  end_image?: string;
  /**
   * Aspect ratio of the video. Ignored if start_image is provided.
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * Duration of the video in seconds
   * @default 5
   */
  duration?: unknown;
  /**
   * Deprecated: Use start_image instead.
   */
  image?: string;
}

/** Output type for kwaivgi/kling-v2.5-turbo-pro */
export type KlingV25TurboProOutput = string;

/**
 * Input parameters for kwaivgi/kling-v2.6-motion-control
 */
export interface KlingV26MotionControlInput {
  /**
   * Text prompt for video generation. You can add elements to the screen and achieve motion effects through prompt words.
   * @default ""
   */
  prompt?: string;
  /**
   * Reference image. The characters, backgrounds, and other elements in the generated video are based on the reference image. Supports .jpg/.jpeg/.png, max 10MB, dimensions 340px-3850px, aspect ratio 1:2.5 to 2.5:1.
   */
  image: string;
  /**
   * Reference video. The character actions in the generated video are consistent with the reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation.
   */
  video: string;
  /**
   * Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video).
   * @default "image"
   */
  character_orientation?: unknown;
  /**
   * Video generation mode. 'std': Standard mode (cost-effective). 'pro': Professional mode (higher quality).
   * @default "std"
   */
  mode?: unknown;
  /**
   * Whether to keep the original sound of the video
   * @default true
   */
  keep_original_sound?: boolean;
}

/** Output type for kwaivgi/kling-v2.6-motion-control */
export type KlingV26MotionControlOutput = string;

/**
 * Input parameters for minimax/video-01
 */
export interface MinimaxVideo01Input {
  /**
   * Text prompt for generation
   */
  prompt: string;
  /**
   * Use prompt optimizer
   * @default true
   */
  prompt_optimizer?: boolean;
  /**
   * First frame image for video generation. The output video will have the same aspect ratio as this image.
   */
  first_frame_image?: string;
  /**
   * An optional character reference image to use as the subject in the generated video (this will use the S2V-01 model)
   */
  subject_reference?: string;
}

/** Output type for minimax/video-01 */
export type MinimaxVideo01Output = string;

/**
 * Input parameters for luma/ray
 */
export interface LumaRayInput {
  /**
   * Aspect ratio of the video. Ignored if a start frame, end frame or video ID is given.
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * Whether the video should loop, with the last frame matching the first frame for smooth, continuous playback. This input is ignored if end_image or end_video_id are set.
   * @default false
   */
  loop?: boolean;
  /**
   * Text prompt for video generation
   */
  prompt: string;
  /**
   * An optional last frame of the video to use as the ending frame.
   */
  end_image?: string;
  /**
   * An optional first frame of the video to use as the starting frame.
   */
  start_image?: string;
  /**
   * Prepend a new video generation to the beginning of an existing one (Also called 'reverse extend'). You can combine this with start_image, or start_video_id.
   */
  end_video_id?: string;
  /**
   * Deprecated: Use end_image instead
   */
  end_image_url?: string;
  /**
   * Continue or extend a video generation with a new generation. You can combine this with end_image, or end_video_id.
   */
  start_video_id?: string;
  /**
   * Deprecated: Use start_image instead
   */
  start_image_url?: string;
}

/** Output type for luma/ray */
export type LumaRayOutput = string;

// =============================================================================
// LLM MODELS
// =============================================================================

/**
 * Input parameters for meta/meta-llama-3.1-405b-instruct
 */
export interface MetaLlama31Input {
  /**
   * Prompt
   * @default ""
   */
  prompt?: string;
  /**
   * System prompt to send to the model. This is prepended to the prompt and helps guide system behavior. Ignored for non-chat models.
   * @default "You are a helpful assistant."
   */
  system_prompt?: string;
  /**
   * The minimum number of tokens the model should generate as output.
   * @default 0
   */
  min_tokens?: number;
  /**
   * The maximum number of tokens the model should generate as output.
   * @default 512
   */
  max_tokens?: number;
  /**
   * The value used to modulate the next token probabilities.
   * @default 0.6
   */
  temperature?: number;
  /**
   * A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).
   * @default 0.9
   */
  top_p?: number;
  /**
   * The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).
   * @default 50
   */
  top_k?: number;
  /**
   * Presence penalty
   * @default 0
   */
  presence_penalty?: number;
  /**
   * Frequency penalty
   * @default 0
   */
  frequency_penalty?: number;
  /**
   * A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.
   * @default ""
   */
  stop_sequences?: string;
  /**
   * A template to format the prompt with. If not provided, the default prompt template will be used.
   * @default ""
   */
  prompt_template?: string;
}

/** Output type for meta/meta-llama-3.1-405b-instruct */
export type MetaLlama31Output = string[];

// =============================================================================
// REFRAME MODELS
// =============================================================================

/**
 * Input parameters for luma/reframe-image
 */
export interface LumaReframeImageInput {
  /**
   * Aspect ratio of the output
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * The model to use for the reframe generation
   * @default "photon-flash-1"
   */
  model?: unknown;
  /**
   * The image to reframe
   */
  image?: string;
  /**
   * The x end of the crop bounds, in pixels. Defines the right boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content.
   */
  x_end?: number;
  /**
   * The y end of the crop bounds, in pixels. Defines the bottom boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content.
   */
  y_end?: number;
  /**
   * A prompt to guide the reframing generation
   */
  prompt?: string;
  /**
   * The x start of the crop bounds, in pixels. Defines the left boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content.
   */
  x_start?: number;
  /**
   * The y start of the crop bounds, in pixels. Defines the top boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content.
   */
  y_start?: number;
  /**
   * URL of the image to reframe
   */
  image_url?: string;
  /**
   * The x position of the input in the grid, in pixels. Controls horizontal positioning of the source within the target output dimensions.
   */
  grid_position_x?: number;
  /**
   * The y position of the input in the grid, in pixels. Controls vertical positioning of the source within the target output dimensions.
   */
  grid_position_y?: number;
}

/** Output type for luma/reframe-image */
export type LumaReframeImageOutput = string;

/**
 * Input parameters for luma/reframe-video
 */
export interface LumaReframeVideoInput {
  /**
   * Aspect ratio of the output
   * @default "16:9"
   */
  aspect_ratio?: unknown;
  /**
   * The video to reframe. Maximum video duration is 10 seconds.
   */
  video?: string;
  /**
   * The x end of the crop bounds, in pixels. Defines the right boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content.
   */
  x_end?: number;
  /**
   * The y end of the crop bounds, in pixels. Defines the bottom boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content.
   */
  y_end?: number;
  /**
   * A prompt to guide the reframing generation
   */
  prompt?: string;
  /**
   * The x start of the crop bounds, in pixels. Defines the left boundary where your source will be placed in the output frame. The distance between x_start and x_end determines the resized width of your content.
   */
  x_start?: number;
  /**
   * The y start of the crop bounds, in pixels. Defines the top boundary where your source will be placed in the output frame. The distance between y_start and y_end determines the resized height of your content.
   */
  y_start?: number;
  /**
   * URL of the video to reframe. Maximum video duration is 10 seconds.
   */
  video_url?: string;
  /**
   * The x position of the input in the grid, in pixels. Controls horizontal positioning of the source within the target output dimensions.
   */
  grid_position_x?: number;
  /**
   * The y position of the input in the grid, in pixels. Controls vertical positioning of the source within the target output dimensions.
   */
  grid_position_y?: number;
}

/** Output type for luma/reframe-video */
export type LumaReframeVideoOutput = string;

// =============================================================================
// LIPSYNC MODELS
// =============================================================================

/**
 * Input parameters for sync/lipsync-2
 */
export interface Lipsync2Input {
  /**
   * Lipsync mode when audio and video durations are out of sync
   * @default "loop"
   */
  sync_mode?: unknown;
  /**
   * Input audio file (.wav)
   */
  audio: string;
  /**
   * Input video file (.mp4)
   */
  video: string;
  /**
   * How expressive lipsync can be (0-1)
   * @default 0.5
   * @range min: 0, max: 1
   */
  temperature?: number;
  /**
   * Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)
   * @default false
   */
  active_speaker?: boolean;
}

/** Output type for sync/lipsync-2 */
export type Lipsync2Output = string;

/**
 * Input parameters for sync/lipsync-2-pro
 */
export interface Lipsync2ProInput {
  /**
   * Lipsync mode when audio and video durations are out of sync
   * @default "loop"
   */
  sync_mode?: unknown;
  /**
   * Input audio file (.wav)
   */
  audio: string;
  /**
   * Input video file (.mp4)
   */
  video: string;
  /**
   * How expressive lipsync can be (0-1)
   * @default 0.5
   * @range min: 0, max: 1
   */
  temperature?: number;
  /**
   * Whether to detect active speaker (i.e. whoever is speaking in the clip will be used for lipsync)
   * @default false
   */
  active_speaker?: boolean;
}

/** Output type for sync/lipsync-2-pro */
export type Lipsync2ProOutput = string;

/**
 * Input parameters for pixverse/lipsync
 */
export interface PixverseLipsyncInput {
  /**
   * Video file to upload to PixVerse as media
   */
  video: string;
  /**
   * Audio file to upload to PixVerse as media
   */
  audio: string;
}

/** Output type for pixverse/lipsync */
export type PixverseLipsyncOutput = string;

// =============================================================================
// MODEL IDS
// =============================================================================

/** All supported Replicate model IDs */
export type ReplicateModelId =
  | 'google/nano-banana'
  | 'google/nano-banana-2'
  | 'google/nano-banana-pro'
  | 'prunaai/z-image-turbo'
  | 'black-forest-labs/flux-schnell'
  | 'black-forest-labs/flux-dev'
  | 'black-forest-labs/flux-1.1-pro'
  | 'black-forest-labs/flux-kontext-dev'
  | 'google/veo-3.1-fast'
  | 'google/veo-3.1'
  | 'kwaivgi/kling-v2.5-turbo-pro'
  | 'kwaivgi/kling-v2.6-motion-control'
  | 'minimax/video-01'
  | 'luma/ray'
  | 'meta/meta-llama-3.1-405b-instruct'
  | 'luma/reframe-image'
  | 'luma/reframe-video'
  | 'sync/lipsync-2'
  | 'sync/lipsync-2-pro'
  | 'pixverse/lipsync';

/** Map from model ID to input type */
export interface ReplicateModelInputMap {
  'google/nano-banana': NanoBananaInput;
  'google/nano-banana-2': NanoBanana2Input;
  'google/nano-banana-pro': NanoBananaProInput;
  'prunaai/z-image-turbo': ZImageTurboInput;
  'black-forest-labs/flux-schnell': FluxSchnellInput;
  'black-forest-labs/flux-dev': FluxDevInput;
  'black-forest-labs/flux-1.1-pro': Flux11ProInput;
  'black-forest-labs/flux-kontext-dev': FluxKontextDevInput;
  'google/veo-3.1-fast': Veo31FastInput;
  'google/veo-3.1': Veo31Input;
  'kwaivgi/kling-v2.5-turbo-pro': KlingV25TurboProInput;
  'kwaivgi/kling-v2.6-motion-control': KlingV26MotionControlInput;
  'minimax/video-01': MinimaxVideo01Input;
  'luma/ray': LumaRayInput;
  'meta/meta-llama-3.1-405b-instruct': MetaLlama31Input;
  'luma/reframe-image': LumaReframeImageInput;
  'luma/reframe-video': LumaReframeVideoInput;
  'sync/lipsync-2': Lipsync2Input;
  'sync/lipsync-2-pro': Lipsync2ProInput;
  'pixverse/lipsync': PixverseLipsyncInput;
}

/** Map from model ID to output type */
export interface ReplicateModelOutputMap {
  'google/nano-banana': NanoBananaOutput;
  'google/nano-banana-2': NanoBanana2Output;
  'google/nano-banana-pro': NanoBananaProOutput;
  'prunaai/z-image-turbo': ZImageTurboOutput;
  'black-forest-labs/flux-schnell': FluxSchnellOutput;
  'black-forest-labs/flux-dev': FluxDevOutput;
  'black-forest-labs/flux-1.1-pro': Flux11ProOutput;
  'black-forest-labs/flux-kontext-dev': FluxKontextDevOutput;
  'google/veo-3.1-fast': Veo31FastOutput;
  'google/veo-3.1': Veo31Output;
  'kwaivgi/kling-v2.5-turbo-pro': KlingV25TurboProOutput;
  'kwaivgi/kling-v2.6-motion-control': KlingV26MotionControlOutput;
  'minimax/video-01': MinimaxVideo01Output;
  'luma/ray': LumaRayOutput;
  'meta/meta-llama-3.1-405b-instruct': MetaLlama31Output;
  'luma/reframe-image': LumaReframeImageOutput;
  'luma/reframe-video': LumaReframeVideoOutput;
  'sync/lipsync-2': Lipsync2Output;
  'sync/lipsync-2-pro': Lipsync2ProOutput;
  'pixverse/lipsync': PixverseLipsyncOutput;
}

/** Get input type for a model */
export type ModelInput<T extends ReplicateModelId> = ReplicateModelInputMap[T];

/** Get output type for a model */
export type ModelOutput<T extends ReplicateModelId> =
  ReplicateModelOutputMap[T];

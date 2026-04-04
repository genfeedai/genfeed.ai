import { RouterPriority } from '@genfeedai/enums';
import { z } from 'zod';

export const promptTextareaSchema = z.object({
  autoSelectModel: z.boolean().optional(),
  avatarId: z.string().optional(),
  backgroundMusicId: z.string().optional(), // For selecting existing music ingredient
  backgroundMusicMode: z.enum(['existing', 'generate']).optional(),
  backgroundMusicPrompt: z.string().optional(), // For auto-generating music
  blacklist: z.array(z.string()),
  brand: z.string(),
  brandingMode: z.enum(['off', 'brand']).optional(),
  camera: z.string().optional(),
  cameraMovement: z.string().optional(),
  category: z.string(),
  duration: z.number().optional(),
  endFrame: z.string().optional(),
  folder: z.string().optional(),
  fontFamily: z.string(),
  format: z.string(),
  height: z.number(),
  isAudioEnabled: z.boolean().optional(),
  // Background music options
  isBackgroundMusicEnabled: z.boolean().optional(),
  isBrandingEnabled: z.boolean().optional(),
  lens: z.string().optional(),
  lighting: z.string().optional(),
  // Models field remains for explicit overrides.
  models: z.array(z.string()),
  mood: z.string().optional(),
  musicVolume: z.number().min(0).max(100).optional(),
  muteVideoAudio: z.boolean().optional(),
  outputs: z.number().optional(),
  prioritize: z.nativeEnum(RouterPriority).optional(),
  prompt_template: z.string().optional(),
  // Quality tier for simplified model selection (standard, premium, ultra)
  quality: z.enum(['standard', 'premium', 'ultra']),
  references: z.array(z.string()).optional(),
  resolution: z.string().optional(),
  scene: z.string().optional(),
  sceneDescription: z.string().optional(),
  seed: z.number().optional(),
  sounds: z.array(z.string()),
  speech: z.string().optional(),
  style: z.string(),
  tags: z.array(z.string()),
  text: z.string().min(1, 'Prompt text is required'),
  voiceId: z.string().optional(),
  width: z.number(),
});

export type PromptTextareaSchema = z.infer<typeof promptTextareaSchema>;

export const promptAvatarSchema = z.object({
  avatarId: z.string().trim().min(1, 'Avatar selection is required'),
  category: z.string(),
  isCaptionEnabled: z.boolean(),
  text: z.string().trim().min(1, 'Speech text is required'),
  voiceId: z.string().trim().min(1, 'Voice selection is required'),
});

export type PromptAvatarSchema = z.infer<typeof promptAvatarSchema>;

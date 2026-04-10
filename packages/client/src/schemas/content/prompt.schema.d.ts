import { RouterPriority } from '@genfeedai/enums';
import { z } from 'zod';
export declare const promptTextareaSchema: z.ZodObject<
  {
    autoSelectModel: z.ZodOptional<z.ZodBoolean>;
    avatarId: z.ZodOptional<z.ZodString>;
    backgroundMusicId: z.ZodOptional<z.ZodString>;
    backgroundMusicMode: z.ZodOptional<
      z.ZodEnum<{
        existing: 'existing';
        generate: 'generate';
      }>
    >;
    backgroundMusicPrompt: z.ZodOptional<z.ZodString>;
    blacklist: z.ZodArray<z.ZodString>;
    brand: z.ZodString;
    brandingMode: z.ZodOptional<
      z.ZodEnum<{
        brand: 'brand';
        off: 'off';
      }>
    >;
    camera: z.ZodOptional<z.ZodString>;
    cameraMovement: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    duration: z.ZodOptional<z.ZodNumber>;
    endFrame: z.ZodOptional<z.ZodString>;
    folder: z.ZodOptional<z.ZodString>;
    fontFamily: z.ZodString;
    format: z.ZodString;
    height: z.ZodNumber;
    isAudioEnabled: z.ZodOptional<z.ZodBoolean>;
    isBackgroundMusicEnabled: z.ZodOptional<z.ZodBoolean>;
    isBrandingEnabled: z.ZodOptional<z.ZodBoolean>;
    lens: z.ZodOptional<z.ZodString>;
    lighting: z.ZodOptional<z.ZodString>;
    models: z.ZodArray<z.ZodString>;
    mood: z.ZodOptional<z.ZodString>;
    musicVolume: z.ZodOptional<z.ZodNumber>;
    muteVideoAudio: z.ZodOptional<z.ZodBoolean>;
    outputs: z.ZodOptional<z.ZodNumber>;
    prioritize: z.ZodOptional<z.ZodEnum<typeof RouterPriority>>;
    prompt_template: z.ZodOptional<z.ZodString>;
    quality: z.ZodEnum<{
      standard: 'standard';
      premium: 'premium';
      ultra: 'ultra';
    }>;
    references: z.ZodOptional<z.ZodArray<z.ZodString>>;
    resolution: z.ZodOptional<z.ZodString>;
    scene: z.ZodOptional<z.ZodString>;
    sceneDescription: z.ZodOptional<z.ZodString>;
    seed: z.ZodOptional<z.ZodNumber>;
    sounds: z.ZodArray<z.ZodString>;
    speech: z.ZodOptional<z.ZodString>;
    style: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    text: z.ZodString;
    voiceId: z.ZodOptional<z.ZodString>;
    width: z.ZodNumber;
  },
  z.core.$strip
>;
export type PromptTextareaSchema = z.infer<typeof promptTextareaSchema>;
export declare const promptAvatarSchema: z.ZodObject<
  {
    avatarId: z.ZodString;
    category: z.ZodString;
    isCaptionEnabled: z.ZodBoolean;
    text: z.ZodString;
    voiceId: z.ZodString;
  },
  z.core.$strip
>;
export type PromptAvatarSchema = z.infer<typeof promptAvatarSchema>;
//# sourceMappingURL=prompt.schema.d.ts.map

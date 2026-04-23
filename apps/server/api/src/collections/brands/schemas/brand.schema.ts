import type { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import type { Brand as PrismaBrand } from '@genfeedai/prisma';

export type { Brand as PrismaBrand } from '@genfeedai/prisma';

export interface BrandAgentVoice {
  approvedHooks?: string[];
  audience?: string[];
  bannedPhrases?: string[];
  canonicalSource?: 'brand' | 'founder' | 'hybrid';
  doNotSoundLike?: string[];
  exemplarTexts?: string[];
  hashtags?: string[];
  messagingPillars?: string[];
  sampleOutput?: string;
  style?: string;
  taglines?: string[];
  tone?: string;
  values?: string[];
  writingRules?: string[];
  [key: string]: unknown;
}

export interface BrandAgentStrategy {
  contentTypes?: string[];
  frequency?: string;
  goals?: string[];
  platforms?: string[];
  [key: string]: unknown;
}

export interface BrandAgentSchedule {
  activeDays?: string[];
  endTime?: string;
  startTime?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface BrandAgentAutoPublish {
  enabled?: boolean;
  platforms?: string[];
  [key: string]: unknown;
}

export interface BrandAgentPlatformOverride {
  defaultModel?: string;
  persona?: string;
  strategy?: Partial<BrandAgentStrategy>;
  voice?: Partial<BrandAgentVoice>;
  [key: string]: unknown;
}

export interface BrandAgentConfig {
  autoPublish?: BrandAgentAutoPublish;
  defaultAvatarIngredientId?: string;
  defaultAvatarPhotoUrl?: string;
  defaultModel?: string;
  defaultVoiceId?: string;
  defaultVoiceRef?: DefaultVoiceRef;
  persona?: string;
  platformOverrides?:
    | Map<string, BrandAgentPlatformOverride>
    | Record<string, BrandAgentPlatformOverride>;
  schedule?: BrandAgentSchedule;
  strategy?: Partial<BrandAgentStrategy>;
  voice?: Partial<BrandAgentVoice>;
  [key: string]: unknown;
}

export interface BrandReferenceImage {
  category: string;
  label?: string;
  url?: string;
  [key: string]: unknown;
}

export interface BrandDocument extends PrismaBrand {
  _id: string;
  agentConfig: PrismaBrand['agentConfig'];
  backgroundColor: PrismaBrand['backgroundColor'];
  description: PrismaBrand['description'];
  fontFamily: PrismaBrand['fontFamily'];
  label: PrismaBrand['label'];
  organization?: string | null;
  primaryColor: PrismaBrand['primaryColor'];
  referenceImages: PrismaBrand['referenceImages'];
  secondaryColor: PrismaBrand['secondaryColor'];
  text: PrismaBrand['text'];
  user?: string | null;
  [key: string]: unknown;
}

export type Brand = BrandDocument;

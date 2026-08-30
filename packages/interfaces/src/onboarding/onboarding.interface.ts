import type {
  BrandExtractionStatus,
  OnboardingStatus,
  OnboardingStep,
} from '@genfeedai/enums';
import type { IBrandAgentPrompting } from '../organization/brand-profile.interface';

export type OnboardingAccessMode = 'server' | 'byok' | 'cloud';
export type OnboardingRuntimeAccessMode = Exclude<
  OnboardingAccessMode,
  'cloud'
>;

export interface IOnboardingAccessPreference {
  accessMode?: OnboardingAccessMode;
  selectedAt?: string;
  source?: string;
}

export interface IExtractedSocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
}

export interface IScrapedBrandData {
  // Core info
  companyName?: string;
  tagline?: string;
  description?: string;

  // Visual
  logoUrl?: string;
  bannerUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  fontCandidates?: string[];
  referenceImageUrls?: string[];

  // Content
  heroText?: string;
  valuePropositions?: string[];
  aboutText?: string;

  // Links
  socialLinks?: IExtractedSocialLinks;

  // Meta
  metaDescription?: string;
  metaKeywords?: string[];
  ogImage?: string;

  // Source
  sourceUrl: string;
  scrapedAt: Date;
}

export interface IBrandVoiceAnalysis {
  tone: string;
  voice: string;
  audience: string;
  values: string[];
  taglines: string[];
  hashtags: string[];
  doNotSoundLike?: string[];
  goals?: string[];
  messagingPillars?: string[];
  prompting?: IBrandAgentPrompting;
  sampleOutput?: string;
  topics?: string[];
}

export interface IOnboardingMasterPrompt {
  category: string;
  title: string;
  prompt: string;
  guidance?: string;
}

export interface IExtractedBrandData extends IScrapedBrandData {
  brandVoice?: IBrandVoiceAnalysis;
  masterPrompts?: IOnboardingMasterPrompt[];
}

export interface IOnboardingState {
  step: OnboardingStep;
  status: OnboardingStatus;
  brandUrl?: string;
  extractedData?: IExtractedBrandData;
  extractionStatus?: BrandExtractionStatus;
  error?: string;
  completedAt?: Date;
  skippedAt?: Date;
}

export interface IBrandSetupRequest {
  brandUrl: string;
  linkedinUrl?: string;
  xProfileUrl?: string;
  brandName?: string;
  organizationName?: string;
  industry?: string;
  targetAudience?: string;
  additionalNotes?: string;
}

export interface IBrandSetupResponse {
  success: boolean;
  brandId: string;
  knowledgeBaseId: string;
  extractedData: IExtractedBrandData;
  message?: string;
}

export interface IConfirmBrandDataRequest {
  brandId: string;
  // Allow user to override extracted data
  label?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  // Brand voice overrides
  tone?: string;
  voice?: string;
  audience?: string;
}

export interface IGeneratePreviewRequest {
  brandId: string;
  contentType: 'ads' | 'social';
}

export interface IGeneratePreviewResponse {
  imageUrl: string;
  prompt: string;
}

export interface IProactivePreparationStatus {
  proactiveStatus: string;
  prepPercent: number;
  prepStage: string;
  inviteEligible: boolean;
  generatedAssetCount: number;
  claimedAt?: string;
  paymentMadeAt?: string;
  brand?: {
    id: string;
    name: string;
    colors: string[];
    voiceTone?: string;
  };
  organization?: {
    id: string;
    label?: string | null;
  };
  batch?: {
    id: string;
    platforms: string[];
    completedPosts: number;
    totalPosts: number;
  };
  invitation?: {
    email: string;
    invitedAt: string;
  };
}

export type OnboardingContentType = 'ads' | 'social';

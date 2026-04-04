import type {
  BrandExtractionStatus,
  OnboardingStatus,
  OnboardingStep,
} from '@genfeedai/enums';

/**
 * Social media links extracted from website
 */
export interface IExtractedSocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
}

/**
 * Brand data extracted from website scraping
 */
export interface IScrapedBrandData {
  // Core info
  companyName?: string;
  tagline?: string;
  description?: string;

  // Visual
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;

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

/**
 * AI-generated brand voice analysis
 */
export interface IBrandVoiceAnalysis {
  tone: string;
  voice: string;
  audience: string;
  values: string[];
  taglines: string[];
  hashtags: string[];
}

/**
 * Master prompt generated from brand analysis during onboarding
 */
export interface IOnboardingMasterPrompt {
  category: string;
  title: string;
  prompt: string;
  guidance?: string;
}

/**
 * Complete extracted brand data including AI analysis
 */
export interface IExtractedBrandData extends IScrapedBrandData {
  brandVoice?: IBrandVoiceAnalysis;
  masterPrompts?: IOnboardingMasterPrompt[];
}

/**
 * Onboarding state for tracking user progress
 */
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

/**
 * Request DTO for brand setup endpoint
 */
export interface IBrandSetupRequest {
  brandUrl: string;
  linkedinUrl?: string;
  xProfileUrl?: string;
  brandName?: string;
  industry?: string;
  targetAudience?: string;
  additionalNotes?: string;
}

/**
 * Response from brand setup endpoint
 */
export interface IBrandSetupResponse {
  success: boolean;
  brandId: string;
  knowledgeBaseId: string;
  extractedData: IExtractedBrandData;
  message?: string;
}

/**
 * Request DTO for confirming brand data
 */
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

/**
 * Request DTO for generating a brand preview image during onboarding
 */
export interface IGeneratePreviewRequest {
  brandId: string;
  contentType: 'ads' | 'social';
}

/**
 * Response from the generate-preview endpoint
 */
export interface IGeneratePreviewResponse {
  imageUrl: string;
  prompt: string;
}

/**
 * Content type for onboarding preview generation
 */
export type OnboardingContentType = 'ads' | 'social';

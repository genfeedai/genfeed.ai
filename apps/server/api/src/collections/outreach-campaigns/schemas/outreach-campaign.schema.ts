export type {
  OutreachCampaign,
  OutreachCampaign as OutreachCampaignDocument,
} from '@genfeedai/prisma';

export type CampaignDiscoveryConfig = {
  keywords: string[];
  hashtags: string[];
  subreddits: string[];
  excludeAuthors: string[];
  minEngagement: number;
  maxEngagement: number;
  maxAgeHours: number;
  minRelevanceScore: number;
};

export type CampaignAiConfig = {
  tone: string;
  length: string;
  customInstructions?: string;
  context?: string;
  ctaLink?: string;
  useAiGeneration: boolean;
  templateText?: string;
};

export type CampaignDmConfig = {
  templateText: string;
  followUpEnabled: boolean;
  followUpDelayHours: number;
  followUpText?: string;
};

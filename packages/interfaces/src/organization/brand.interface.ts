import type { AssetScope } from '@genfeedai/enums';
import type {
  IAsset,
  IBaseEntity,
  ICredential,
  ILink,
  IOrganization,
  IUser,
} from '../index';

export interface IBrand extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  credentials: ICredential[];
  links: ILink[];

  label: string;
  description: string;
  text?: string;
  slug: string;

  logo?: IAsset;
  banner?: IAsset;
  references?: IAsset[];

  logoUrl?: string;
  bannerUrl?: string;
  primaryReferenceUrl?: string;

  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;

  voice?: string;
  music?: string;

  defaultVideoModel?: string;
  defaultImageModel?: string;
  defaultImageToVideoModel?: string;
  defaultMusicModel?: string;

  views?: number;
  totalCredentials?: number;

  youtubeHandle?: string;
  youtubeUrl?: string;

  tiktokHandle?: string;
  tiktokUrl?: string;

  instagramHandle?: string;
  instagramUrl?: string;

  twitterHandle?: string;
  twitterUrl?: string;

  linkedinHandle?: string;
  linkedinUrl?: string;

  twitterDeepLink?: string;
  tiktokDeepLink?: string;
  instagramDeepLink?: string;
  youtubeDeepLink?: string;
  linkedinDeepLink?: string;

  isVerified: boolean;
  isDefault: boolean;
  isDarkroomEnabled: boolean;
  scope: AssetScope;
  isActive: boolean;
  isSelected: boolean;
  isHighlighted?: boolean;

  agentConfig?: IBrandAgentConfig;
}

export interface IBrandAgentVoice {
  canonicalSource?: 'brand' | 'founder' | 'hybrid';
  tone?: string;
  style?: string;
  audience?: string[];
  values?: string[];
  messagingPillars?: string[];
  doNotSoundLike?: string[];
  sampleOutput?: string;
  taglines?: string[];
  hashtags?: string[];
  approvedHooks?: string[];
  bannedPhrases?: string[];
  writingRules?: string[];
  exemplarTexts?: string[];
}

export interface IBrandAgentStrategy {
  contentTypes?: string[];
  platforms?: string[];
  frequency?: string;
  goals?: string[];
}

export interface IBrandAgentAutoPublish {
  /** Backend stores as `enabled` — aliased here to match project boolean convention */
  isEnabled?: boolean;
  enabled?: boolean;
  confidenceThreshold?: number;
}

export interface IBrandAgentPlatformOverride {
  defaultModel?: string;
  persona?: string;
  voice?: IBrandAgentVoice;
  strategy?: IBrandAgentStrategy;
}

export interface IBrandAgentConfig {
  defaultModel?: string;
  defaultVoiceId?: string | null;
  defaultVoiceRef?: {
    source: 'catalog' | 'cloned';
    provider?: string;
    internalVoiceId?: string;
    externalVoiceId?: string;
    label?: string;
    preview?: string | null;
  } | null;
  defaultVoiceProvider?: string | null;
  defaultAvatarPhotoUrl?: string | null;
  defaultAvatarIngredientId?: string | null;
  heygenAvatarId?: string | null;
  heygenVoiceId?: string | null;
  persona?: string;
  enabledSkills?: string[];
  voice?: IBrandAgentVoice;
  strategy?: IBrandAgentStrategy;
  autoPublish?: IBrandAgentAutoPublish;
  platformOverrides?: Record<string, IBrandAgentPlatformOverride>;
}

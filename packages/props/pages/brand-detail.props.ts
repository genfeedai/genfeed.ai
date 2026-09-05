import type { AssetCategory, CredentialPlatform } from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IArticle,
  IBrand,
  IBrandKitAssetValue,
  IClockTime,
  IImage,
  ILink,
  IVideo,
} from '@genfeedai/contracts/interfaces';

export interface BrandDetailBannerProps {
  brand: IBrand;
  isGeneratingBanner: boolean;
  onUploadBanner: () => void;
  onGenerateBanner: () => void;
}

export interface BrandDetailOverviewProps {
  brand: IBrand;
  isGeneratingLogo: boolean;
  onUpdateBrand: (
    field: 'label' | 'description',
    value: string,
  ) => Promise<void>;
  onUploadLogo: () => void;
  onGenerateLogo: () => void;
  onCopyPublicProfile?: () => void;
}

export interface BrandDetailSystemPromptProps {
  text: string;
  onCopy: (value?: string) => void;
}

export interface BrandDetailLatestVideosProps {
  videos: IVideo[];
}

export interface BrandDetailLatestImagesProps {
  images: IImage[];
}

export interface BrandDetailLatestArticlesProps {
  articles: IArticle[];
}

export interface BrandDetailSocialConnection {
  accountHealth?: AccountHealthSummary;
  avatarUrl?: string | null;
  credentialId: string;
  label?: string | null;
  name?: string | null;
  platform: CredentialPlatform;
  postingTimes?: IClockTime[];
  url?: string | null;
  handle?: string | null;
}

export interface BrandDetailSidebarProps {
  brand: IBrand;
  brandId: string;
  links: ILink[];
  socialConnections: BrandDetailSocialConnection[];
  connectedPlatformsCount: number;
  deletingRefId: string | null;
  isUpdatingPublicProfile?: boolean;
  /** When set, sidebar shows a Social accounts summary linking to /settings/social. */
  manageSocialHref?: string;
  onTogglePublicProfile: (isPublic: boolean) => void;
  onRefreshBrand: () => Promise<void>;
  onOpenLinkModal: (link?: ILink) => void;
  onUploadBanner: () => void;
  onUploadLogo: () => void;
  onUploadReference: () => void;
  onDeleteReference: (assetId: string) => void;
}

export interface BrandDetailAccountSettingsCardProps {
  isPublic: boolean;
  isUpdating?: boolean;
  onToggle: (isPublic: boolean) => void;
}

export interface BrandDetailSocialSummaryCardProps {
  connectedPlatformsCount: number;
  manageHref: string;
}

export interface BrandDetailConnectedAccountProps {
  connection: BrandDetailSocialConnection;
  isSelected?: boolean;
  onSelect?: (credentialId: string) => void;
}

export interface BrandDetailSocialMediaCardProps {
  brandId: string;
  connections: BrandDetailSocialConnection[];
  connectedPlatformsCount: number;
  /**
   * Reload the brand after an account is disconnected. The card owns the
   * mutation but not the connection list, so without this the removed account
   * keeps rendering until the next navigation.
   */
  onRefresh?: () => Promise<void> | void;
  /**
   * `compact` — summary card + connect modal (sidebar / embed).
   * `page` — full categorized integration card list (settings/social).
   */
  variant?: 'compact' | 'page';
}

export interface BrandDetailExternalLinksCardProps {
  links: ILink[];
  onOpenLinkModal: (link?: ILink) => void;
  /**
   * Connected OAuth accounts — shown as read-only profile rows.
   * Social presence is owned by /settings/social, not manual Link CRUD.
   */
  socialConnections?: BrandDetailSocialConnection[];
  /** Deep link to the Social connect page when connections are empty. */
  manageSocialHref?: string;
}

export interface BrandDetailDefaultModelsCardProps {
  brand: IBrand;
}

export interface BrandDetailAgentProfileCardProps {
  brand: IBrand;
  brandId: string;
  onRefreshBrand: () => Promise<void>;
}

export interface AgentProfileFormState {
  defaultModel: string;
  frequency: string;
  persona: string;
  platformOverrides: Record<string, AgentProfilePlatformOverrideFormState>;
  strategyContentTypes: string;
  strategyGoals: string;
  strategyPlatforms: string;
  voiceApprovedHooks: string;
  voiceAudience: string;
  voiceBannedPhrases: string;
  voiceCanonicalSource: 'brand' | 'founder' | 'hybrid';
  voiceDoNotSoundLike: string;
  voiceExemplarTexts: string;
  voiceMessagingPillars: string;
  voiceSampleOutput: string;
  voiceStyle: string;
  voiceTone: string;
  voiceValues: string;
  voiceWritingRules: string;
}

export interface AgentProfilePlatformOverrideFormState {
  approvedHooks: string;
  audience: string;
  bannedPhrases: string;
  canonicalSource: 'brand' | 'founder' | 'hybrid' | '';
  contentTypes: string;
  defaultModel: string;
  doNotSoundLike: string;
  exemplarTexts: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  values: string;
  writingRules: string;
}

export type AgentProfileTextField = Exclude<
  keyof AgentProfileFormState,
  'platformOverrides' | 'voiceCanonicalSource'
>;

export type AgentProfilePlatformOverrideTextField = Exclude<
  keyof AgentProfilePlatformOverrideFormState,
  'canonicalSource' | 'defaultModel'
>;

export type AgentProfilePlatformOverrideSelectField =
  | 'canonicalSource'
  | 'defaultModel';

export interface AgentProfileVoiceFieldsProps {
  isDisabled?: boolean;
  onCanonicalSourceChange: (
    value: AgentProfileFormState['voiceCanonicalSource'],
  ) => void;
  onFieldSave: (field: AgentProfileTextField, value: string) => Promise<void>;
  voiceApprovedHooks: string;
  voiceAudience: string;
  voiceBannedPhrases: string;
  voiceCanonicalSource: AgentProfileFormState['voiceCanonicalSource'];
  voiceDoNotSoundLike: string;
  voiceExemplarTexts: string;
  voiceMessagingPillars: string;
  voiceSampleOutput: string;
  voiceStyle: string;
  voiceTone: string;
  voiceValues: string;
  voiceWritingRules: string;
}

export interface AgentProfilePlatformOverrideProps {
  enabledModelIds: string[];
  isDisabled?: boolean;
  label: string;
  onSave: (
    platform: string,
    field: AgentProfilePlatformOverrideTextField,
    value: string,
  ) => Promise<void>;
  onSelectChange: (
    platform: string,
    field: AgentProfilePlatformOverrideSelectField,
    value: string,
  ) => void;
  override: AgentProfilePlatformOverrideFormState;
  platformValue: string;
  /** When false, omit the per-platform title (parent already shows a platform select). */
  showHeader?: boolean;
}

export interface AgentProfilePlatformOverrideFieldsProps {
  enabledModelIds: string[];
  isDisabled?: boolean;
  onSave: AgentProfilePlatformOverrideProps['onSave'];
  onSelectChange: AgentProfilePlatformOverrideProps['onSelectChange'];
  override: AgentProfilePlatformOverrideFormState;
  platformValue: string;
}

export interface AgentProfilePlatformOverrideWideFieldsProps {
  isDisabled?: boolean;
  onSave: AgentProfilePlatformOverrideProps['onSave'];
  override: AgentProfilePlatformOverrideFormState;
  platformValue: string;
}

export interface BrandDetailIdentityCardProps {
  brand: IBrand;
  brandId: string;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandKitReviewCardProps {
  brand: IBrand;
  brandId: string;
  loadClaimedBrandOsDraft?: boolean;
  onBrandOsDraftAccepted?: () => void;
  onBrandOsDraftLoaded?: () => void;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandKitAssetGridProps {
  assets: IBrandKitAssetValue[];
  emptyLabel: string;
}

export interface BrandKitAssetTileProps {
  asset: IBrandKitAssetValue;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  sourceUrl?: string;
  statusLabel?: string;
}

export interface BrandDetailManualKitCardProps {
  brand: IBrand;
  brandId: string;
  onRefreshBrand: () => Promise<void>;
  onUploadBanner: () => void;
  onUploadLogo: () => void;
  onUploadReference: () => void;
}

export interface BrandDetailReferencesCardProps {
  brand: IBrand;
  deletingRefId: string | null;
  onUploadReference: () => void;
  onDeleteReference: (assetId: string) => void;
}

export interface UseBrandDetailReturn {
  brandId: string;
  hasBrandId: boolean;
  brand: IBrand | null;
  videos: IVideo[];
  images: IImage[];
  articles: IArticle[];
  links: ILink[];
  selectedLink: ILink | null;
  isLoading: boolean;
  isGeneratingBanner: boolean;
  isGeneratingLogo: boolean;
  deletingRefId: string | null;
  socialConnections: BrandDetailSocialConnection[];
  connectedPlatformsCount: number;
  handleGenerateBanner: () => void;
  handleGenerateLogo: () => void;
  handleUpdateAccount: (
    field: string,
    value: boolean | string,
  ) => Promise<void>;
  isUpdating: boolean;
  handleOpenUploadModal: (category: AssetCategory) => void;
  handleRequestDeleteReference: (assetId: string) => void;
  handleCopy: (text?: string) => void;
  handleLinkConfirm: () => void;
  handleRefreshBrand: (isRefreshing?: boolean) => Promise<void>;
  selectLink: (link: ILink | null) => void;
  generateModalType: 'banner' | 'logo' | null;
  setGenerateModalType: (type: 'banner' | 'logo' | null) => void;
}

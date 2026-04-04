import type {
  IArticle,
  IBrand,
  IImage,
  ILink,
  IVideo,
} from '@cloud/interfaces';
import type { AssetCategory, CredentialPlatform } from '@genfeedai/enums';

export interface BrandDetailBannerProps {
  brand: IBrand;
  isGeneratingBanner: boolean;
  onUploadBanner: () => void;
  onGenerateBanner: () => void;
}

export interface BrandDetailOverviewProps {
  brand: IBrand;
  isGeneratingLogo: boolean;
  onUploadLogo: () => void;
  onGenerateLogo: () => void;
  onCopyPublicProfile?: () => void;
  onEditBrand: () => void;
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
  platform: CredentialPlatform;
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
  onTogglePublicProfile: (isPublic: boolean) => void;
  onRefreshBrand: () => Promise<void>;
  onOpenLinkModal: (link?: ILink) => void;
  onUploadReference: () => void;
  onDeleteReference: (assetId: string) => void;
}

export interface BrandDetailAccountSettingsCardProps {
  isPublic: boolean;
  onToggle: (isPublic: boolean) => void;
}

export interface BrandDetailSocialMediaCardProps {
  brandId: string;
  connections: BrandDetailSocialConnection[];
  connectedPlatformsCount: number;
}

export interface BrandDetailExternalLinksCardProps {
  links: ILink[];
  onOpenLinkModal: (link?: ILink) => void;
}

export interface BrandDetailDefaultModelsCardProps {
  brand: IBrand;
}

export interface BrandDetailAgentProfileCardProps {
  brand: IBrand;
  brandId: string;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandDetailIdentityCardProps {
  brand: IBrand;
  brandId: string;
  onRefreshBrand: () => Promise<void>;
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
  handleUpdateAccount: (field: string, value: boolean | string) => void;
  handleOpenUploadModal: (category: AssetCategory) => void;
  handleRequestDeleteReference: (assetId: string) => void;
  handleCopy: (text?: string) => void;
  handleLinkConfirm: () => void;
  handleRefreshBrand: (isRefreshing?: boolean) => Promise<void>;
  selectLink: (link: ILink | null) => void;
  generateModalType: 'banner' | 'logo' | null;
  setGenerateModalType: (type: 'banner' | 'logo' | null) => void;
}

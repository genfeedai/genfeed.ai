import type {
  IAsset,
  IBot,
  IBrand,
  ICaption,
  ICredential,
  IElementBlacklist,
  IElementCamera,
  IElementMood,
  IElementStyle,
  IFolder,
  IFontFamily,
  IImage,
  IIngredient,
  ILink,
  IMember,
  IMetadata,
  IModel,
  IMonitoredAccount,
  IMusic,
  IOrganizationSetting,
  IPost,
  IPostPlatformConfig,
  IPreset,
  IReplyBotConfig,
  IRole,
  ISound,
  ITag,
  IVideo,
} from '@genfeedai/interfaces';
import type {
  MultiPostSchema,
  PromptTextareaSchema,
} from '@genfeedai/client/schemas';
import type {
  AssetScope,
  ComponentSize,
  IngredientCategory,
  IngredientFormat,
  ModalEnum,
  Platform,
  TagCategory,
} from '@genfeedai/enums';
import type { Training } from '@models/ai/training.model';
import type { ElementBlacklist } from '@models/elements/blacklist.model';
import type { Music } from '@models/ingredients/music.model';
import type { Brand } from '@models/organization/brand.model';
import type { ContentProps } from '@props/layout/content.props';
import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Base props for modal components
 */
export interface ModalBaseProps<T = unknown> {
  entity?: T | null;
  onConfirm: (isRefreshing?: boolean) => void;
  onClose?: () => void;
}

/**
 * Props for ModalModel component
 */
export interface ModalModelProps extends ModalBaseProps<IModel> {
  mode?: 'edit' | 'view';
}

/**
 * Base props for CRUD modal components with standardized naming
 */
export interface ModalCrudProps<T = unknown> {
  item?: T | null;
  onConfirm: (isRefreshing?: boolean) => void;
  onClose?: () => void;
}

/**
 * Generic modal props for selection actions
 */
export interface ModalSelectProps<T = unknown> {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: T) => void;
  isLoading?: boolean;
}

type ModalVisibilityProps = {
  isOpen?: boolean;
  openKey?: number | string;
};

export type BrandModalEntity = IBrand | Brand;

export interface ModalBotProps {
  bot?: IBot | null;
  onConfirm: () => void;
}

export interface ModalCredentialProps extends ModalVisibilityProps {
  credential: ICredential | null;
  onConfirm: () => void;
}

export interface ModalVideoProps extends ModalSelectProps<IVideo> {
  availableVideos: IVideo[];
  isLoadingVideos: boolean;
  selectedFrameIndex: number | null;
  format?: IngredientFormat;
}

export interface ModalGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    item: IAsset | IImage | IMusic | (IAsset | IImage)[] | null,
  ) => void; // Support single item, array, music, or null
  category: IngredientCategory;
  title?: string;
  selectedId?: string;
  format?: string;
  isNoneAllowed?: boolean;
  maxSelectableItems?: number;

  // Optional brand-level reference for image selection flows
  accountReference?: IAsset | null;
  onSelectAccountReference?: (assets: IAsset[]) => void;

  // For pre-selecting references when reopening modal
  selectedReferences?: string[];
}

export interface ModalTypeBadgeProps {
  type: ModalEnum;
  className?: string;
  showLabel?: boolean;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
}

export interface ModalMusicProps {
  brandId: string;
  selectedMusicId: string;
  onConfirm: (music: Music | null) => void;
}

export interface ModalMemberProps {
  member?: IMember | null;
  organizationId: string;
  onConfirm: (isRefreshing?: boolean) => void;
  error?: string | null;
}

export interface ModalActionsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Generic modal props for ingredient-related actions
 */
export interface IngredientOverlayProps extends ModalVisibilityProps {
  ingredient: IIngredient | null;
  onConfirm?: () => void;
  onClose?: () => void;
}

export interface IngredientOverlayViewProps
  extends ModalSelectProps<IIngredient> {
  ingredient: IIngredient | null;
  onUpdate?: (ingredient: IIngredient) => void;
}

export interface ModalProps {
  id: string;
  title?: string;
  children: ReactNode;
  isFullScreen?: boolean;
  isError?: boolean;
  showCloseButton?: boolean;
  error?: string | null;
  onClose?: () => void;
  modalBoxClassName?: string;
}

export interface ModalStoryboardUploadProps {
  modalId: ModalEnum;
  frameIndex?: number;
  type?: string;
  parentId?: string;
  parentModel?: string;
  voiceId?: string;
  text?: string;
  width?: number;
  height?: number;
  isResizeEnabled?: boolean;
  isMultiple?: boolean;
}

export interface ModalTagProps extends ModalCrudProps<ITag> {
  entityType?: TagCategory;
  entityId?: string;
}

export interface ModalRoleProps {
  role?: IRole | null;
  onConfirm: (isRefreshing?: boolean) => void;
}

// Special case: ModalBlacklist uses ElementBlacklist type instead of IElementBlacklist
export interface ModalBlacklistProps extends ModalCrudProps<IElementBlacklist> {
  item?: ElementBlacklist | null;
}

// Special case: ModalSound uses 'sound' instead of 'item'
export interface ModalSoundProps {
  sound?: ISound | null;
  onConfirm: (isRefreshing?: boolean) => void;
}

export interface ModalFolderProps extends ModalCrudProps<IFolder> {
  scope?: ContentProps['scope'];
  brandId?: string;
}

export interface ModalPostProps extends ModalVisibilityProps {
  post?: IPost | null;
  ingredient?: IIngredient | null;
  ingredients?: IIngredient[]; // For carousel support
  credential?: ICredential | null;
  credentials?: ICredential[];
  parentPost?: IPost | null;
  onConfirm?: () => void;
  onClose?: () => void;
  onCreated?: (postId: string) => void; // For draft creation workflow
  showViewDetailsButton?: boolean;
  onViewDetails?: () => void;
}

export interface PostMetadataOverlayProps {
  post: IPost | null;
  onConfirm?: () => void;
  onClose?: () => void;
}

export interface ModalCreateThreadProps {
  ingredient?: IIngredient | null;
  credential?: ICredential | null;
  credentials?: ICredential[];
  onConfirm?: () => void;
  onClose?: () => void;
}

/**
 * Props for ModalPostHeader component
 */
export interface ModalPostHeaderProps {
  activeTab: 'setup' | 'platforms';
  onTabChange: (tab: 'setup' | 'platforms') => void;
  isStep1Complete: boolean;
}

/**
 * Props for ModalPostContent component
 */
export interface ModalPostContentProps {
  activeTab: 'setup' | 'platforms';
  form: UseFormReturn<MultiPostSchema>;
  platformConfigs: IPostPlatformConfig[];
  globalScheduledDate: Date | null;
  setGlobalScheduledDate: (date: Date | null) => void;
  settings?: IOrganizationSetting;
  ingredient?: IIngredient | null;
  isLoading: boolean;
  togglePlatform: (credentialId: string) => void;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
  getMinDateTime: () => Date;
}

/**
 * Props for ModalPostPlatformsTab component
 */
export interface ModalPostPlatformsTabProps {
  form: UseFormReturn<MultiPostSchema>;
  platformConfigs: IPostPlatformConfig[];
  isLoading: boolean;
  togglePlatform: (credentialId: string) => void;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
  getMinDateTime: () => Date;
}

/**
 * Props for ModalPostSetupTab component
 */
export interface ModalPostSetupTabProps {
  form: UseFormReturn<MultiPostSchema>;
  globalScheduledDate: Date | null;
  setGlobalScheduledDate: (date: Date | null) => void;
  settings?: IOrganizationSetting;
  ingredient?: IIngredient | null;
  isLoading: boolean;
  getMinDateTime: () => Date;
}

/**
 * Props for ModalPostFooter component
 */
export interface ModalPostFooterProps {
  activeTab: 'setup' | 'platforms';
  isLoading: boolean;
  enabledCount: number;
  globalScheduledDate: Date | null;
  globalDescription: string;
  hasYoutube: boolean;
  globalLabel: string;
  onNextStep: () => void;
  onPreviousStep: () => void;
  onSubmit: () => void;
  onClose: () => void;
  isFormValid?: boolean;
}

export interface ModalConfirmProps extends ModalVisibilityProps {
  label?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isError?: boolean;
  onClose?: () => void;
  onConfirm: () => void;
}

/**
 * Generic modal props for organization-scoped actions
 */
export interface ModalOrganizationScopedProps {
  organizationId: string | null;
  onConfirm: () => void;
}

export interface ModalPromptProps extends ModalVisibilityProps {
  originalPrompt?: string;
  enhancedPrompt?: string;
  style?: string;
  mood?: string;
  camera?: string;
  fontFamily?: string;
  blacklists?: string[];
  sounds?: string[];
  onClose?: () => void;
  onUsePrompt?: (promptData: {
    text: string;
    style?: string;
    mood?: string;
    camera?: string;
    fontFamily?: string;
    blacklists?: string[];
    sounds?: string[];
  }) => void;
  error?: string | null;
}

export interface ModalTrainingProps {
  training: Training | null;
  onSuccess?: () => void;
}

export interface ModalMetadataProps extends ModalVisibilityProps {
  ingredientId: string;
  ingredientCategory: string;
  metadata?: IMetadata;
  scope?: AssetScope;
  folder?: IFolder | null;
  onConfirm: () => void;
}

export interface ModalOrganizationProps {
  organizationId?: string | null;
  onConfirm: () => void;
}

export interface ModalExportProps extends ModalVisibilityProps {
  onExport: (format: 'csv' | 'xlsx', fields: string[]) => void;
}

export interface ModalGenerateIllustrationProps extends ModalVisibilityProps {
  postId: string;
  initialPrompt?: string;
  platform?: Platform;
  onConfirm: (imageId: string) => void;
  onClose?: () => void;
}

/**
 * Generic modal props for brand-related actions
 */
export interface BrandOverlayProps extends ModalVisibilityProps {
  brand: BrandModalEntity | null;
  onConfirm: (isRefreshing?: boolean, createdBrandId?: string) => void;
  onClose?: () => void;
  initialView?: 'edit' | 'overview';
}

export interface ModalBrandInstagramProps {
  brand: IBrand | null;
  credential: ICredential | null;
  onConfirm: () => void;
}

export interface ModalBrandLinkProps {
  brandId: string | null;
  link: ILink | null;
  onConfirm: () => void;
}

export interface ModalBrandGenerateProps extends ModalConfirmProps {
  type: 'logo' | 'banner';
  cost?: number;
  brandId?: string;
}

export interface ModalUploadProps extends ModalVisibilityProps {
  category: string;
  parentId?: string;
  parentModel?: string;
  width?: number;
  height?: number;

  isResizeEnabled?: boolean;
  isMultiple?: boolean;
  maxFiles?: number;
  initialFiles?: File[];
  autoSubmit?: boolean;

  onConfirm: (ingredient?: IIngredient | IAsset) => void;
  onComplete?: (ingredients: (IIngredient | IAsset)[]) => void;
}

export interface ModalImageToVideoProps {
  image: IIngredient | null;
  models: IModel[];
  presets: IPreset[];
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  sounds?: ISound[];
  tags?: ITag[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
  promptData: Partial<PromptTextareaSchema> & { isValid: boolean };
  isGenerating: boolean;
  onPromptChange: (
    data: Partial<PromptTextareaSchema> & { isValid: boolean },
  ) => void;
  onSubmit: (data: PromptTextareaSchema & { isValid: boolean }) => void;
  onClose?: () => void;
}

export interface ModalAvatarProps {
  avatarId: string;
  voiceId: string;
  text: string;
  onConfirm: (isRefreshing: boolean) => void;
}

export interface ModalTextOverlayProps {
  video: IVideo;
  onConfirm?: () => void;
  error?: string | null;
}

export interface ModalCaptionProps {
  video?: IVideo | null;
  existingCaption?: ICaption | null;
  onConfirm?: (caption: ICaption) => void;
}

export interface ModalCaptionDetailProps {
  caption: ICaption | null;
  onUpdate?: (caption: ICaption) => void;
  onClose?: () => void;
}

export interface ModalMCPProps {
  type: 'create' | 'show';
  keyName: string;
  keyDescription: string;
  keyExpiry: string;
  createdKey?: string;
  creating: boolean;
  onKeyNameChange: (value: string) => void;
  onKeyDescriptionChange: (value: string) => void;
  onKeyExpiryChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onCopyKey?: () => void;
}

export interface ModalApiKeysProps {
  type?: 'api-key' | 'mcp';
  mode: 'create' | 'show';
  keyName: string;
  keyDescription: string;
  keyExpiry: string;
  keyRateLimit?: number;
  createdKey?: string;
  creating: boolean;
  onKeyNameChange: (value: string) => void;
  onKeyDescriptionChange: (value: string) => void;
  onKeyExpiryChange: (value: string) => void;
  onKeyRateLimitChange?: (value: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  onCopyKey?: () => void;
}

export interface ModalTrimProps {
  videoUrl: string;
  videoId: string;
  videoDuration: number;
  onConfirm: (startTime: number, endTime: number) => void;
  onClose: () => void;
}

export interface ModalArticleProps {
  onConfirm?: (isRefreshing?: boolean) => void;
  onCreated?: (articleId: string | string[]) => void;
}

export interface ModalReplyBotProps {
  replyBot?: IReplyBotConfig | null;
  onConfirm: (isRefreshing?: boolean) => void;
  onClose?: () => void;
}

export interface ModalMonitoredAccountProps {
  account?: IMonitoredAccount | null;
  replyBotConfigId?: string;
  onConfirm: (isRefreshing?: boolean) => void;
  onClose?: () => void;
}

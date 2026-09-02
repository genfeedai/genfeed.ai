import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  ChannelCapability,
  ChannelMediaKind,
  ChannelPublishMode,
  ChannelTargetValidationResult,
} from '@genfeedai/contracts/api-types/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { ComponentType } from 'react';

export type PlatformPreviewMedia = {
  id: string;
  kind: ChannelMediaKind;
  url?: string;
  thumbnailUrl?: string;
  alt?: string;
  durationLabel?: string;
  isAnimated?: boolean;
};

export type PlatformPreviewAuthor = {
  name?: string;
  handle?: string;
  avatarUrl?: string;
};

export type PlatformPreviewLinkCard = {
  url: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

export type PlatformPreviewThreadSegment = {
  id: string;
  caption: string;
  label?: string;
};

export type PlatformPreviewTarget = {
  platform: CredentialPlatform | string;
  caption: string;
  title?: string;
  author?: PlatformPreviewAuthor;
  media?: PlatformPreviewMedia[];
  settings?: Record<string, unknown>;
  publishMode?: ChannelPublishMode;
  capability?: ChannelCapability;
  validation?: ChannelTargetValidationResult;
  threadSegments?: PlatformPreviewThreadSegment[];
  linkPreview?: PlatformPreviewLinkCard | null;
};

export type PlatformPreviewProps = {
  post?: IPost;
  target?: PlatformPreviewTarget;
  targets?: PlatformPreviewTarget[];
  accountName?: string;
  accountHandle?: string;
  activePlatform?: CredentialPlatform | string;
  className?: string;
  emptyMessage?: string;
};

export type CaptionPreviewState = {
  count: number;
  maxLength?: number;
  isOverLimit: boolean;
  previewText: string;
};

export type ResolvedPlatformPreviewTarget = PlatformPreviewTarget & {
  capability?: ChannelCapability;
  validation: ChannelTargetValidationResult;
  captionState: CaptionPreviewState;
  platformLabel: string;
  media: PlatformPreviewMedia[];
  threadSegments: PlatformPreviewThreadSegment[];
};

export type PlatformPreviewRendererProps = {
  target: ResolvedPlatformPreviewTarget;
};

export type PlatformPreviewRenderer =
  ComponentType<PlatformPreviewRendererProps>;

export type PlatformPreviewIcon = ComponentType<{ className?: string }>;

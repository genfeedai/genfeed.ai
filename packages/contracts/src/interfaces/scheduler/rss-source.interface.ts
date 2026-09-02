import type {
  RssApprovalMode,
  RssFeedItemStatus,
  RssImportPolicy,
} from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface IRssTargetChannel {
  credentialId: string;
  platform: string;
  signatureId?: string;
}

export interface CreateRssSourceInput {
  approvalMode?: RssApprovalMode;
  brandId?: string;
  feedUrl: string;
  importPolicy?: RssImportPolicy;
  isEnabled?: boolean;
  label: string;
  targetChannels: IRssTargetChannel[];
  timezone?: string;
}

export interface UpdateRssSourceInput {
  approvalMode?: RssApprovalMode;
  brandId?: string | null;
  feedUrl?: string;
  importPolicy?: RssImportPolicy;
  isEnabled?: boolean;
  label?: string;
  targetChannels?: IRssTargetChannel[];
  timezone?: string;
}

export interface IRssSource extends IBaseEntity {
  approvalMode: RssApprovalMode;
  brand?: IBrand | string;
  brandId?: string | null;
  failedCount: number;
  feedUrl: string;
  importedCount: number;
  importPolicy: RssImportPolicy;
  isEnabled: boolean;
  label: string;
  lastError?: string | null;
  lastPolledAt?: string | null;
  organization?: IOrganization | string;
  organizationId: string;
  skippedCount: number;
  targetChannels: IRssTargetChannel[];
  timezone: string;
  user?: IUser | string;
  userId: string;
}

export interface IRssFeedItem extends IBaseEntity {
  brandId?: string | null;
  error?: string | null;
  guid: string;
  imageUrl?: string | null;
  organizationId: string;
  postGroupId?: string | null;
  publishedAt?: string | null;
  rssSourceId: string;
  status: RssFeedItemStatus;
  summary?: string | null;
  title: string;
  url: string;
  userId: string;
}

export interface IRssSourceDocument {
  approvalMode: RssApprovalMode;
  brandId: string | null;
  createdAt: Date;
  failedCount: number;
  feedUrl: string;
  id: string;
  importedCount: number;
  importPolicy: RssImportPolicy;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  lastError: string | null;
  lastPolledAt: Date | null;
  organizationId: string;
  skippedCount: number;
  targetChannels: IRssTargetChannel[];
  timezone: string;
  updatedAt: Date;
  userId: string;
}

export interface IRssFeedItemDocument {
  brandId: string | null;
  createdAt: Date;
  error: string | null;
  guid: string;
  id: string;
  imageUrl: string | null;
  isDeleted: boolean;
  organizationId: string;
  postGroupId: string | null;
  publishedAt: Date | null;
  rssSourceId: string;
  status: RssFeedItemStatus;
  summary: string | null;
  title: string;
  updatedAt: Date;
  url: string;
  userId: string;
}

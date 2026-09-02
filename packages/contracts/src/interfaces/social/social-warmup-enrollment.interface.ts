import type {
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export type SocialWarmupEventProvenance =
  | 'platform_verified'
  | 'genfeed_observed'
  | 'user_confirmed';

export type SocialWarmupReconnectReason = 'disconnected' | 'partial_scopes';

export interface SocialWarmupReconnect {
  credentialId: string;
  isAvailable: boolean;
  platform?: string;
  reason: SocialWarmupReconnectReason;
}

export interface ISocialWarmupEvent extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  enrollmentId: string;
  itemId: string;
  provenance: SocialWarmupEventProvenance;
  actorUserId: string;
  actorUser?: IUser | string;
  action: SocialWarmupEventAction;
  occurredAt: string;
}

export interface ISocialWarmupSignal extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  enrollmentId: string;
  key: string;
  observedAt?: string | null;
  staleAt?: string | null;
  status: SocialWarmupSignalStatus;
  source: SocialWarmupSignalSource;
  evidence: Record<string, unknown>;
}

export interface ISocialWarmupEnrollment extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  credentialId: string;
  blueprintId: string;
  blueprintVersion: number;
  startedAt: string;
  currentPhaseId: string;
  state: SocialWarmupEnrollmentState;
  enrolledByUserId: string;
  enrolledByUser?: IUser | string;
  events: ISocialWarmupEvent[];
  signals: ISocialWarmupSignal[];
  completedItemIds: string[];
  reconnect?: SocialWarmupReconnect;
  isCredentialConnected: boolean;
  hasPartialScopes: boolean;
}

export interface CreateSocialWarmupEnrollmentInput {
  credentialId: string;
}

export interface SocialWarmupScope {
  brandId: string;
  organizationId: string;
  userId: string;
}

export interface CompleteSocialWarmupItemInput {
  provenance?: SocialWarmupEventProvenance;
}

export interface UpsertSocialWarmupSignalInput {
  evidence?: Record<string, unknown>;
  key: string;
  observedAt?: string | null;
  source: SocialWarmupSignalSource;
  staleAt?: string | null;
  status: SocialWarmupSignalStatus;
}

export interface SocialWarmupAccountAge {
  accountAgeDays: number | null;
  accountAgeSource?: string;
  accountAgeStatus: SocialWarmupSignalStatus;
}

export interface ISocialWarmupSignalRecord {
  evidence?: unknown;
  key: string;
  observedAt?: Date | string | null;
  source: SocialWarmupSignalSource;
  staleAt?: Date | string | null;
  status: SocialWarmupSignalStatus;
}

export interface ISocialWarmupEventRecord {
  action: SocialWarmupEventAction;
  itemId: string;
  occurredAt: Date | string;
}

export interface ISocialWarmupEnrollmentDocument {
  blueprintId: string;
  blueprintVersion: number;
  brandId: string;
  completedItemIds: string[];
  createdAt: Date;
  credentialId: string;
  currentPhaseId: string;
  enrolledByUserId: string;
  events: ISocialWarmupEventRecord[];
  hasPartialScopes: boolean;
  id: string;
  isCredentialConnected: boolean;
  isDeleted: boolean;
  organizationId: string;
  reconnect?: SocialWarmupReconnect;
  signals: ISocialWarmupSignalRecord[];
  startedAt: Date;
  state: SocialWarmupEnrollmentState;
  updatedAt: Date;
}

export interface SyncSocialWarmupPlatformSnapshotInput {
  brandId: string;
  credentialId: string;
  evidence: readonly SyncSocialWarmupSignalEvidence[];
  organizationId: string;
}

export interface SyncSocialWarmupSignalEvidence {
  evidence?: Record<string, unknown>;
  key: string;
  observedAt?: string | null;
  source: SocialWarmupSignalSource;
  staleAt?: string | null;
  status: SocialWarmupSignalStatus;
}

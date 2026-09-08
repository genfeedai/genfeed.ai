import type {
  BrandKitFieldKey,
  IBrandKitDraft,
} from '../organization/brand-kit.interface';
export type IWarmupAccountStatus =
  | 'DRAFT'
  | 'PROVISIONING'
  | 'PROVISIONED'
  | 'INVITED'
  | 'FAILED'
  | 'CLAIMED'
  | 'ARCHIVED';

export interface IWarmupAccountDiagnosticStep {
  message: string;
  status: 'blocked' | 'done' | 'failed' | 'pending';
  timestamp: string;
}

export interface IWarmupAccountDiagnostics {
  error?: string;
  preparation?: IWarmupPreparation;
  steps: IWarmupAccountDiagnosticStep[];
}

export interface IWarmupAccountAuditEvent {
  actorUserId: string;
  message: string;
  timestamp: string;
}

export type IWarmupInvitationStatus =
  | 'accepted'
  | 'delivered'
  | 'delivery-failed'
  | 'expired'
  | 'pending'
  | 'revoked';

export interface IWarmupInvitation {
  acceptedAt: string | null;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  invitedByUserId: string;
  organizationId: string;
  revokedAt: string | null;
  roleKey: string;
  status: IWarmupInvitationStatus;
  updatedAt: string;
}

export interface IWarmupAccountCreateRequest {
  leadEmail: string;
  leadFirstName?: string;
  leadLastName?: string;
  organizationName: string;
  brandName: string;
  websiteUrl?: string;
  guidance?: string;
}

export interface IWarmupAccount {
  id: string;
  leadEmail: string;
  leadFirstName?: string;
  leadLastName?: string;
  organizationName: string;
  brandName: string;
  websiteUrl?: string;
  guidance?: string;
  status: IWarmupAccountStatus;
  operatorUserId: string;
  customerUserId?: string;
  organizationId?: string;
  brandId?: string;
  invitationId?: string;
  invitation?: IWarmupInvitation;
  diagnostics: IWarmupAccountDiagnostics;
  readiness?: IWarmupReadiness;
  auditEvents: IWarmupAccountAuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface IWarmupReadiness {
  ready: boolean;
  blockers: string[];
  availableCredits: number;
  workspacePath?: string;
}

export interface IWarmupPreparation {
  grant?: {
    amount: number;
    transactionId: string;
    actorUserId: string;
    reason: string;
    grantedAt: string;
  };
  context?: IBrandKitDraft;
  contextReviewedAt?: string;
  contextReviewedBy?: string;
  assetId?: string;
  articleId?: string;
  generation?: {
    status: 'running' | 'completed' | 'failed';
    key: string;
    startedAt: string;
    workflowExecutionId?: string;
    assetCandidateId?: string;
    prompt?: string;
  };
  claimedAt?: string;
  preparationCredits?: number;
  invitationReadiness?: IWarmupReadiness;
}

export interface IWarmupPrepareRequest {
  action:
    | 'repair'
    | 'fund'
    | 'preview-context'
    | 'apply-context'
    | 'starter-content'
    | 'attach-starters'
    | 'archive';
  amount?: number;
  reason?: string;
  sourceUrl?: string;
  publicProfileUrl?: string;
  description?: string;
  label?: string;
  assetId?: string;
  articleId?: string;
  prompt?: string;
  contextDecisions?: {
    draftId?: string;
    fields: Partial<
      Record<
        BrandKitFieldKey,
        { action: 'accept' | 'reject' | 'preserve'; value?: unknown }
      >
    >;
  };
  assetCandidateId?: string;
}

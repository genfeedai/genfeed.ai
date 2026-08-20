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
  auditEvents: IWarmupAccountAuditEvent[];
  createdAt: string;
  updatedAt: string;
}

import type {
  IBaseEntity,
  IBrand,
  IOrganization,
  IRole,
  IUser,
} from '../index';

/** Derived lifecycle of a member invitation, as the API reports it. */
export const INVITATION_STATUSES = [
  'accepted',
  'delivered',
  'delivery-failed',
  'expired',
  'pending',
  'revoked',
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface IMemberInvitation {
  id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  organizationId?: string;
  invitedByUserId?: string;
  roleId?: string;
  roleKey?: string;
  status?: InvitationStatus;
  redirectUrl?: string;
  expiresAt?: Date | string;
  acceptedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IMember extends IBaseEntity {
  organizationId: string;
  userId: string;
  roleId: string;
  // Required per-member invariant (#5219): always a non-deleted brand of this
  // member's own organizationId.
  currentBrandId: string;
  roleKey?: string | null;
  organization?: IOrganization;
  user?: IUser;
  role?: IRole;
  brands?: IBrand[];
  isActive: boolean;
  isDeleted: boolean;
  userFullName?: string;
  userEmail?: string;
  roleLabel?: string;
}

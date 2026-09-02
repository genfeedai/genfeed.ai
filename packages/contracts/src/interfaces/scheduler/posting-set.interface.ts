import type { CredentialPlatform, TargetValidationState } from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export type PostingSignaturePlacement = 'append' | 'prepend';

export type PostingSetReferenceState =
  | 'valid'
  | 'unavailable'
  | 'deleted'
  | 'disconnected'
  | 'platform_mismatch'
  | 'disabled';

export type PostingSetTargetSettings = Record<string, unknown>;

export interface IPostingSetScope {
  brandId?: string;
  organizationId: string;
  userId: string;
}

export interface IPostingSetTarget {
  credentialId: string;
  order?: number;
  platform: CredentialPlatform;
  settings?: PostingSetTargetSettings;
  signatureIds?: string[];
  targetKey: string;
  timezone?: string;
}

export interface IPostingSetTargetValidation {
  credentialId: string;
  issues: string[];
  state: PostingSetReferenceState;
  targetKey: string;
}

export interface IPostingSetSignatureValidation {
  issues: string[];
  signatureId: string;
  state: PostingSetReferenceState;
}

export interface IPostingSetLifecycleValidation {
  signatures: IPostingSetSignatureValidation[];
  state: TargetValidationState;
  targets: IPostingSetTargetValidation[];
}

export interface IPostingSignature extends IBaseEntity {
  body: string;
  brand?: IBrand | string;
  brandId?: string | null;
  isEnabled: boolean;
  label: string;
  organization?: IOrganization | string;
  organizationId: string;
  placement: PostingSignaturePlacement;
  platforms: CredentialPlatform[];
  user?: IUser | string;
  userId: string;
}

export interface IPostingSet extends IBaseEntity {
  brand?: IBrand | string;
  brandId?: string | null;
  description?: string | null;
  isEnabled: boolean;
  label: string;
  organization?: IOrganization | string;
  organizationId: string;
  targets: IPostingSetTarget[];
  user?: IUser | string;
  userId: string;
  validation: IPostingSetLifecycleValidation;
}

export interface CreatePostingSetInput {
  brandId?: string;
  description?: string;
  isEnabled?: boolean;
  label: string;
  targets: IPostingSetTarget[];
}

export interface UpdatePostingSetInput {
  brandId?: string | null;
  description?: string | null;
  isEnabled?: boolean;
  label?: string;
  targets?: IPostingSetTarget[];
}

export interface CreatePostingSignatureInput {
  body: string;
  brandId?: string;
  isEnabled?: boolean;
  label: string;
  placement?: PostingSignaturePlacement;
  platforms: CredentialPlatform[];
}

export interface UpdatePostingSignatureInput {
  body?: string;
  brandId?: string | null;
  isEnabled?: boolean;
  label?: string;
  placement?: PostingSignaturePlacement;
  platforms?: CredentialPlatform[];
}

export interface IPostingSetDocument {
  brandId: string | null;
  createdAt: Date;
  description: string | null;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  organizationId: string;
  targets: IPostingSetTarget[];
  updatedAt: Date;
  userId: string;
  validation: IPostingSetLifecycleValidation;
}

export interface IPostingSignatureDocument {
  body: string;
  brandId: string | null;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  organizationId: string;
  placement: PostingSignaturePlacement;
  platforms: CredentialPlatform[];
  updatedAt: Date;
  userId: string;
}

import type { IBrand, OrganizationOption } from '../index';

export interface ExtensionWorkspaceAccess {
  userId: string;
  organizationId: string;
  brandId: string;
}
export interface ExtensionWorkspaceBootstrap {
  access: ExtensionWorkspaceAccess;
  brands: IBrand[];
}
export interface ExtensionWorkspaceSnapshot {
  userId: string;
  organizationId: string;
  organizationLabel: string;
  brandId: string | null;
  brands: IBrand[];
  organizations: OrganizationOption[];
  revision: number;
  isApiKey: boolean;
}
export type ExtensionWorkspaceState =
  | { status: 'loading' }
  | { status: 'refreshing'; snapshot: ExtensionWorkspaceSnapshot }
  | { status: 'ready'; snapshot: ExtensionWorkspaceSnapshot }
  | { status: 'blocked'; error: string };
export interface ExtensionWorkspaceLoadOptions {
  forceRefresh?: boolean;
  isStoredSelectionPreferred?: boolean;
  signal?: AbortSignal;
}
export type ExtensionWorkspaceListener = (
  state: ExtensionWorkspaceState,
) => void;

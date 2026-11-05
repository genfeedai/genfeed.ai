import type {
  ApiKeyPermissionLevel,
  ApiKeyPermissionLevels,
} from '@genfeedai/contracts/interfaces';

export type ProductApiKeyForm = {
  allowedIps: string;
  /** Empty for every brand; otherwise the one brand the key is limited to. */
  brandId: string;
  description: string;
  expiresAt: string;
  label: string;
  permissionLevels: ApiKeyPermissionLevels;
  rateLimit: string;
};

export type ProductPlainKey = {
  key: string;
  label: string;
};

export type AuthorizedApiKeysContentProps = {
  organizationId: string;
  isKeylessSelfHosted: boolean;
};

export type ApiKeyPermissionEditorProps = {
  levels: ApiKeyPermissionLevels;
  onLevelChange: (resourceId: string, level: ApiKeyPermissionLevel) => void;
};

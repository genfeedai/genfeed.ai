/** How much of one resource an API key may use. `write` includes `read`. */
export type ApiKeyPermissionLevel = 'none' | 'read' | 'write';

export interface IApiKeyPermissionResource {
  id: string;
  label: string;
  /** Levels the editor offers. Write-only resources offer `none` and `write`. */
  levels: readonly ApiKeyPermissionLevel[];
  readScopes: readonly string[];
  /** Scopes `write` adds on top of `readScopes`. */
  writeScopes: readonly string[];
}

/** A level per registry resource id; a missing id means `none`. */
export type ApiKeyPermissionLevels = Readonly<
  Record<string, ApiKeyPermissionLevel | undefined>
>;

export interface IApiKeyPermissionGroup {
  id: string;
  label: string;
  resources: readonly IApiKeyPermissionResource[];
}

/** What a platform admin gets back after minting a partner key. */
export interface IAdminPartnerApiKeyResult {
  /** Brands the key is limited to; `null` reaches every brand (#9130). */
  allowedBrandIds: string[] | null;
  apiKeyId: string;
  defaultBrandId: string | null;
  expiresAt: string | null;
  /** The plain key. Shown once; only its hash is stored. */
  key: string;
  label: string;
  organizationId: string;
  scopes: string[];
  userId: string;
}

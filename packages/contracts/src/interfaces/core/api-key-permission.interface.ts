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
  /** Whether a signed-in user may grant it to their own key. */
  isSelfService: boolean;
}

export interface IApiKeyPermissionGroup {
  id: string;
  label: string;
  resources: readonly IApiKeyPermissionResource[];
}

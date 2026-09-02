/**
 * Persist payload written onto a credential when a provider token response
 * includes a granted-scope field. An omitted field must not produce this
 * object — that is how "never captured" stays distinct from "captured empty".
 */
export interface GrantedScopesCredentialPatch {
  grantedScopes: string[];
  grantedScopesCapturedAt: Date;
}

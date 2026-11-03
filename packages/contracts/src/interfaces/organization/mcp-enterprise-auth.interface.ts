/**
 * An organization's enterprise-managed authorization setup for the Genfeed MCP
 * connector, plus the values its admin enters in the IdP and the connector.
 */
export interface IMcpEnterpriseAuthSettings {
  /** The authorization server issuer the identity assertion must be issued to (`aud`). */
  audience: string;
  isEnabled: boolean;
  /** The MCP resource the assertion buys access to. */
  resource: string;
  /** Tenant id to enter in the connector; it arrives as the `aud_tenant` claim. */
  tenantId: string;
  /** Where the connector posts the assertion. */
  tokenEndpoint: string;
  /** The issuer whose signed assertions this organization accepts. */
  trustedIssuer: string | null;
}

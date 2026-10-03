/** Types for LinkedInClient return shapes and JSON:API item mapping. */

/** Shape of a LinkedIn credential/connection-status record. */
export interface LinkedInConnectionStatus {
  avatar: string | null;
  connected: boolean;
  handle: string | null;
  name: string | null;
  platform: string;
  /**
   * Set when a stored credential and the mention row disagree, so callers can
   * see why `connected` does not match publishing readiness.
   */
  reason?: string;
}

/** Public identity fields copied from a mention row or credential resource. */
export interface LinkedInAccountIdentity {
  avatar: string | null;
  handle: string | null;
  isConnected?: boolean;
  name: string | null;
}

/** Types for LinkedInClient return shapes and JSON:API item mapping. */

/** Shape of a single LinkedIn content variation returned from the API. */
export interface LinkedInContentItem {
  body: string;
  content: string;
  cta: string;
  hashtags: string[];
  hook: string;
}

/** JSON:API attributes shape for a LinkedIn content resource. */
export interface LinkedInContentAttributes {
  attributes?: {
    body?: string;
    content?: string;
    cta?: string;
    hashtags?: string[];
    hook?: string;
  };
}

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

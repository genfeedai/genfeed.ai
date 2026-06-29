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
}

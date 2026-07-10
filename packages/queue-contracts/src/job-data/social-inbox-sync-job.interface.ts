export interface SocialInboxSyncJobData {
  organizationId: string;
  brandId?: string;
  userId?: string;
  /** Restrict the sweep to a single connected credential. */
  credentialId?: string;
  /** Max comments to pull per post (1-100). */
  limit?: number;
}

export interface SocialInboxSyncResult {
  conversationsCreated: number;
  messagesCreated: number;
}

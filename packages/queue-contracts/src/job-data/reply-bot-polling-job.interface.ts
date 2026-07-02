export interface ReplyBotPollingJobData {
  organizationId: string;
  credentialId: string;
}

export interface ReplyBotPollingResult {
  organizationId: string;
  botsProcessed: number;
  totalReplies: number;
  totalDms: number;
  errors: number;
}

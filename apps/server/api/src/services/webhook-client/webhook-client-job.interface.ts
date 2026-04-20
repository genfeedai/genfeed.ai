export interface WebhookJobData {
  endpoint: string;
  secret: string;
  payload: {
    event: string;
    timestamp: string;
    [key: string]: unknown;
  };
  organizationId: string;
  ingredientId?: string;
}

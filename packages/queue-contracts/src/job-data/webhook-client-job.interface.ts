export interface WebhookJobData {
  deliveryId?: string;
  endpoint: string;
  secret: string;
  payload: {
    event: string;
    timestamp: string;
    [key: string]: unknown;
  };
  organizationId: string;
  ingredientId?: string;
  isTest?: boolean;
}

export type WebhookFormState = {
  isWebhookEnabled: boolean;
  webhookEndpoint: string;
  webhookEventTypes: string[];
  webhookSecret: string;
};

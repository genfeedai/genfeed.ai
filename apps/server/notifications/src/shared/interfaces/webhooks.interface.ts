export interface WebhookNotification {
  service:
    | 'heygen'
    | 'replicate'
    | 'kling'
    | 'leonardoai'
    | 'stripe'
    | 'clerk'
    | 'vercel';
  event: string;
  status?: 'received' | 'processing' | 'completed' | 'failed';
  data: unknown;
  metadata?: {
    callbackId?: string;
    metadataId?: string;
    predictionId?: string;
    userId?: string;
    timestamp?: string;
  };
  error?: string;
}

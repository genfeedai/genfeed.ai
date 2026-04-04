/**
 * Base webhook payload with flexible structure
 * All webhook payloads extend this to allow dynamic properties
 */
export interface WebhookPayload {
  [key: string]: unknown;
}

/**
 * Stripe webhook event payload
 * @see https://stripe.com/docs/api/events
 */
export interface StripeWebhookPayload extends WebhookPayload {
  id: string;
  object: string;
  type: string;
  data: {
    object: unknown;
  };
  livemode?: boolean;
}

/**
 * Clerk webhook event payload
 * @see https://clerk.com/docs/integrations/webhooks
 */
export interface ClerkWebhookPayload extends WebhookPayload {
  type: string;
  data: unknown;
  object: string;
}

/**
 * Replicate webhook event payload
 * @see https://replicate.com/docs/webhooks
 */
export interface ReplicateWebhookPayload extends WebhookPayload {
  id: string;
  status: string;
  output?: unknown;
  error?: unknown;
}

/**
 * Heygen webhook event payload
 */
export interface HeygenWebhookPayload extends WebhookPayload {
  event_type?: string;
  event_data?: {
    callback_id?: string;
    duration?: number;
    error?: string;
    error_code?: string;
    status?: string;
    url?: string;
    video_id?: string;
    video_url?: string;
    [key: string]: unknown;
  };
  callback_id?: string;
  video_id?: string;
  status?: string;
}

/**
 * KlingAI webhook event payload
 */
export interface KlingAIWebhookPayload extends WebhookPayload {
  task_id?: string;
  task_status?: string;
}

/**
 * Opus Pro webhook event payload
 */
export interface OpusProWebhookPayload extends WebhookPayload {
  callback_id?: string;
  status?: string;
  videoUrl?: string;
  video_url?: string;
  error?: string;
}

/**
 * Leonardo.AI webhook event payload
 */
export interface LeonardoAIWebhookPayload extends WebhookPayload {
  generationId?: string;
  status?: string;
  data: unknown;
}

/**
 * OpenAI webhook event payload
 * @see https://platform.openai.com/docs/api-reference/assistants/webhooks
 */
export interface OpenAIWebhookPayload extends WebhookPayload {
  thread_id?: string;
  run_id?: string;
  status?: string;
}

/**
 * Vercel webhook event payload
 * @see https://vercel.com/docs/concepts/deployments/webhooks
 */
export interface VercelWebhookPayload extends WebhookPayload {
  type?: string;
  deployment?: unknown;
}

/**
 * Chromatic webhook event payload
 * @see https://www.chromatic.com/docs/custom-webhooks
 */
export interface ChromaticWebhookPayload extends WebhookPayload {
  event?: string;
  build?: {
    id?: string;
    number?: number;
    status?: string;
    url?: string;
    webUrl?: string;
    changeCount?: number;
    errorCount?: number;
    testCount?: number;
    storybookUrl?: string;
  };
  project?: {
    id?: string;
    name?: string;
  };
  commit?: {
    sha?: string;
    message?: string;
    author?: string;
  };
  branch?: string;
  timestamp?: string;
}

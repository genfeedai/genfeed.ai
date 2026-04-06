// Note: Replicate returns dynamic model identifiers (e.g., "genfeedai/<id>")

import type { ReplicateStatus } from '@api/services/integrations/replicate/helpers/replicate.enum';

export interface HeyGenWebhookPayload {
  event_type: string;
  event_data: {
    url: string;
    callback_id: string;
  };
}

export interface ReplicateWebhookPayload {
  // Common fields
  id: string;
  status: ReplicateStatus; // 'completed' | 'failed' (sometimes 'succeeded' from API — treat as completed)
  model?: string | string; // Present for prediction (media) callbacks; can be ModelKey enum or dynamic string (e.g., 'genfeedai/<id>')
  version?: string; // For training callbacks, this is the model version hash
  output?: unknown; // String for media; object/array/null for some models
  error?: string; // Error message when status is 'failed'
}

export interface KlingAIWebhookPayload {
  task_id: string;
  task_status: string;
  task_result: {
    images?: Array<{ url: string }>;
    videos?: Array<{ url: string }>;
  };
  task_error?: string; // Error message when task_status is not 'succeed'
}

export interface LeonardoAIWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;
      images: Array<{ generationId: string; url: string }>;
    };
  };
}

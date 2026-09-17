/**
 * Wire shapes for the documented Higgsfield REST catalog
 * (`https://api.higgsfield.ai`). Submit and status share one envelope.
 *
 * @see https://docs.higgsfield.ai/docs/concepts/requests
 */
export type HiggsFieldRequestStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled';

/**
 * Statuses the platform never moves away from — polling stops on these.
 * `canceled` is terminal too: a job cancelled through `/requests/{id}/cancel`
 * never reaches `completed`, so omitting it polls until the timeout.
 */
export const HIGGSFIELD_TERMINAL_STATUSES: readonly HiggsFieldRequestStatus[] =
  ['completed', 'failed', 'nsfw', 'canceled'];

export interface HiggsFieldMediaRef {
  url: string;
}

export interface HiggsFieldResponse {
  status: HiggsFieldRequestStatus;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  images?: HiggsFieldMediaRef[];
  video?: HiggsFieldMediaRef;
  error?: string;
}

export interface HiggsFieldCredentials {
  apiKey: string;
  apiSecret: string;
}

/**
 * Callback is the `hf_webhook` query parameter. Higgsfield sends no shared
 * secret with it; the receiving endpoint authenticates on its own.
 */
export interface HiggsFieldWebhook {
  url: string;
}

/** `POST /higgsfield-ai/dop/{standard|turbo|lite}` */
export interface HiggsFieldDopInput {
  prompt: string;
  image_url: string;
}

/** `POST /higgsfield-ai/soul/v2/standard` */
export interface HiggsFieldSoulInput {
  prompt: string;
  aspect_ratio: string;
  resolution: '720p' | '1080p';
  batch_size: 1 | 4;
  style_id?: string;
  enhance_prompt?: boolean;
  seed?: number;
}

/** True once the platform will not move the request to another status. */
export function isTerminalStatus(status: HiggsFieldRequestStatus): boolean {
  return HIGGSFIELD_TERMINAL_STATUSES.includes(status);
}

/**
 * Wire shapes for the Higgsfield platform API (v2), mirroring the official
 * SDK's `src/v2/types.ts`. The platform answers every submit and every status
 * poll with the same envelope, so one interface covers both.
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
}

export interface HiggsFieldCredentials {
  apiKey: string;
  apiSecret: string;
}

/**
 * v2 carries the callback as the `hf_webhook` query parameter and sends no
 * shared secret with it — unlike v1, which put `{ url, secret }` in the body.
 * The receiving endpoint is authenticated by the secret configured console
 * side, so there is nothing to pass from here but the URL.
 */
export interface HiggsFieldWebhook {
  url: string;
}

/** `/v1/image2video/dop` */
export interface HiggsFieldDopInput {
  model: string;
  prompt: string;
  input_images: Array<{ type: 'image_url'; image_url: string }>;
  motions?: Array<{ id: string; strength: number }>;
  seed?: number;
  enhance_prompt?: boolean;
}

/** `/v1/text2image/soul` */
export interface HiggsFieldSoulInput {
  prompt: string;
  width_and_height: string;
  quality: '720p' | '1080p';
  batch_size: 1 | 4;
  style_id?: string;
  style_strength?: number;
  custom_reference_id?: string;
  custom_reference_strength?: number;
  image_reference?: { type: 'image_url'; image_url: string };
  enhance_prompt?: boolean;
  seed?: number;
}

/** True once the platform will not move the request to another status. */
export function isTerminalStatus(status: HiggsFieldRequestStatus): boolean {
  return HIGGSFIELD_TERMINAL_STATUSES.includes(status);
}

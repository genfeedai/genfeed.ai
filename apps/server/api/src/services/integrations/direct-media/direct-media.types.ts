/** Reviewed direct media routes. These identities never alias aggregator accounts. */
export type DirectMediaProvider = 'google' | 'xai' | 'bfl' | 'runway';
export type DirectMediaMode =
  | 'text-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video';

export interface DirectMediaReference {
  /** Supplied by tenant-scoped asset admission, never an arbitrary caller reference. */
  url: string;
  mimeType?: string;
}

export interface DirectMediaInput {
  model: string;
  mode: DirectMediaMode;
  prompt: string;
  references: readonly DirectMediaReference[];
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  seed?: number;
}

export interface DirectMediaModelContract {
  provider: DirectMediaProvider;
  model: string;
  modes: readonly DirectMediaMode[];
  contractVersion: string;
  sourceUrls: readonly string[];
  maxReferences: number;
  cancellation: 'supported' | 'unsupported';
}

export interface PreparedDirectMediaRequest {
  provider: DirectMediaProvider;
  model: string;
  mode: DirectMediaMode;
  contractVersion: string;
  endpoint: string;
  body: Record<string, unknown>;
}

/** Ephemeral only. Never persist, serialize, or log this context. */
export interface DirectMediaRequestContext {
  apiKey: string;
  signal?: AbortSignal;
  onProviderSubmissionStarted?: () => void;
}

export interface DirectMediaOutput {
  url?: string;
  base64?: string;
  mimeType?: string;
  /** Protected Google output must be downloaded using the original account. */
  requiresCredential?: boolean;
}

export interface DirectMediaTask {
  externalId: string;
  pollingUrl?: string;
  model?: string;
}

export type DirectMediaSubmission =
  | { kind: 'inline'; outputs: readonly DirectMediaOutput[] }
  | ({ kind: 'task' } & DirectMediaTask);

export interface DirectMediaPollResult {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  outputs?: readonly DirectMediaOutput[];
  error?: { code: string; message: string };
}

export interface DirectMediaCancellation {
  status: 'confirmed' | 'requested' | 'unsupported';
}

export interface DirectMediaCredentialValidation {
  isValid: boolean;
  error?: string;
}

export type DirectMediaTransport = typeof fetch;

export interface DirectMediaClient {
  validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation>;
  submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission>;
  poll(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult>;
  cancel(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation>;
}

/** Safe diagnostic category only; never retain provider bodies or HTTP request objects. */
export class DirectMediaProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly isSubmissionUncertain = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DirectMediaProviderError';
  }
}

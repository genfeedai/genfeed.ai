import { createHash } from 'node:crypto';
import {
  CLIP_SOURCE_SCHEMA_VERSION,
  type ClipProcessingFlow,
  type ClipSourceContract,
} from '@genfeedai/contracts/interfaces';
export const DEFAULT_CLIP_SOURCE_MAX_RETRIES = 3;

export function buildYoutubeSource(
  youtubeUrl: string,
  flow: ClipProcessingFlow,
): ClipSourceContract {
  return {
    fingerprint: hashSource(youtubeUrl),
    flow,
    kind: 'youtube',
    maxRetries: DEFAULT_CLIP_SOURCE_MAX_RETRIES,
    retryCount: 0,
    schemaVersion: CLIP_SOURCE_SCHEMA_VERSION,
    status: 'queued',
    updatedAt: new Date().toISOString(),
  };
}

export function withClipSourceJobId(
  source: ClipSourceContract,
  jobId: string,
): ClipSourceContract {
  return {
    ...source,
    jobId,
    updatedAt: new Date().toISOString(),
  };
}

export function hashSource(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * A failed workflow graph reports `Nodes failed: <node>: <reason>`. The node
 * id is an internal step name; the creator sees only the reason.
 */
export function toClipSourceFailureMessage(workflowError: string): string {
  return workflowError.replace(/^Nodes failed: [\w.-]+: /, '');
}

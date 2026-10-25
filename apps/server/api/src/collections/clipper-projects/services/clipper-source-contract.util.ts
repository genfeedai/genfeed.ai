import { createHash } from 'node:crypto';
import {
  CLIPPER_SOURCE_SCHEMA_VERSION,
  type ClipProcessingFlow,
  type ClipperSourceContract,
} from '@genfeedai/contracts/interfaces';
export const DEFAULT_CLIP_SOURCE_MAX_RETRIES = 3;

export function buildYoutubeSource(
  youtubeUrl: string,
  flow: ClipProcessingFlow,
): ClipperSourceContract {
  return {
    fingerprint: hashSource(youtubeUrl),
    flow,
    kind: 'youtube',
    maxRetries: DEFAULT_CLIP_SOURCE_MAX_RETRIES,
    retryCount: 0,
    schemaVersion: CLIPPER_SOURCE_SCHEMA_VERSION,
    status: 'queued',
    updatedAt: new Date().toISOString(),
  };
}

export function withClipperSourceJobId(
  source: ClipperSourceContract,
  jobId: string,
): ClipperSourceContract {
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
export function toClipFailureMessage(workflowError: string): string {
  return workflowError.replace(/^Nodes failed: [\w.-]+: /, '');
}

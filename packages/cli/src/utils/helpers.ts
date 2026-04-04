import { createHash } from 'node:crypto';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function stableIdempotencyKey(
  actionType: string,
  input: Record<string, unknown>,
  profile: string
): string {
  const hash = createHash('sha256')
    .update(actionType)
    .update('\n')
    .update(profile)
    .update('\n')
    .update(JSON.stringify(input))
    .digest('hex');

  return `cli_${actionType}_${hash.slice(0, 32)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatProgress(progress: number): string {
  const filled = Math.round(progress / 5);
  const empty = 20 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
}

export function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** Default polling timeout: 2 hours for training, 30 min for generation */
export const POLL_TIMEOUT_TRAINING = 2 * 60 * 60 * 1000;
export const POLL_TIMEOUT_GENERATION = 30 * 60 * 1000;

export function hasExceededTimeout(startTime: number, timeoutMs: number): boolean {
  return Date.now() - startTime > timeoutMs;
}

export function extractId(doc: { _id?: string; id?: string }): string {
  const candidate = doc._id ?? doc.id;
  if (!candidate) {
    throw new Error('Document does not contain an id.');
  }
  return candidate;
}

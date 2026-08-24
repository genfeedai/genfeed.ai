import type { XAdWatchedAdvertiser } from '@genfeedai/prisma';

/**
 * No JSON `config` blob to flatten (unlike `WatchlistDocument`) — every field
 * is a plain scalar column, so the document type is a direct pass-through.
 */
export type XAdWatchedAdvertiserDocument = XAdWatchedAdvertiser;

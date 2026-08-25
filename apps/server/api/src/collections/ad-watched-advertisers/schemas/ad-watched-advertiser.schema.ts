import type { AdWatchedAdvertiser } from '@genfeedai/prisma';

/**
 * No JSON `config` blob to flatten (unlike `WatchlistDocument`) — every field
 * is a plain scalar column, so the document type is a direct pass-through.
 */
export type AdWatchedAdvertiserDocument = AdWatchedAdvertiser;

import type {
  ScopedOutboxOptions,
  ScopedOutboxStorage,
} from '@genfeedai/contracts/interfaces/utils/scoped-outbox.interface';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftSaveStatus,
} from '@pages/studio/playground/types';
import { logger } from '@services/core/logger.service';
import { isRecord } from '@utils/data/extract.util';
import {
  createScopedOutbox,
  SCOPED_OUTBOX_IDLE_TIMEOUT_MS,
} from '@utils/outbox/scoped-outbox.util';

export type StudioPlaygroundDraftWrite = (
  brandId: string,
  payload: StudioGenerateDraftPayload,
  options: { isKeepalive: boolean; ownerId: string | null },
) => Promise<unknown>;

/**
 * Thrown by a draft write the server will never accept (a 4xx rejection, or
 * a payload queued by a user who is no longer signed in here). The outbox
 * drops that write instead of retrying it.
 */
export class StudioPlaygroundDraftRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioPlaygroundDraftRejectedError';
  }
}

export type StudioPlaygroundDraftStatusListener = (
  status: StudioGenerateDraftSaveStatus,
) => void;

/** The slice of `Storage` the outbox persists unsent drafts through. */
export type StudioPlaygroundDraftStorage = ScopedOutboxStorage;

export type StudioPlaygroundDraftOutboxOptions = ScopedOutboxOptions;

export interface StudioPlaygroundDraftOutbox {
  /**
   * Queues the brand's latest composer. Only the newest payload per brand is
   * kept; writes are serialized and each landed write is followed by another
   * if the queued composer still differs from what the server acknowledged.
   * With an `ownerId`, the unsent payload is also kept in storage until the
   * server acknowledges it, so a page teardown mid-queue cannot lose it.
   */
  enqueue: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
    options: {
      isKeepalive?: boolean;
      ownerId?: string | null;
      write: StudioPlaygroundDraftWrite;
    },
  ) => void;
  /** Drops every queued write another user left behind in this tab. */
  discardForeign: (ownerId: string) => void;
  /** An unsent payload a previous page left for this brand and user. */
  readUnsent: (
    brandId: string,
    ownerId: string,
  ) => StudioGenerateDraftPayload | null;
  /** What the server holds for the brand, e.g. the draft a load returned. */
  setAcknowledged: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
  ) => void;
  subscribe: (
    brandId: string,
    listener: StudioPlaygroundDraftStatusListener,
  ) => () => void;
  /**
   * Resolves once the brand has nothing in flight, queued, or waiting on a
   * retry — the server then holds the latest composer written for it.
   * Rejects after the idle deadline so restoration can retry without reading
   * an older server draft over unsent content. The write/retry queue is kept.
   */
  whenIdle: (brandId: string) => Promise<void>;
}

export const STUDIO_PLAYGROUND_DRAFT_IDLE_TIMEOUT_MS =
  SCOPED_OUTBOX_IDLE_TIMEOUT_MS;

export const STUDIO_PLAYGROUND_DRAFT_OUTBOX_STORAGE_PREFIX =
  'genfeed.studio.generate.draft-outbox.v1';

function isDraftPayload(value: unknown): value is StudioGenerateDraftPayload {
  return (
    isRecord(value) &&
    typeof value.prompt === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.references) &&
    Array.isArray(value.attachments) &&
    isRecord(value.settingsByType) &&
    isRecord(value.knowledgeSelection)
  );
}

/** Key order matches the composer's payload so equal content compares equal. */
export function serializeStudioPlaygroundDraftPayload(
  payload: StudioGenerateDraftPayload,
): string {
  return JSON.stringify({
    attachments: payload.attachments,
    knowledgeSelection: payload.knowledgeSelection,
    prompt: payload.prompt,
    references: payload.references,
    settingsByType: payload.settingsByType,
    type: payload.type,
  });
}

/**
 * Per-brand draft outbox. It lives outside React on purpose: a write queued
 * as the Generate workspace unmounts (in-app navigation, brand switch) still
 * lands, in order, after any write already in flight — and a write the page
 * never got to send is replayed by the next Generate load.
 */
export function createStudioPlaygroundDraftOutbox(
  options: StudioPlaygroundDraftOutboxOptions = {},
): StudioPlaygroundDraftOutbox {
  const outbox = createScopedOutbox<
    StudioGenerateDraftPayload,
    StudioGenerateDraftPayload,
    'error' | 'failed'
  >(
    {
      classifyFailure: (error) =>
        error instanceof StudioPlaygroundDraftRejectedError
          ? {
              // Retrying cannot help: drop this write and move on to anything
              // newer that was queued meanwhile.
              action: 'drop-write',
              logMessage: 'Studio composer draft was rejected',
              status: 'failed',
            }
          : null,
      fromStored: (stored) =>
        isDraftPayload(stored.payload) ? stored.payload : null,
      idleTimeoutMessage:
        'Studio draft acknowledgement timed out; unsent content is retained',
      logError: (message, error) => logger.error(message, error),
      retryLogMessage: 'Failed to save the Studio composer draft',
      retryStatus: 'error',
      serialize: serializeStudioPlaygroundDraftPayload,
      storageKeyPrefix: STUDIO_PLAYGROUND_DRAFT_OUTBOX_STORAGE_PREFIX,
      toStored: ({ ownerId, payload }) => ({ ownerId, payload }),
    },
    options,
  );

  return {
    discardForeign: outbox.discardForeign,
    enqueue: outbox.enqueue,
    readUnsent: outbox.readUnsent,
    setAcknowledged: outbox.setAcknowledged,
    subscribe: outbox.subscribe,
    whenIdle: outbox.whenIdle,
  };
}

/** The app-wide outbox the Generate workspace writes its drafts through. */
export const studioPlaygroundDraftOutbox = createStudioPlaygroundDraftOutbox();

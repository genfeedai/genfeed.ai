import type {
  IDesktopSession,
  IDesktopThread,
} from '@genfeedai/desktop-contracts';
import {
  markSyncFailed,
  markSyncSuccess,
  upsertSyncLogEntry,
} from '../db/pglite';
import { queryThreads, upsertMessages, upsertThread } from '../db/threads';

export type SyncResult = {
  errors: string[];
  pulledCount: number;
  pushedCount: number;
};

type PullResponse = {
  data: { threads: IDesktopThread[]; updatedCursor: string };
};

type PushResponse = {
  data: { accepted: number; rejected: number; updatedCursor: string };
};

export class ThreadSyncService {
  async run(opts: {
    apiEndpoint: string;
    localUserId: string;
    session: IDesktopSession;
  }): Promise<SyncResult> {
    const { apiEndpoint, localUserId, session } = opts;
    const errors: string[] = [];
    let pushedCount = 0;
    let pulledCount = 0;

    try {
      // Read current cursor
      const cursor = await window.genfeedDesktop.sync.getCursor();

      // 1. PUSH: get all local threads
      const localThreads = await queryThreads(localUserId);
      const pushCandidates = cursor
        ? localThreads.filter((t) => t.updatedAt > cursor)
        : localThreads;

      if (pushCandidates.length > 0) {
        // Batch: max 500 threads per push
        const batch = pushCandidates.slice(0, 500);

        // Log pending
        for (const t of batch) {
          await upsertSyncLogEntry({
            direction: 'push',
            entity: 'thread',
            entity_id: t.id,
            id: `push-${t.id}-${Date.now()}`,
            status: 'pending',
          });
        }

        try {
          const pushRes = await fetch(`${apiEndpoint}/sync/desktop/threads`, {
            body: JSON.stringify({ localUserId, threads: batch }),
            headers: {
              Authorization: `Bearer ${session.token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          });

          if (pushRes.ok) {
            const pushBody = (await pushRes.json()) as PushResponse;
            pushedCount = pushBody.data.accepted;

            for (const t of batch) {
              await markSyncSuccess(
                `push-${t.id}-${Date.now()}`,
                new Date().toISOString(),
              );
            }
          } else {
            const errMsg = `Push failed: ${pushRes.status}`;
            errors.push(errMsg);
            for (const t of batch) {
              await markSyncFailed(`push-${t.id}-${Date.now()}`, errMsg);
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Push failed';
          errors.push(errMsg);
        }
      }

      // 2. PULL: get remote changes since cursor
      const pullUrl = cursor
        ? `${apiEndpoint}/sync/desktop/threads?cursor=${encodeURIComponent(cursor)}`
        : `${apiEndpoint}/sync/desktop/threads`;

      const pullRes = await fetch(pullUrl, {
        headers: { Authorization: `Bearer ${session.token}` },
      });

      if (pullRes.ok) {
        const pullBody = (await pullRes.json()) as PullResponse;
        const remoteThreads = pullBody.data.threads;

        for (const remote of remoteThreads) {
          const local = localThreads.find((t) => t.id === remote.id);
          if (!local || remote.updatedAt > local.updatedAt) {
            await upsertThread(localUserId, remote);
            if (remote.messages.length > 0) {
              await upsertMessages(remote.id, remote.messages);
            }
            pulledCount++;
          }
        }

        await window.genfeedDesktop.sync.setCursor(pullBody.data.updatedCursor);
      } else {
        errors.push(`Pull failed: ${pullRes.status}`);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Sync failed');
    }

    return { errors, pulledCount, pushedCount };
  }
}

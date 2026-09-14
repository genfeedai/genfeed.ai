import type { IBackgroundTaskUpdatePayload } from '@genfeedai/contracts/interfaces';
import type { Ora } from 'ora';
import { io, type Socket } from 'socket.io-client';
import { getApiKey, getApiUrl } from '@/config/store';
import { ApiError, AuthError, GenfeedError } from '@/utils/errors';
import {
  MEDIA_IN_PROGRESS_STATUSES,
  MEDIA_SUCCESS_STATUSES,
  type MediaObservation,
} from '@/utils/media-status';

export interface WaitForCompletionOptions<T extends MediaObservation> {
  taskId: string;
  taskType: 'IMAGE' | 'VIDEO';
  getResult: (signal: AbortSignal) => Promise<T>;
  spinner?: Ora;
  timeout?: number;
}

export interface WaitResult<T> {
  result: T;
  elapsed: number;
}

async function getWebSocketUrl(): Promise<string> {
  const apiUrl = await getApiUrl();
  return apiUrl.replace(/\/v\d+$/, '');
}

export async function waitForCompletion<T extends MediaObservation>(
  options: WaitForCompletionOptions<T>
): Promise<WaitResult<T>> {
  const { taskId, taskType, getResult, spinner, timeout = 600000 } = options;
  const startTime = Date.now();
  const controller = new AbortController();
  const suggestion = `Check details with: gf status ${taskId} --type ${taskType.toLowerCase()}`;

  return new Promise((resolve, reject) => {
    let socket: Socket | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let isSettled = false;
    let isReading = false;
    let hasPendingObservation = false;

    const cleanup = () => {
      clearTimeout(deadlineTimer);
      clearTimeout(pollTimer);
      controller.abort();
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    };

    const fail = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(error);
    };

    const deadlineTimer = setTimeout(() => {
      fail(new GenfeedError('Operation timed out', suggestion));
    }, timeout);

    const observe = async (): Promise<void> => {
      if (isSettled) return;
      if (isReading) {
        hasPendingObservation = true;
        return;
      }
      clearTimeout(pollTimer);
      isReading = true;
      try {
        const result = await getResult(controller.signal);
        if (isSettled) return;
        if (result.id !== taskId) {
          fail(new GenfeedError('Unexpected media returned by status lookup', suggestion));
        } else if (MEDIA_SUCCESS_STATUSES.has(result.status)) {
          isSettled = true;
          cleanup();
          resolve({ elapsed: Date.now() - startTime, result });
        } else if (!MEDIA_IN_PROGRESS_STATUSES.has(result.status)) {
          fail(
            new GenfeedError(
              result.error ?? `Generation ${result.status.toLowerCase()}`,
              suggestion
            )
          );
        }
      } catch (error) {
        if (isSettled) return;
        if (
          error instanceof AuthError ||
          (error instanceof ApiError &&
            error.statusCode !== undefined &&
            error.statusCode >= 400 &&
            error.statusCode < 500 &&
            error.statusCode !== 408 &&
            error.statusCode !== 429)
        ) {
          fail(error);
        } else if (spinner) {
          spinner.text = 'Status temporarily unavailable, retrying...';
        }
      } finally {
        isReading = false;
        if (!isSettled) {
          if (hasPendingObservation) {
            hasPendingObservation = false;
            void observe();
          } else {
            pollTimer = setTimeout(() => void observe(), 2000);
          }
        }
      }
    };

    const connect = async () => {
      await observe();
      if (isSettled) return;
      try {
        const connection = await createWebSocketConnection(controller.signal);
        if (isSettled) {
          connection.disconnect();
          return;
        }
        socket = connection;
        socket.on('connect', () => {
          if (isSettled) return;
          if (spinner) spinner.text = 'Connected, waiting for generation...';
          void observe();
        });
        socket.on('connect_error', () => {
          if (!isSettled && spinner) spinner.text = 'Live updates unavailable, checking status...';
        });
        socket.on('disconnect', (reason: string) => {
          if (!isSettled && reason !== 'io client disconnect' && spinner) {
            spinner.text = 'Reconnecting, checking status...';
          }
        });
        socket.on('background-task-update', (data: IBackgroundTaskUpdatePayload) => {
          if (isSettled || (data.resultId !== taskId && data.taskId !== taskId)) return;
          if (data.resultType && data.resultType !== taskType) return;
          if (spinner && data.progress !== undefined) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            spinner.text = `Generating... ${data.progress}% (${elapsed}s)`;
          }
          if (data.status === 'completed' || data.status === 'failed') void observe();
        });
      } catch {
        if (!isSettled && spinner) spinner.text = 'Live updates unavailable, checking status...';
      }
    };
    void connect();
  });
}

export async function createWebSocketConnection(signal?: AbortSignal): Promise<Socket> {
  signal?.throwIfAborted();
  const [apiKey, wsUrl] = await Promise.all([getApiKey(), getWebSocketUrl()]);
  signal?.throwIfAborted();

  return io(wsUrl, {
    auth: {
      token: apiKey,
    },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket'],
  });
}

import type { Socket } from 'socket.io-client';
import { createWebSocketConnection } from '@/utils/websocket';

const SOCKET_READY_TIMEOUT_MS = 2_000;

export interface AgentLiveIdentity {
  runId?: string;
  threadId: string;
}

interface AgentLivePayload extends AgentLiveIdentity {
  [key: string]: unknown;
}

export interface AgentLiveTokenPayload extends AgentLivePayload {
  token: string;
}

export interface AgentLiveDonePayload extends AgentLivePayload {
  fullContent: string;
  metadata?: Record<string, unknown>;
}

export interface AgentLiveErrorPayload extends AgentLivePayload {
  error: string;
}

export type AgentLiveStreamEvent =
  | { payload: AgentLiveDonePayload; type: 'done' }
  | { error: Error; type: 'transport-error' }
  | { payload: AgentLiveErrorPayload; type: 'error' }
  | { reason: string; type: 'disconnected' }
  | { type: 'reconnected' }
  | { payload: AgentLiveTokenPayload; type: 'token' };

export interface AgentLiveStream {
  bind(identity: AgentLiveIdentity): void;
  close(): void;
  drain(): AgentLiveStreamEvent[];
  waitForActivity(timeoutMs: number): Promise<void>;
  waitUntilReady(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asIdentityPayload(value: unknown): AgentLivePayload | undefined {
  if (!isRecord(value) || typeof value.threadId !== 'string') {
    return undefined;
  }

  return {
    ...value,
    runId: typeof value.runId === 'string' ? value.runId : undefined,
    threadId: value.threadId,
  };
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return new Error(error.message);
  }

  return new Error(fallback);
}

class SocketAgentLiveStream implements AgentLiveStream {
  private activityWaiter?: () => void;
  private boundIdentity?: AgentLiveIdentity;
  private closed = false;
  private readonly events: AgentLiveStreamEvent[] = [];
  private hasConnected = false;
  private readySettled = false;
  private readonly readyPromise: Promise<void>;
  private resolveReady?: () => void;
  private readyTimeout?: ReturnType<typeof setTimeout>;

  private readonly onConnected = () => {
    const isReconnect = this.hasConnected;
    this.hasConnected = true;
    this.settleReady();

    if (isReconnect) {
      this.enqueue({ type: 'reconnected' });
    }
  };

  private readonly onConnectError = (error: unknown) => {
    this.enqueue({
      error: toError(error, 'Live stream connection failed'),
      type: 'transport-error',
    });
    this.settleReady();
  };

  private readonly onDisconnect = (reason: string) => {
    if (reason !== 'io client disconnect') {
      this.enqueue({ reason, type: 'disconnected' });
    }
  };

  private readonly onDone = (value: unknown) => {
    const payload = asIdentityPayload(value);
    if (!payload || typeof payload.fullContent !== 'string') {
      return;
    }

    this.enqueue({
      payload: {
        ...payload,
        fullContent: payload.fullContent,
        metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
      },
      type: 'done',
    });
  };

  private readonly onError = (value: unknown) => {
    const payload = asIdentityPayload(value);
    if (!payload || typeof payload.error !== 'string') {
      return;
    }

    this.enqueue({
      payload: { ...payload, error: payload.error },
      type: 'error',
    });
  };

  private readonly onToken = (value: unknown) => {
    const payload = asIdentityPayload(value);
    if (!payload || typeof payload.token !== 'string' || payload.token.length === 0) {
      return;
    }

    this.enqueue({
      payload: { ...payload, token: payload.token },
      type: 'token',
    });
  };

  constructor(private readonly socket: Socket) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    socket.on('connected', this.onConnected);
    socket.on('connect_error', this.onConnectError);
    socket.on('disconnect', this.onDisconnect);
    socket.on('agent:token', this.onToken);
    socket.on('agent:done', this.onDone);
    socket.on('agent:error', this.onError);

    this.readyTimeout = setTimeout(() => {
      this.enqueue({
        error: new Error('Timed out waiting for the live stream connection'),
        type: 'transport-error',
      });
      this.settleReady();
    }, SOCKET_READY_TIMEOUT_MS);
    this.readyTimeout.unref?.();
  }

  bind(identity: AgentLiveIdentity): void {
    this.boundIdentity = identity;
    this.removeUnmatchedEvents();
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    this.activityWaiter?.();
    this.activityWaiter = undefined;

    this.socket.off('connected', this.onConnected);
    this.socket.off('connect_error', this.onConnectError);
    this.socket.off('disconnect', this.onDisconnect);
    this.socket.off('agent:token', this.onToken);
    this.socket.off('agent:done', this.onDone);
    this.socket.off('agent:error', this.onError);
    this.socket.disconnect();
  }

  drain(): AgentLiveStreamEvent[] {
    if (this.events.length === 0) {
      return [];
    }

    const drained = this.events.splice(0, this.events.length);
    return drained;
  }

  async waitForActivity(timeoutMs: number): Promise<void> {
    if (this.events.length > 0 || this.closed) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.activityWaiter === wake) {
          this.activityWaiter = undefined;
        }
        resolve();
      }, timeoutMs);
      timeout.unref?.();

      const wake = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.activityWaiter = wake;
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  private enqueue(event: AgentLiveStreamEvent): void {
    if (this.closed || !this.matchesBoundIdentity(event)) {
      return;
    }

    this.events.push(event);
    this.activityWaiter?.();
    this.activityWaiter = undefined;
  }

  private matchesBoundIdentity(event: AgentLiveStreamEvent): boolean {
    if (!this.boundIdentity || !('payload' in event)) {
      return true;
    }

    const { payload } = event;
    if (payload.threadId !== this.boundIdentity.threadId) {
      return false;
    }

    if (this.boundIdentity.runId && payload.runId) {
      return payload.runId === this.boundIdentity.runId;
    }

    return true;
  }

  private removeUnmatchedEvents(): void {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (!this.matchesBoundIdentity(this.events[index]!)) {
        this.events.splice(index, 1);
      }
    }
  }

  private settleReady(): void {
    if (this.readySettled) {
      return;
    }

    this.readySettled = true;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    this.resolveReady?.();
    this.resolveReady = undefined;
  }
}

export async function openAgentLiveStream(): Promise<AgentLiveStream> {
  return new SocketAgentLiveStream(await createWebSocketConnection());
}

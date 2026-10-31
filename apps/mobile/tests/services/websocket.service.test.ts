import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@/services/sentry.service', () => ({
  sentryService: sentry,
}));

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly instances: MockWebSocket[] = [];

  readonly readyState = 0;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;

  close = vi.fn();
  send = vi.fn();

  constructor() {
    MockWebSocket.instances.push(this);
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);

import { websocketService } from '@/services/websocket.service';

describe('websocketService', () => {
  let socket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    websocketService.removeAllListeners();
    websocketService.connect('test-token');
    socket = MockWebSocket.instances.at(-1) as MockWebSocket;
    socket.onopen?.();
  });

  afterEach(() => {
    websocketService.disconnect();
  });

  it('reports malformed messages without dispatching them', () => {
    const message = vi.fn();
    websocketService.on('message', message);

    socket.onmessage?.({ data: 'not-json' } as MessageEvent);

    expect(message).not.toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      { operation: 'parseWebSocketMessage' },
    );
  });

  it('reports connection failures without emitting the reserved error event', () => {
    const connectionError = vi.fn();
    websocketService.on('connectionError', connectionError);

    expect(() => socket.onerror?.()).not.toThrow();

    expect(connectionError).toHaveBeenCalledWith(expect.any(Error));
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      connectionState: 'connected',
      operation: 'connectWebSocket',
      reconnectAttempts: 0,
    });
  });
});

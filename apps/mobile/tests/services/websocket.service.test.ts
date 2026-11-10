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

  it('is connected once the socket opens', () => {
    expect(websocketService.getConnectionState()).toBe('connected');
    expect(websocketService.isConnected()).toBe(true);
  });

  it('delivers parsed messages to listeners of the message type', () => {
    const received: unknown[] = [];
    const typed: unknown[] = [];
    websocketService.on('message', (message) => received.push(message));
    websocketService.on('notification', (data) => typed.push(data));
    const message = {
      data: { title: 'Ready' },
      timestamp: '2026-11-09T10:00:00.000Z',
      type: 'notification',
    };

    socket.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);

    expect(received).toEqual([message]);
    expect(typed).toEqual([{ title: 'Ready' }]);
  });

  it('reports malformed messages without dispatching them', () => {
    const received: unknown[] = [];
    websocketService.on('message', (message) => received.push(message));

    socket.onmessage?.({ data: 'not-json' } as MessageEvent);

    expect(received).toEqual([]);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      { operation: 'parseWebSocketMessage' },
    );
  });

  it('reports connection failures without emitting the reserved error event', () => {
    const connectionErrors: Error[] = [];
    websocketService.on('connectionError', (error: Error) =>
      connectionErrors.push(error),
    );

    expect(() => socket.onerror?.()).not.toThrow();

    expect(connectionErrors.map((error) => error.message)).toEqual([
      'WebSocket connection error',
    ]);
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      connectionState: 'connected',
      operation: 'connectWebSocket',
      reconnectAttempts: 0,
    });
  });
});

import { EventEmitter } from 'node:events';
import Constants from 'expo-constants';

const WS_URL = Constants.expoConfig?.extra?.wsUrl || 'wss://api.genfeed.ai/ws';

const PING_INTERVAL_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export type WebSocketMessageType =
  | 'approval_request'
  | 'approval_updated'
  | 'content_ready'
  | 'generation_progress'
  | 'notification'
  | 'pong';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: Record<string, unknown>;
  timestamp: string;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private authToken: string | null = null;
  private connectionState: ConnectionState = 'disconnected';

  connect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.authToken = token;
    this.setConnectionState('connecting');

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  disconnect(): void {
    this.stopPingInterval();
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('disconnected');
  }

  send(type: string, data: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        type,
      }),
    );
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emit('connectionStateChanged', state);
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.setConnectionState('connected');
    this.startPingInterval();
    this.emit('connected');
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.emit('message', message);
      this.emit(message.type, message.data);
    } catch {
      // Invalid JSON - ignore
    }
  }

  private handleClose(): void {
    this.stopPingInterval();
    this.setConnectionState('disconnected');
    this.emit('disconnected');
    this.attemptReconnect();
  }

  private handleError(): void {
    this.emit('error', new Error('WebSocket connection error'));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || !this.authToken) {
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');
    this.emit('reconnecting', this.reconnectAttempts);

    const delay = BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.authToken) {
        this.connect(this.authToken);
      }
    }, delay);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.send('ping', {});
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export const websocketService = new WebSocketService();

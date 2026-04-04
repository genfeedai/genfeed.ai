import { EventEmitter } from 'node:events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { networkService } from '@/services/network.service';

export interface QueuedAction {
  id: string;
  type: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload?: Record<string, unknown>;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

export type QueueActionType =
  | 'CREATE_IDEA'
  | 'UPDATE_IDEA'
  | 'DELETE_IDEA'
  | 'APPROVE_CONTENT'
  | 'REJECT_CONTENT';

const QUEUE_KEY = '@genfeed_offline_queue';

class OfflineQueueService extends EventEmitter {
  private queue: QueuedAction[] = [];
  private isProcessing: boolean = false;
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.loadQueue();

    // Listen for network changes
    networkService.on('online', () => {
      this.processQueue();
    });

    this.initialized = true;
  }

  async addAction(action: {
    type: QueueActionType;
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    payload?: Record<string, unknown>;
    maxRetries?: number;
  }): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const queuedAction: QueuedAction = {
      endpoint: action.endpoint,
      id,
      maxRetries: action.maxRetries ?? 3,
      method: action.method,
      payload: action.payload,
      retries: 0,
      timestamp: Date.now(),
      type: action.type,
    };

    this.queue.push(queuedAction);
    await this.saveQueue();
    this.emit('actionQueued', queuedAction);

    // Try to process if online
    if (networkService.isOnline()) {
      this.processQueue();
    }

    return id;
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    if (!networkService.isOnline()) {
      return;
    }

    this.isProcessing = true;
    this.emit('processingStarted');

    const actionsToProcess = [...this.queue];
    const processedIds: string[] = [];

    for (const action of actionsToProcess) {
      try {
        await this.executeAction(action);
        processedIds.push(action.id);
        this.emit('actionProcessed', action);
      } catch {
        action.retries++;

        if (action.retries >= action.maxRetries) {
          processedIds.push(action.id);
          this.emit('actionFailed', action);
        }
      }
    }

    // Remove processed actions
    this.queue = this.queue.filter(
      (action) => !processedIds.includes(action.id),
    );
    await this.saveQueue();

    this.isProcessing = false;
    this.emit('processingComplete', {
      processed: processedIds.length,
      remaining: this.queue.length,
    });
  }

  private async executeAction(action: QueuedAction): Promise<void> {
    const response = await fetch(action.endpoint, {
      body: action.payload ? JSON.stringify(action.payload) : undefined,
      headers: {
        'Content-Type': 'application/json',
      },
      method: action.method,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }

  getQueue(): QueuedAction[] {
    return [...this.queue];
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isQueueEmpty(): boolean {
    return this.queue.length === 0;
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.emit('queueCleared');
  }

  async removeAction(id: string): Promise<void> {
    this.queue = this.queue.filter((action) => action.id !== id);
    await this.saveQueue();
    this.emit('actionRemoved', id);
  }

  private async loadQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch {
      this.queue = [];
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // Failed to save queue
    }
  }
}

export const offlineQueueService = new OfflineQueueService();

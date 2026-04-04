import { EventEmitter } from 'node:events';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

class NetworkService extends EventEmitter {
  private isConnected: boolean = true;
  private networkType: string | null = null;
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Get initial state
    const state = await NetInfo.fetch();
    this.updateState(state);

    // Listen for changes
    NetInfo.addEventListener((state) => {
      this.updateState(state);
    });

    this.initialized = true;
  }

  private updateState(state: NetInfoState): void {
    const wasConnected = this.isConnected;
    this.isConnected = state.isConnected ?? false;
    this.networkType = state.type;

    if (wasConnected !== this.isConnected) {
      this.emit('connectionChanged', this.isConnected);

      if (this.isConnected) {
        this.emit('online');
      } else {
        this.emit('offline');
      }
    }
  }

  isOnline(): boolean {
    return this.isConnected;
  }

  getStatus(): NetworkStatus {
    if (!this.initialized) {
      return 'unknown';
    }
    return this.isConnected ? 'online' : 'offline';
  }

  getNetworkType(): string | null {
    return this.networkType;
  }

  async checkConnection(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  }
}

export const networkService = new NetworkService();

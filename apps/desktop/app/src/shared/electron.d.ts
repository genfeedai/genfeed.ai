declare module 'electron' {
  export interface IpcMainInvokeEvent {}

  export interface BrowserWindowConstructorOptions {
    backgroundColor?: string;
    height?: number;
    minHeight?: number;
    minWidth?: number;
    show?: boolean;
    title?: string;
    titleBarStyle?: string;
    webPreferences?: {
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      preload?: string;
      sandbox?: boolean;
    };
    width?: number;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    focus(): void;
    isMinimized(): boolean;
    loadFile(filePath: string): void;
    on(event: string, callback: () => void): void;
    once(event: string, callback: () => void): void;
    restore(): void;
    show(): void;
    webContents: {
      send(channel: string, ...args: unknown[]): void;
    };
  }

  export const app: {
    getPath(name: string): string;
    on(event: string, callback: (...args: any[]) => void): void;
    quit(): void;
    requestSingleInstanceLock(): boolean;
    setAsDefaultProtocolClient(protocol: string): void;
    whenReady(): Promise<void>;
  };

  export const ipcMain: {
    handle(
      channel: string,
      handler: (...args: any[]) => unknown | Promise<unknown>,
    ): void;
  };

  export class Notification {
    constructor(options: { body: string; title: string });
    show(): void;
    static isSupported(): boolean;
  }

  export const shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(fullPath: string): Promise<void> | void;
  };

  export const Menu: {
    buildFromTemplate(template: unknown[]): unknown;
    setApplicationMenu(menu: unknown): void;
  };

  export const dialog: {
    showOpenDialog(options: {
      buttonLabel?: string;
      properties?: string[];
      title?: string;
    }): Promise<{
      canceled: boolean;
      filePaths: string[];
    }>;
  };

  export const safeStorage: {
    decryptString(buffer: Buffer): string;
    encryptString(value: string): Buffer;
    isEncryptionAvailable(): boolean;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const ipcRenderer: {
    invoke<T = unknown>(channel: string, ...args: any[]): Promise<T>;
    on(channel: string, listener: (...args: any[]) => void): void;
    off(channel: string, listener: (...args: any[]) => void): void;
  };
}

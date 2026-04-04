// @ts-nocheck
import { mock } from 'bun:test';

export type ElectronMenuItem = {
  accelerator?: string;
  click?: () => void;
  enabled?: boolean;
  label?: string;
  role?: string;
  submenu?: ElectronMenuItem[];
  type?: 'separator';
};

export const electronMockState = {
  app: {
    defaultProtocols: [] as string[],
    quitCalls: 0,
    userDataPath: '',
  },
  dialog: {
    openResult: {
      canceled: false,
      filePaths: [] as string[],
    },
  },
  menu: {
    applicationMenu: null as ElectronMenuItem[] | null,
  },
  safeStorage: {
    decryptString: (buffer: Buffer) => buffer.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => false,
  },
  shell: {
    externalUrls: [] as string[],
    revealedPaths: [] as string[],
  },
  shortcuts: {
    registered: [] as Array<{
      accelerator: string;
      handler: () => void;
    }>,
    unregisterAllCalls: 0,
  },
  tray: {
    clickHandler: null as (() => void) | null,
    contextMenu: null as ElectronMenuItem[] | null,
    destroyed: false,
    iconPath: '',
    tooltip: '',
  },
};

export const resetElectronMockState = (): void => {
  electronMockState.app.defaultProtocols = [];
  electronMockState.app.quitCalls = 0;
  electronMockState.dialog.openResult = {
    canceled: false,
    filePaths: [],
  };
  electronMockState.menu.applicationMenu = null;
  electronMockState.shell.externalUrls = [];
  electronMockState.shell.revealedPaths = [];
  electronMockState.shortcuts.registered = [];
  electronMockState.shortcuts.unregisterAllCalls = 0;
  electronMockState.tray.clickHandler = null;
  electronMockState.tray.contextMenu = null;
  electronMockState.tray.destroyed = false;
  electronMockState.tray.iconPath = '';
  electronMockState.tray.tooltip = '';
};

class FakeTray {
  constructor(iconPath: string) {
    electronMockState.tray.iconPath = iconPath;
  }

  destroy(): void {
    electronMockState.tray.destroyed = true;
  }

  on(event: string, handler: () => void): void {
    if (event === 'click') {
      electronMockState.tray.clickHandler = handler;
    }
  }

  setContextMenu(menu: { template: ElectronMenuItem[] }): void {
    electronMockState.tray.contextMenu = menu.template;
  }

  setToolTip(value: string): void {
    electronMockState.tray.tooltip = value;
  }
}

mock.module('electron', () => ({
  app: {
    getPath: () => electronMockState.app.userDataPath,
    quit: () => {
      electronMockState.app.quitCalls += 1;
    },
    setAsDefaultProtocolClient: (protocol: string) => {
      electronMockState.app.defaultProtocols.push(protocol);
      return true;
    },
  },
  dialog: {
    showOpenDialog: async () => electronMockState.dialog.openResult,
  },
  globalShortcut: {
    register: (accelerator: string, handler: () => void) => {
      electronMockState.shortcuts.registered.push({ accelerator, handler });
      return true;
    },
    unregisterAll: () => {
      electronMockState.shortcuts.registered = [];
      electronMockState.shortcuts.unregisterAllCalls += 1;
    },
  },
  Menu: {
    buildFromTemplate: (template: ElectronMenuItem[]) => ({ template }),
    setApplicationMenu: (menu: { template: ElectronMenuItem[] }) => {
      electronMockState.menu.applicationMenu = menu.template;
    },
  },
  safeStorage: electronMockState.safeStorage,
  shell: {
    openExternal: async (targetUrl: string) => {
      electronMockState.shell.externalUrls.push(targetUrl);
    },
    showItemInFolder: (targetPath: string) => {
      electronMockState.shell.revealedPaths.push(targetPath);
    },
  },
  Tray: FakeTray,
}));

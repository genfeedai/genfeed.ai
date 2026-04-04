import { beforeEach, describe, expect, it } from 'bun:test';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import type { BrowserWindow } from 'electron';
import {
  type ElectronMenuItem,
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

type MockWindow = {
  focus: () => void;
  focusCalls: number;
  isVisible: () => boolean;
  show: () => void;
  showCalls: number;
  visible: boolean;
  webContents: {
    send: (channel: string) => void;
    sentChannels: string[];
  };
};

const { buildDesktopMenu } = await import('./menu.service');
const { DesktopShortcutsService } = await import('./shortcuts.service');
const { DesktopTrayService } = await import('./tray.service');

const createWindow = (visible = true): MockWindow => ({
  focus: () => {
    window.focusCalls += 1;
  },
  focusCalls: 0,
  isVisible: () => window.visible,
  show: () => {
    window.showCalls += 1;
    window.visible = true;
  },
  showCalls: 0,
  visible,
  webContents: {
    send: (channel: string) => {
      window.webContents.sentChannels.push(channel);
    },
    sentChannels: [] as string[],
  },
});

let window: MockWindow;

const findMenuItem = (
  items: ElectronMenuItem[] | null,
  label: string,
): ElectronMenuItem | undefined =>
  items
    ?.flatMap((item) => [item, ...(item.submenu ?? [])])
    .find((item) => item.label === label);

describe('desktop shell integrations', () => {
  beforeEach(() => {
    resetElectronMockState();
    window = createWindow();
  });

  it('builds the desktop application menu and emits sidebar toggles', () => {
    let openWorkspaceCalls = 0;

    buildDesktopMenu(window as unknown as BrowserWindow, () => {
      openWorkspaceCalls += 1;
    });

    const openWorkspaceItem = findMenuItem(
      electronMockState.menu.applicationMenu,
      'Open Workspace',
    );
    const toggleSidebarItem = findMenuItem(
      electronMockState.menu.applicationMenu,
      'Toggle Workspace Sidebar',
    );

    openWorkspaceItem?.click?.();
    toggleSidebarItem?.click?.();

    expect(openWorkspaceCalls).toBe(1);
    expect(window.webContents.sentChannels).toEqual([
      DESKTOP_IPC_CHANNELS.toggleSidebar,
    ]);
  });

  it('wires the tray icon to packaged assets and quick actions', () => {
    let quickGenerateCalls = 0;
    const service = new DesktopTrayService();

    service.initialize(window as unknown as BrowserWindow, () => {
      quickGenerateCalls += 1;
    });

    expect(
      electronMockState.tray.iconPath.endsWith('/assets/tray-icon.png'),
    ).toBe(true);
    expect(electronMockState.tray.tooltip).toBe('Genfeed Desktop');

    const quickGenerateItem = findMenuItem(
      electronMockState.tray.contextMenu,
      'Quick Generate',
    );
    const quitItem = findMenuItem(
      electronMockState.tray.contextMenu,
      'Quit Genfeed',
    );

    quickGenerateItem?.click?.();
    electronMockState.tray.clickHandler?.();
    quitItem?.click?.();
    service.destroy();

    expect(window.showCalls).toBe(2);
    expect(window.focusCalls).toBe(2);
    expect(quickGenerateCalls).toBe(1);
    expect(electronMockState.app.quitCalls).toBe(1);
    expect(electronMockState.tray.destroyed).toBe(true);
  });

  it('registers desktop shortcuts for summon and quick generate', () => {
    let quickGenerateCalls = 0;
    const service = new DesktopShortcutsService();
    window.visible = false;

    service.register(window as unknown as BrowserWindow, () => {
      quickGenerateCalls += 1;
    });

    const summonShortcut = electronMockState.shortcuts.registered.find(
      (shortcut) => shortcut.accelerator === 'CommandOrControl+Shift+G',
    );
    const quickGenerateShortcut = electronMockState.shortcuts.registered.find(
      (shortcut) => shortcut.accelerator === 'CommandOrControl+Shift+N',
    );

    summonShortcut?.handler();
    quickGenerateShortcut?.handler();
    service.unregister();

    expect(window.showCalls).toBe(2);
    expect(window.focusCalls).toBe(2);
    expect(quickGenerateCalls).toBe(1);
    expect(electronMockState.shortcuts.unregisterAllCalls).toBe(1);
  });
});

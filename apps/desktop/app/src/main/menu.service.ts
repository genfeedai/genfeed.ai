import { DESKTOP_IPC_CHANNELS } from '@genfeedai/contracts/desktop';
import {
  type BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

const isMac = process.platform === 'darwin';

export const buildDesktopMenu = (
  window: BrowserWindow,
  onOpenWorkspace: (() => void) | null,
): void => {
  // Null in cloud-only builds, where there is no local workspace to open.
  const openWorkspaceItems: MenuItemConstructorOptions[] = onOpenWorkspace
    ? [
        {
          accelerator: 'CmdOrCtrl+O',
          click: onOpenWorkspace,
          label: 'Open Workspace',
        },
        { type: 'separator' },
      ]
    : [];
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      ...openWorkspaceItems,
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        accelerator: 'CmdOrCtrl+\\',
        click: () => {
          window.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
        },
        label: 'Toggle Workspace Sidebar',
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    fileMenu,
    { role: 'editMenu' },
    viewMenu,
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

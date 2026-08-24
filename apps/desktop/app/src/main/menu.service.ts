import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import {
  type BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

const isMac = process.platform === 'darwin';

export const buildDesktopMenu = (
  window: BrowserWindow,
  onOpenWorkspace: () => void,
): void => {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        accelerator: 'CmdOrCtrl+O',
        click: onOpenWorkspace,
        label: 'Open Workspace',
      },
      { type: 'separator' },
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

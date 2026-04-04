import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import { BrowserWindow, Menu } from 'electron';

export const buildDesktopMenu = (
  window: BrowserWindow,
  onOpenWorkspace: () => void,
): void => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          accelerator: 'CmdOrCtrl+O',
          click: onOpenWorkspace,
          label: 'Open Workspace',
        },
        { role: 'close' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          accelerator: 'CmdOrCtrl+\\',
          click: () => {
            window.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
          },
          label: 'Toggle Workspace Sidebar',
        },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }],
    },
  ]);

  Menu.setApplicationMenu(menu);
};

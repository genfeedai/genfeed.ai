import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { app, Menu, Tray } from 'electron';

export class DesktopTrayService {
  private tray: Tray | null = null;

  initialize(mainWindow: BrowserWindow, onQuickGenerate: () => void): void {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    this.tray = new Tray(iconPath);
    this.tray.setToolTip('Genfeed Desktop');

    const contextMenu = Menu.buildFromTemplate([
      {
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
        label: 'Open Genfeed',
      },
      {
        click: () => {
          mainWindow.show();
          mainWindow.focus();
          onQuickGenerate();
        },
        label: 'Quick Generate',
      },
      { type: 'separator' },
      {
        enabled: false,
        label: 'Sync Status: Idle',
      },
      { type: 'separator' },
      {
        click: () => {
          app.quit();
        },
        label: 'Quit Genfeed',
        role: 'quit',
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    this.tray.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}

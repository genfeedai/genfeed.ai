import type { BrowserWindow } from 'electron';
import { globalShortcut } from 'electron';

export class DesktopShortcutsService {
  register(mainWindow: BrowserWindow, onQuickGenerate: () => void): void {
    // Cmd+Shift+G — summon/focus window
    globalShortcut.register('CommandOrControl+Shift+G', () => {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    // Cmd+Shift+N — new conversation (quick generate)
    globalShortcut.register('CommandOrControl+Shift+N', () => {
      mainWindow.show();
      mainWindow.focus();
      onQuickGenerate();
    });
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}

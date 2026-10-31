import type { AppUpdater } from 'electron-updater';

export interface IDesktopUpdaterDeps {
  autoUpdater: Pick<
    AppUpdater,
    | 'autoDownload'
    | 'autoInstallOnAppQuit'
    | 'checkForUpdates'
    | 'logger'
    | 'on'
  >;
  isPackaged: boolean;
  notify: (notification: { body: string; title: string }) => void;
  onError: (error: unknown, context?: Record<string, unknown>) => void;
}

export class DesktopUpdaterService {
  private isInitialized = false;

  constructor(private readonly deps: IDesktopUpdaterDeps) {}

  initialize(): void {
    if (this.isInitialized) {
      return;
    }
    // Auto-update only runs in a packaged build; dev and smoke runs have no update feed.
    if (!this.deps.isPackaged) {
      return;
    }
    this.isInitialized = true;

    const { autoUpdater } = this.deps;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // electron-updater logs to console by default; route the signal we care about through telemetry instead.
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info) => {
      this.deps.notify({
        body: `GenFeed ${info.version} is downloading in the background.`,
        title: 'Update available',
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.deps.notify({
        body: `GenFeed ${info.version} will install the next time you quit.`,
        title: 'Update ready',
      });
    });
    autoUpdater.on('error', (error: Error) => {
      this.deps.onError(error, { source: 'auto-updater' });
    });

    void this.checkForUpdates();
  }

  async checkForUpdates(): Promise<void> {
    try {
      await this.deps.autoUpdater.checkForUpdates();
    } catch (error) {
      this.deps.onError(error, { source: 'auto-updater.check' });
    }
  }
}

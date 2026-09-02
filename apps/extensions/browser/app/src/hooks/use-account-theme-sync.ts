import type { ThemePreference } from '@genfeedai/contracts/constants';
import { useEffect, useRef } from 'react';
import { themeSettingsService } from '~services/theme-settings.service';
import { useSettingsStore } from '~store/use-settings-store';
import { logger } from '~utils/logger.util';

interface ThemeSyncSnapshot {
  revision: number;
  theme: ThemePreference;
}

type PendingThemeUpdate = ThemeSyncSnapshot;

class AccountThemeSyncController {
  private baselineRevision = 0;
  private lastQueuedRevision = 0;
  private pendingUpdate: PendingThemeUpdate | null = null;
  private patchInFlight = false;
  private ready = false;
  private session = 0;

  start(): () => void {
    const session = ++this.session;
    const startingSnapshot = this.getSnapshot();
    this.baselineRevision = startingSnapshot.revision;
    this.lastQueuedRevision = startingSnapshot.revision;
    this.pendingUpdate = null;
    this.ready = false;

    void this.hydrate(session, startingSnapshot);

    return () => {
      if (this.session === session) {
        this.stop();
      }
    };
  }

  stop(): void {
    this.session += 1;
    this.pendingUpdate = null;
    this.ready = false;
  }

  themeChanged(): void {
    if (!this.ready) {
      return;
    }

    this.queueLatestTheme(this.getSnapshot());
  }

  private getSnapshot(): ThemeSyncSnapshot {
    const { theme, themeRevision } = useSettingsStore.getState();
    return { revision: themeRevision, theme };
  }

  private async hydrate(
    session: number,
    startingSnapshot: ThemeSyncSnapshot,
  ): Promise<void> {
    try {
      const accountTheme = await themeSettingsService.getTheme();
      if (session !== this.session) {
        return;
      }

      const currentSnapshot = this.getSnapshot();
      this.ready = true;

      if (currentSnapshot.revision === startingSnapshot.revision) {
        useSettingsStore.getState().applyAccountTheme(accountTheme);
        return;
      }

      this.queueLatestTheme(currentSnapshot);
    } catch (error) {
      if (session === this.session) {
        this.ready = true;
        this.queueLatestTheme(this.getSnapshot());
        logger.error('Failed to synchronize account theme', error);
      }
    }
  }

  private queueLatestTheme(snapshot: ThemeSyncSnapshot): void {
    if (
      snapshot.revision <= this.baselineRevision ||
      snapshot.revision <= this.lastQueuedRevision
    ) {
      return;
    }

    this.lastQueuedRevision = snapshot.revision;
    this.pendingUpdate = snapshot;
    void this.flushThemeUpdates();
  }

  private async flushThemeUpdates(): Promise<void> {
    if (this.patchInFlight) {
      return;
    }

    this.patchInFlight = true;
    const session = this.session;

    try {
      while (session === this.session && this.pendingUpdate) {
        const update = this.pendingUpdate;
        this.pendingUpdate = null;

        try {
          await themeSettingsService.updateTheme(update.theme);
        } catch (error) {
          if (session === this.session) {
            logger.error('Failed to update account theme', error);
          }
        }
      }
    } finally {
      this.patchInFlight = false;
      if (this.ready && this.pendingUpdate) {
        void this.flushThemeUpdates();
      }
    }
  }
}

export function useAccountThemeSync(isAuthenticated: boolean): void {
  const isLoaded = useSettingsStore((state) => state.isLoaded);
  const controllerRef = useRef<AccountThemeSyncController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new AccountThemeSyncController();
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }

    if (!isAuthenticated || !isLoaded) {
      controller.stop();
      return;
    }

    return controller.start();
  }, [isAuthenticated, isLoaded]);

  useEffect(
    () =>
      useSettingsStore.subscribe((state, previousState) => {
        if (
          state.theme !== previousState.theme ||
          state.themeRevision !== previousState.themeRevision
        ) {
          controllerRef.current?.themeChanged();
        }
      }),
    [],
  );
}

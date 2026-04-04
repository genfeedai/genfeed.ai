import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';

/**
 * Status bar item that shows "GenFeed: N drafts" and polls the API every
 * `genfeed.draftsPollIntervalMs` milliseconds (default 5 min).
 *
 * Clicking the item opens the GenFeed panel.
 */
export class GenFeedStatusBar {
  private readonly item: vscode.StatusBarItem;
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = 'genfeed.openPanel';
    this.item.tooltip = 'Open GenFeed panel';
    this.item.text = '$(genfeed-icon) GenFeed';
    this.item.show();

    context.subscriptions.push(this.item);
  }

  /** Start polling. Call once after the extension activates. */
  start(): void {
    const config = vscode.workspace.getConfiguration('genfeed');
    const intervalMs = config.get<number>('draftsPollIntervalMs', 300_000);

    void this.refresh();
    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, intervalMs);

    this.context.subscriptions.push({
      dispose: () => {
        if (this.pollTimer !== undefined) {
          clearInterval(this.pollTimer);
        }
      },
    });
  }

  /** Force an immediate refresh (e.g. after saving a draft). */
  async refresh(): Promise<void> {
    if (!AuthService.getInstance().isAuthenticated()) {
      this.item.text = '$(genfeed-icon) GenFeed';
      return;
    }

    try {
      const runs = await ApiService.getInstance().listRuns({
        limit: 50,
        status: 'pending',
      });

      const pending = runs.length;
      this.item.text =
        pending > 0
          ? `$(genfeed-icon) GenFeed: ${pending} draft${pending === 1 ? '' : 's'}`
          : '$(genfeed-icon) GenFeed';
    } catch {
      // Silently swallow — network blip shouldn't thrash the status bar.
      this.item.text = '$(genfeed-icon) GenFeed';
    }
  }
}

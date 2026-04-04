import { AuthService } from '@services/auth.service';
import {
  flushErrorTracking,
  initializeErrorTracking,
} from '@services/error-tracking.service';
import { AnalyticsViewProvider } from '@views/analytics-view.provider';
import { GalleryViewProvider } from '@views/gallery-view.provider';
import { PresetsViewProvider } from '@views/presets-view.provider';
import { RunQueueViewProvider } from '@views/run-queue-view.provider';
import { TemplatesViewProvider } from '@views/templates-view.provider';
import * as vscode from 'vscode';
import { registerCommands } from '@/commands';
import { registerCommitToPostWatcher } from '@/commands/commit-to-post';
import { GenFeedStatusBar } from '@/statusBar';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Initialize error tracking
  initializeErrorTracking('extension');

  // Initialize services
  const authService = AuthService.initialize(context);
  await authService.loadStoredAuth();

  // Create and register the sidebar webview providers
  const presetsProvider = new PresetsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PresetsViewProvider.viewType,
      presetsProvider,
    ),
  );

  const galleryProvider = new GalleryViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GalleryViewProvider.viewType,
      galleryProvider,
    ),
  );

  const runQueueProvider = new RunQueueViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RunQueueViewProvider.viewType,
      runQueueProvider,
    ),
  );

  const templatesProvider = new TemplatesViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TemplatesViewProvider.viewType,
      templatesProvider,
    ),
  );

  const analyticsProvider = new AnalyticsViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AnalyticsViewProvider.viewType,
      analyticsProvider,
    ),
  );

  // Status bar (shows pending drafts count, polls every 5 min)
  const statusBar = new GenFeedStatusBar(context);
  statusBar.start();

  // Register all commands
  registerCommands(context, {
    analyticsProvider,
    galleryProvider,
    presetsProvider,
    runQueueProvider,
    statusBar,
    templatesProvider,
  });

  // Watch for git commits and prompt user to turn them into posts
  registerCommitToPostWatcher(context);

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('genfeed.welcomeShown');
  if (!hasShownWelcome) {
    const action = await vscode.window.showInformationMessage(
      'Welcome to Genfeed.ai Content Engine for VS Code/Cursor.',
      'Sign In',
      'Learn More',
    );

    if (action === 'Sign In') {
      vscode.commands.executeCommand('genfeed.authenticate');
    } else if (action === 'Learn More') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://genfeed.ai/docs/vscode-extension'),
      );
    }

    await context.globalState.update('genfeed.welcomeShown', true);
  }

  // Log activation
  const outputChannel = vscode.window.createOutputChannel(
    'Genfeed.ai Extension',
  );
  outputChannel.appendLine('Genfeed.ai extension activated');

  if (authService.isAuthenticated()) {
    const state = authService.getAuthState();
    outputChannel.appendLine(`Authenticated via ${state.method}`);
  }
}

export async function deactivate(): Promise<void> {
  await flushErrorTracking();
}

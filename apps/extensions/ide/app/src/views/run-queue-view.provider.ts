import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';
import type { RunRecord } from '@/types';

export class RunQueueViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.runQueueView';
  private view?: vscode.WebviewView;
  private runs: RunRecord[] = [];

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'authenticate':
          await vscode.commands.executeCommand('genfeed.authenticate');
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('genfeed.setApiKey');
          break;
        case 'refresh':
          await this.refreshRuns();
          break;
        case 'runStatus':
          await vscode.commands.executeCommand(
            'genfeed.runStatus',
            message.runId as string,
          );
          break;
        case 'runAction':
          await this.executeAction(message.action as string);
          break;
        case 'copyRunId':
          await vscode.env.clipboard.writeText(message.runId as string);
          break;
        case 'exportArtifacts':
          await vscode.commands.executeCommand(
            'genfeed.exportRunArtifacts',
            message.runId as string,
          );
          break;
      }
    });

    this.refreshRuns();
  }

  async refreshRuns(): Promise<void> {
    const authService = AuthService.getInstance();
    if (!authService.isAuthenticated()) {
      this.updateView({
        authenticated: false,
        loading: false,
        runs: [],
      });
      return;
    }

    this.updateView({
      authenticated: true,
      loading: true,
      runs: this.runs,
    });

    try {
      this.runs = await ApiService.getInstance().listRuns({ limit: 30 });
      this.updateView({
        authenticated: true,
        loading: false,
        runs: this.runs,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.updateView({
        authenticated: true,
        error: errorMessage,
        loading: false,
        runs: [],
      });
    }
  }

  private async executeAction(action: string): Promise<void> {
    const actionToCommand: Record<string, string> = {
      analytics: 'genfeed.showAnalytics',
      composite: 'genfeed.runFullLoop',
      generate: 'genfeed.generateContent',
      post: 'genfeed.postContent',
    };

    const command = actionToCommand[action];
    if (!command) {
      return;
    }

    await vscode.commands.executeCommand(command);
  }

  private updateView(data: {
    authenticated: boolean;
    runs: RunRecord[];
    loading: boolean;
    error?: string;
  }): void {
    this.view?.webview.postMessage({
      ...data,
      type: 'update',
    });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styles = getWebviewStyles();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Run Queue</title>
  <style>
    ${styles}

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }

    .run-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .run-meta {
      font-size: 11px;
      opacity: 0.8;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .status {
      text-transform: uppercase;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 600;
      background: var(--muted);
    }

    .status.completed {
      background: rgba(34, 197, 94, 0.2);
    }

    .status.failed,
    .status.cancelled {
      background: rgba(239, 68, 68, 0.25);
    }

    .status.running {
      background: rgba(59, 130, 246, 0.25);
    }

    .row {
      display: flex;
      gap: 6px;
    }

    .row .btn {
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="auth-view" class="auth-container" style="display: none;">
      <h3>Run Queue</h3>
      <p>Sign in to view and control your run queue.</p>
      <button class="btn btn-primary btn-block" onclick="authenticate()">Sign In</button>
      <button class="btn btn-secondary btn-block" onclick="setApiKey()">Use API Key</button>
    </div>

    <div id="loading-view" style="display: none;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="spinner spinner-sm"></span>
        <span>Loading runs...</span>
      </div>
    </div>

    <div id="main-view" style="display: none;">
      <div class="header">
        <span class="section-title">Run Queue</span>
        <button class="btn btn-secondary btn-sm" onclick="refresh()">Refresh</button>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" onclick="runAction('generate')">Generate</button>
        <button class="btn btn-secondary btn-sm" onclick="runAction('post')">Post</button>
        <button class="btn btn-secondary btn-sm" onclick="runAction('analytics')">Analytics</button>
        <button class="btn btn-primary btn-sm" onclick="runAction('composite')">Full Loop</button>
      </div>
      <div id="run-list" class="run-list"></div>
      <div id="empty" class="empty-state" style="display:none;">
        No runs yet. Start with Generate or Full Loop.
      </div>
    </div>

    <div id="error-view" style="display: none;" class="empty-state">
      <p id="error-message"></p>
      <button class="btn btn-secondary btn-sm" onclick="refresh()">Retry</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let runs = [];

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'update') {
        updateUI(message);
      }
    });

    function updateUI(data) {
      const authView = document.getElementById('auth-view');
      const loadingView = document.getElementById('loading-view');
      const mainView = document.getElementById('main-view');
      const errorView = document.getElementById('error-view');
      const errorMessage = document.getElementById('error-message');

      authView.style.display = 'none';
      loadingView.style.display = 'none';
      mainView.style.display = 'none';
      errorView.style.display = 'none';

      if (!data.authenticated) {
        authView.style.display = 'block';
        return;
      }

      if (data.loading) {
        loadingView.style.display = 'block';
        return;
      }

      if (data.error) {
        errorMessage.textContent = data.error;
        errorView.style.display = 'block';
        return;
      }

      mainView.style.display = 'block';
      runs = data.runs || [];
      renderRuns();
    }

    function renderRuns() {
      const runList = document.getElementById('run-list');
      const empty = document.getElementById('empty');

      if (!runs.length) {
        runList.innerHTML = '';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      runList.innerHTML = runs.map((run) => {
        const runId = run._id || run.id || 'unknown';
        return \`
          <div class="card">
            <div class="run-meta">
              <span>\${escapeHtml(run.actionType)} · \${escapeHtml(runId)}</span>
              <span class="status \${escapeHtml(run.status)}">\${escapeHtml(run.status)}</span>
            </div>
            <div class="run-meta">
              <span>Progress: \${run.progress || 0}%</span>
              <span>\${formatDate(run.updatedAt || run.createdAt)}</span>
            </div>
            <div class="row">
              <button class="btn btn-secondary btn-sm" onclick="status('\${escapeAttr(runId)}')">Status</button>
              <button class="btn btn-secondary btn-sm" onclick="copyRunId('\${escapeAttr(runId)}')">Copy ID</button>
              <button class="btn btn-secondary btn-sm" onclick="exportArtifacts('\${escapeAttr(runId)}')">Artifacts</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function formatDate(value) {
      if (!value) return 'now';
      try {
        return new Date(value).toLocaleString();
      } catch {
        return value;
      }
    }

    function status(runId) {
      vscode.postMessage({ command: 'runStatus', runId });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function runAction(action) {
      vscode.postMessage({ command: 'runAction', action });
    }

    function copyRunId(runId) {
      vscode.postMessage({ command: 'copyRunId', runId });
    }

    function exportArtifacts(runId) {
      vscode.postMessage({ command: 'exportArtifacts', runId });
    }

    function authenticate() {
      vscode.postMessage({ command: 'authenticate' });
    }

    function setApiKey() {
      vscode.postMessage({ command: 'setApiKey' });
    }

    function escapeHtml(value) {
      if (!value) return '';
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    refresh();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

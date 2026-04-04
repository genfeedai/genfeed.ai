import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';
import type { RunRecord } from '@/types';

export class AnalyticsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.analyticsView';
  private runs: RunRecord[] = [];
  private view?: vscode.WebviewView;

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
          await this.refreshAnalytics();
          break;
        case 'runAnalytics':
          await vscode.commands.executeCommand('genfeed.showAnalytics');
          break;
        case 'openStatus':
          await vscode.commands.executeCommand(
            'genfeed.runStatus',
            message.runId as string,
          );
          break;
      }
    });

    this.refreshAnalytics();
  }

  async refreshAnalytics(): Promise<void> {
    const authService = AuthService.getInstance();
    if (!authService.isAuthenticated()) {
      this.updateView({
        authenticated: false,
        loading: false,
        runs: [],
        summary: summarizeRuns([]),
      });
      return;
    }

    this.updateView({
      authenticated: true,
      loading: true,
      runs: this.runs,
      summary: summarizeRuns(this.runs),
    });

    try {
      this.runs = await ApiService.getInstance().listRuns({
        actionType: 'analytics',
        limit: 25,
      });
      this.updateView({
        authenticated: true,
        loading: false,
        runs: this.runs,
        summary: summarizeRuns(this.runs),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.updateView({
        authenticated: true,
        error: errorMessage,
        loading: false,
        runs: [],
        summary: summarizeRuns([]),
      });
    }
  }

  private updateView(data: {
    authenticated: boolean;
    runs: RunRecord[];
    loading: boolean;
    summary: {
      completed: number;
      failed: number;
      total: number;
    };
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
  <title>Analytics</title>
  <style>
    ${styles}

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }

    .summary-card {
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
      text-align: center;
    }

    .summary-value {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 2px;
    }

    .summary-label {
      font-size: 10px;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .run-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .run-query {
      font-size: 12px;
      opacity: 0.85;
      margin-bottom: 6px;
      max-height: 54px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="auth-view" class="auth-container" style="display:none;">
      <h3>Analytics</h3>
      <p>Sign in to inspect campaign analytics runs.</p>
      <button class="btn btn-primary btn-block" onclick="authenticate()">Sign In</button>
      <button class="btn btn-secondary btn-block" onclick="setApiKey()">Use API Key</button>
    </div>

    <div id="loading-view" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="spinner spinner-sm"></span>
        <span>Loading analytics...</span>
      </div>
    </div>

    <div id="main-view" style="display:none;">
      <div class="toolbar">
        <span class="section-title">Analytics</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="refresh()">Refresh</button>
          <button class="btn btn-primary btn-sm" onclick="runAnalytics()">Run</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div id="summary-total" class="summary-value">0</div>
          <div class="summary-label">Total</div>
        </div>
        <div class="summary-card">
          <div id="summary-completed" class="summary-value">0</div>
          <div class="summary-label">Completed</div>
        </div>
        <div class="summary-card">
          <div id="summary-failed" class="summary-value">0</div>
          <div class="summary-label">Failed</div>
        </div>
      </div>

      <div id="run-list" class="run-list"></div>
      <div id="empty" class="empty-state" style="display:none;">
        No analytics runs yet.
      </div>
    </div>

    <div id="error-view" class="empty-state" style="display:none;">
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

      runs = data.runs || [];
      updateSummary(data.summary || { total: 0, completed: 0, failed: 0 });
      mainView.style.display = 'block';
      renderRuns();
    }

    function updateSummary(summary) {
      document.getElementById('summary-total').textContent = String(summary.total || 0);
      document.getElementById('summary-completed').textContent = String(summary.completed || 0);
      document.getElementById('summary-failed').textContent = String(summary.failed || 0);
    }

    function renderRuns() {
      const list = document.getElementById('run-list');
      const empty = document.getElementById('empty');

      if (!runs.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      list.innerHTML = runs.map((run) => {
        const runId = run._id || run.id || 'unknown';
        const query = run.input && run.input.query ? String(run.input.query) : 'No query payload';
        return \`
          <div class="card">
            <div class="card-header">
              <span class="card-title">\${escapeHtml(runId)}</span>
              <span class="badge">\${escapeHtml(run.status)}</span>
            </div>
            <div class="run-query">\${escapeHtml(query)}</div>
            <div class="run-query">Progress: \${run.progress || 0}% · \${formatDate(run.updatedAt || run.createdAt)}</div>
            <div class="card-footer">
              <button class="btn btn-secondary btn-sm" onclick="openStatus('\${escapeAttr(runId)}')">Status</button>
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

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function runAnalytics() {
      vscode.postMessage({ command: 'runAnalytics' });
    }

    function openStatus(runId) {
      vscode.postMessage({ command: 'openStatus', runId });
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

function summarizeRuns(runs: RunRecord[]): {
  completed: number;
  failed: number;
  total: number;
} {
  return runs.reduce(
    (acc, run) => {
      acc.total += 1;
      if (run.status === 'completed') {
        acc.completed += 1;
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        acc.failed += 1;
      }
      return acc;
    },
    {
      completed: 0,
      failed: 0,
      total: 0,
    },
  );
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

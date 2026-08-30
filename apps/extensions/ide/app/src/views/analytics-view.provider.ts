import { AgentToolName } from '@genfeedai/interfaces';
import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import { getWebviewNonce } from '@views/webview.util';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';

export class AnalyticsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.analyticsView';
  private view?: vscode.WebviewView;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
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
      }
    });

    void this.refreshAnalytics();
  }

  async refreshAnalytics(): Promise<void> {
    if (!AuthService.getInstance().isAuthenticated()) {
      this.updateView({ authenticated: false, loading: false });
      return;
    }

    this.updateView({ authenticated: true, loading: true });

    try {
      const result = await ApiService.getInstance().executeAgentTool(
        AgentToolName.GET_ANALYTICS,
        {},
      );
      if (!result.success) {
        throw new Error(result.error || 'Analytics workflow failed.');
      }
      this.updateView({
        authenticated: true,
        data: result.data ?? {},
        loading: false,
      });
    } catch (error) {
      this.updateView({
        authenticated: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      });
    }
  }

  private updateView(data: {
    authenticated: boolean;
    loading: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }): void {
    this.view?.webview.postMessage({ ...data, type: 'update' });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getWebviewNonce();
    const styles = getWebviewStyles();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Analytics</title>
  <style>${styles} pre { white-space: pre-wrap; overflow-wrap: anywhere; }</style>
</head>
<body>
  <div class="container">
    <div id="auth" class="auth-container" style="display:none;">
      <h3>Analytics</h3>
      <p>Sign in to query analytics through the Genfeed workflow engine.</p>
      <button class="btn btn-primary btn-block" data-action="authenticate">Sign In</button>
      <button class="btn btn-secondary btn-block" data-action="setApiKey">Use API Key</button>
    </div>
    <div id="loading" style="display:none;"><span class="spinner spinner-sm"></span> Loading analytics…</div>
    <div id="main" style="display:none;">
      <button class="btn btn-secondary btn-sm" data-action="refresh">Refresh</button>
      <pre id="analytics-data" class="card"></pre>
    </div>
    <div id="error" class="empty-state" style="display:none;">
      <p id="error-message"></p>
      <button class="btn btn-secondary btn-sm" data-action="refresh">Retry</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (data.type !== 'update') return;
      for (const id of ['auth', 'loading', 'main', 'error']) {
        document.getElementById(id).style.display = 'none';
      }
      if (!data.authenticated) {
        document.getElementById('auth').style.display = 'block';
      } else if (data.loading) {
        document.getElementById('loading').style.display = 'block';
      } else if (data.error) {
        document.getElementById('error-message').textContent = data.error;
        document.getElementById('error').style.display = 'block';
      } else {
        document.getElementById('analytics-data').textContent = JSON.stringify(data.data || {}, null, 2);
        document.getElementById('main').style.display = 'block';
      }
    });
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (target) vscode.postMessage({ command: target.dataset.action });
    });
    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}

import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';
import type { PromptTemplate } from '@/types';

export class TemplatesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.templatesView';
  private templates: PromptTemplate[] = [];
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
          await this.refreshTemplates();
          break;
        case 'useTemplate':
          await vscode.commands.executeCommand(
            'genfeed.generateContentFromTemplate',
            message.template as PromptTemplate,
          );
          break;
        case 'createCampaign':
          await vscode.commands.executeCommand('genfeed.createCampaign');
          break;
      }
    });

    this.refreshTemplates();
  }

  async refreshTemplates(): Promise<void> {
    const authService = AuthService.getInstance();
    if (!authService.isAuthenticated()) {
      this.updateView({ authenticated: false, loading: false, templates: [] });
      return;
    }

    this.updateView({
      authenticated: true,
      loading: true,
      templates: this.templates,
    });

    try {
      this.templates = await ApiService.getInstance().getContentTemplates();
      this.updateView({
        authenticated: true,
        loading: false,
        templates: this.templates,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.updateView({
        authenticated: true,
        error: errorMessage,
        loading: false,
        templates: [],
      });
    }
  }

  private updateView(data: {
    authenticated: boolean;
    templates: PromptTemplate[];
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
  <title>Templates</title>
  <style>
    ${styles}

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }

    .template-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .template-body {
      font-size: 12px;
      opacity: 0.85;
      margin-bottom: 8px;
      max-height: 72px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="auth-view" class="auth-container" style="display: none;">
      <h3>Templates</h3>
      <p>Sign in to use shared prompt templates.</p>
      <button class="btn btn-primary btn-block" onclick="authenticate()">Sign In</button>
      <button class="btn btn-secondary btn-block" onclick="setApiKey()">Use API Key</button>
    </div>

    <div id="loading-view" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="spinner spinner-sm"></span>
        <span>Loading templates...</span>
      </div>
    </div>

    <div id="main-view" style="display:none;">
      <div class="toolbar">
        <span class="section-title">Templates</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="refresh()">Refresh</button>
          <button class="btn btn-primary btn-sm" onclick="createCampaign()">Campaign</button>
        </div>
      </div>
      <div id="template-list" class="template-list"></div>
      <div id="empty-state" class="empty-state" style="display:none;">
        No templates found.
      </div>
    </div>

    <div id="error-view" class="empty-state" style="display:none;">
      <p id="error-message"></p>
      <button class="btn btn-secondary btn-sm" onclick="refresh()">Retry</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let templates = [];

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

      templates = data.templates || [];
      mainView.style.display = 'block';
      renderTemplates();
    }

    function renderTemplates() {
      const list = document.getElementById('template-list');
      const empty = document.getElementById('empty-state');

      if (!templates.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      list.innerHTML = templates.map((template) => \`
        <div class="card">
          <div class="card-header">
            <span class="card-title">\${escapeHtml(template.name)}</span>
            <span class="badge">\${escapeHtml(template.channel || template.category || 'general')}</span>
          </div>
          <div class="template-body">\${escapeHtml(template.template)}</div>
          <div class="card-footer">
            <button class="btn btn-primary btn-sm" onclick="useTemplate('\${escapeAttr(template.key)}')">Use</button>
          </div>
        </div>
      \`).join('');
    }

    function useTemplate(key) {
      const template = templates.find((item) => item.key === key);
      if (!template) return;
      vscode.postMessage({ command: 'useTemplate', template });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function createCampaign() {
      vscode.postMessage({ command: 'createCampaign' });
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

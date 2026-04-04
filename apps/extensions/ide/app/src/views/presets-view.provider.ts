import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';
import type { ImagePreset } from '@/types';

export class PresetsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.presetsView';
  private view?: vscode.WebviewView;
  private presets: ImagePreset[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'generate':
          await this.handleGenerate(message.preset);
          break;
        case 'createPreset':
          await this.handleCreatePreset(message.data);
          break;
        case 'deletePreset':
          await this.handleDeletePreset(message.id);
          break;
        case 'refresh':
          await this.refreshPresets();
          break;
        case 'authenticate':
          await vscode.commands.executeCommand('genfeed.authenticate');
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('genfeed.setApiKey');
          break;
      }
    });

    this.refreshPresets();
  }

  async refreshPresets(): Promise<void> {
    const authService = AuthService.getInstance();
    if (!authService.isAuthenticated()) {
      this.updateView({ authenticated: false, presets: [] });
      return;
    }

    try {
      const apiService = ApiService.getInstance();
      this.presets = await apiService.getPresets();
      this.updateView({ authenticated: true, presets: this.presets });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to load presets: ${errorMessage}`);
      this.updateView({
        authenticated: true,
        error: errorMessage,
        presets: [],
      });
    }
  }

  private updateView(data: {
    authenticated: boolean;
    presets: ImagePreset[];
    error?: string;
  }): void {
    if (this.view) {
      this.view.webview.postMessage({ type: 'update', ...data });
    }
  }

  private async handleGenerate(preset: ImagePreset): Promise<void> {
    try {
      const apiService = ApiService.getInstance();

      await vscode.window.withProgress(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: `Generating image with preset "${preset.name}"...`,
        },
        async () => {
          const result = await apiService.generateImage({
            camera: preset.camera,
            format: preset.format,
            lighting: preset.lighting,
            model: preset.model,
            mood: preset.mood,
            scene: preset.scene,
            style: preset.style,
            text: preset.prompt,
            waitForCompletion: true,
          });

          vscode.window
            .showInformationMessage(
              'Image generated successfully!',
              'Open in Browser',
            )
            .then((selection) => {
              if (selection === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(result.url));
              }
            });
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(
        `Failed to generate image: ${errorMessage}`,
      );
    }
  }

  private async handleCreatePreset(
    data: Omit<ImagePreset, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    try {
      const apiService = ApiService.getInstance();
      const newPreset = await apiService.createPreset(data);
      this.presets.push(newPreset);
      this.updateView({ authenticated: true, presets: this.presets });
      vscode.window.showInformationMessage(
        `Preset "${newPreset.name}" created successfully!`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(
        `Failed to create preset: ${errorMessage}`,
      );
    }
  }

  private async handleDeletePreset(id: string): Promise<void> {
    try {
      const apiService = ApiService.getInstance();
      await apiService.deletePreset(id);
      this.presets = this.presets.filter((p) => p.id !== id);
      this.updateView({ authenticated: true, presets: this.presets });
      vscode.window.showInformationMessage('Preset deleted successfully!');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(
        `Failed to delete preset: ${errorMessage}`,
      );
    }
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
  <title>Genfeed Presets</title>
  <style>
    ${styles}

    /* Presets-specific styles */
    .preset-format {
      font-size: 10px;
      padding: 2px 6px;
      background: var(--badge);
      color: var(--badge-foreground);
      border-radius: 10px;
    }

    .preset-prompt {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .preset-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .input-group input,
    .input-group textarea,
    .input-group select {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--input);
      background: var(--input-background);
      color: var(--input-foreground);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: 13px;
    }

    .input-group textarea {
      min-height: 80px;
      resize: vertical;
    }

    .create-form {
      display: none;
    }

    .create-form.active {
      display: block;
    }

    .card {
      margin-bottom: 8px;
    }

    .btn-block {
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="auth-view" class="auth-container" style="display: none;">
      <h3>Welcome to Genfeed.ai</h3>
      <p>Sign in to access your image presets and generate AI images.</p>
      <button class="btn btn-primary btn-block" onclick="authenticate()">
        Sign In with Genfeed
      </button>
      <button class="btn btn-secondary btn-block" onclick="setApiKey()">
        Use API Key
      </button>
    </div>

    <div id="main-view" style="display: none;">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Quick Generate</span>
        </div>
        <div class="input-group">
          <label for="quick-prompt">Prompt</label>
          <textarea id="quick-prompt" placeholder="Describe the image you want to generate..."></textarea>
        </div>
        <button class="btn btn-primary btn-block" onclick="quickGenerate()">
          Generate Image
        </button>
      </div>

      <div class="separator"></div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">Presets</span>
          <button class="btn btn-secondary btn-small" onclick="toggleCreateForm()">+ New</button>
        </div>

        <div id="create-form" class="create-form">
          <div class="card">
            <div class="input-group">
              <label for="preset-name">Name</label>
              <input type="text" id="preset-name" placeholder="My Preset">
            </div>
            <div class="input-group">
              <label for="preset-description">Description</label>
              <input type="text" id="preset-description" placeholder="Optional description">
            </div>
            <div class="input-group">
              <label for="preset-prompt">Prompt</label>
              <textarea id="preset-prompt" placeholder="The prompt template for this preset..."></textarea>
            </div>
            <div class="input-group">
              <label for="preset-format">Format</label>
              <select id="preset-format">
                <option value="landscape">Landscape (1920x1080)</option>
                <option value="portrait">Portrait (1080x1920)</option>
                <option value="square">Square (1024x1024)</option>
              </select>
            </div>
            <div class="input-group">
              <label for="preset-style">Style (optional)</label>
              <input type="text" id="preset-style" placeholder="e.g., cinematic, minimalist">
            </div>
            <div class="card-footer">
              <button class="btn btn-primary" onclick="createPreset()">Create</button>
              <button class="btn btn-secondary" onclick="toggleCreateForm()">Cancel</button>
            </div>
          </div>
        </div>

        <div id="presets-list"></div>

        <div id="empty-state" class="empty-state" style="display: none;">
          <p>No presets yet. Create your first preset to get started!</p>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let presets = [];

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        updateUI(message);
      }
    });

    function updateUI(data) {
      const authView = document.getElementById('auth-view');
      const mainView = document.getElementById('main-view');

      if (!data.authenticated) {
        authView.style.display = 'block';
        mainView.style.display = 'none';
        return;
      }

      authView.style.display = 'none';
      mainView.style.display = 'block';

      presets = data.presets || [];
      renderPresets();
    }

    function renderPresets() {
      const container = document.getElementById('presets-list');
      const emptyState = document.getElementById('empty-state');

      if (presets.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      container.innerHTML = presets.map(preset => \`
        <div class="card">
          <div class="card-header">
            <span class="card-title">\${escapeHtml(preset.name)}</span>
            <span class="preset-format">\${preset.format}</span>
          </div>
          <div class="preset-prompt">\${escapeHtml(preset.prompt)}</div>
          \${preset.tags && preset.tags.length ? \`
            <div class="preset-tags">
              \${preset.tags.map(tag => \`<span class="badge badge-outline">\${escapeHtml(tag)}</span>\`).join('')}
            </div>
          \` : ''}
          <div class="card-footer">
            <button class="btn btn-primary btn-sm" onclick="generateFromPreset('\${preset.id}')">
              Generate
            </button>
            <button class="btn btn-destructive btn-sm" onclick="deletePreset('\${preset.id}')">
              Delete
            </button>
          </div>
        </div>
      \`).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function authenticate() {
      vscode.postMessage({ command: 'authenticate' });
    }

    function setApiKey() {
      vscode.postMessage({ command: 'setApiKey' });
    }

    function quickGenerate() {
      const prompt = document.getElementById('quick-prompt').value.trim();
      if (!prompt) return;

      vscode.postMessage({
        command: 'generate',
        preset: {
          name: 'Quick Generate',
          prompt: prompt,
          format: 'landscape',
          tags: []
        }
      });
    }

    function generateFromPreset(id) {
      const preset = presets.find(p => p.id === id);
      if (preset) {
        vscode.postMessage({ command: 'generate', preset });
      }
    }

    function toggleCreateForm() {
      const form = document.getElementById('create-form');
      form.classList.toggle('active');
    }

    function createPreset() {
      const name = document.getElementById('preset-name').value.trim();
      const description = document.getElementById('preset-description').value.trim();
      const prompt = document.getElementById('preset-prompt').value.trim();
      const format = document.getElementById('preset-format').value;
      const style = document.getElementById('preset-style').value.trim();

      if (!name || !prompt) {
        return;
      }

      vscode.postMessage({
        command: 'createPreset',
        data: {
          name,
          description,
          prompt,
          format,
          style: style || undefined,
          tags: []
        }
      });

      toggleCreateForm();
      document.getElementById('preset-name').value = '';
      document.getElementById('preset-description').value = '';
      document.getElementById('preset-prompt').value = '';
      document.getElementById('preset-style').value = '';
    }

    function deletePreset(id) {
      vscode.postMessage({ command: 'deletePreset', id });
    }

    // Request initial data
    vscode.postMessage({ command: 'refresh' });
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

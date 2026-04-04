import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';
import { getWebviewStyles } from '@/styles';
import type {
  GalleryTab,
  GeneratedImage,
  GeneratedVideo,
  MediaItem,
} from '@/types';

export class GalleryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'genfeed.galleryView';
  private view?: vscode.WebviewView;
  private images: GeneratedImage[] = [];
  private videos: GeneratedVideo[] = [];
  private activeTab: GalleryTab = 'all';

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
        case 'loadMedia':
        case 'refresh':
          await this.refreshMedia();
          break;
        case 'setTab':
          this.activeTab = message.tab as GalleryTab;
          this.sendMediaUpdate();
          break;
        case 'copyUrl':
          await vscode.env.clipboard.writeText(message.url);
          vscode.window.showInformationMessage('URL copied to clipboard');
          break;
        case 'openInBrowser':
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case 'authenticate':
          await vscode.commands.executeCommand('genfeed.authenticate');
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('genfeed.setApiKey');
          break;
      }
    });

    this.refreshMedia();
  }

  async refreshImages(): Promise<void> {
    await this.refreshMedia();
  }

  async refreshMedia(): Promise<void> {
    const authService = AuthService.getInstance();
    if (!authService.isAuthenticated()) {
      this.updateView({
        activeTab: this.activeTab,
        authenticated: false,
        loading: false,
        media: [],
      });
      return;
    }

    this.updateView({
      activeTab: this.activeTab,
      authenticated: true,
      loading: true,
      media: this.getFilteredMedia(),
    });

    try {
      const apiService = ApiService.getInstance();
      const [images, videos] = await Promise.all([
        apiService.getGeneratedImages(50),
        apiService.getGeneratedVideos(50),
      ]);
      this.images = images;
      this.videos = videos;
      this.sendMediaUpdate();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to load gallery: ${errorMessage}`);
      this.updateView({
        activeTab: this.activeTab,
        authenticated: true,
        error: errorMessage,
        loading: false,
        media: [],
      });
    }
  }

  private getFilteredMedia(): MediaItem[] {
    const imageItems: MediaItem[] = this.images.map((img) => ({
      ...img,
      mediaType: 'image' as const,
    }));
    const videoItems: MediaItem[] = this.videos.map((vid) => ({
      ...vid,
      mediaType: 'video' as const,
    }));

    let media: MediaItem[];
    switch (this.activeTab) {
      case 'images':
        media = imageItems;
        break;
      case 'videos':
        media = videoItems;
        break;
      default:
        media = [...imageItems, ...videoItems];
    }

    return media.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private sendMediaUpdate(): void {
    this.updateView({
      activeTab: this.activeTab,
      authenticated: true,
      loading: false,
      media: this.getFilteredMedia(),
    });
  }

  private updateView(data: {
    authenticated: boolean;
    media: MediaItem[];
    loading: boolean;
    activeTab: GalleryTab;
    error?: string;
  }): void {
    if (this.view) {
      this.view.webview.postMessage({ type: 'update', ...data });
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; media-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Genfeed Gallery</title>
  <style>
    ${styles}

    /* Gallery-specific styles */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .header-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }

    .tabs-list {
      margin-bottom: 12px;
    }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .media-card {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--border-radius);
      overflow: hidden;
      cursor: pointer;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .media-card:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .media-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .media-type-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border-radius: 3px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .media-type-badge.video {
      background: var(--vscode-button-background);
    }

    .media-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
      padding: 24px 8px 8px;
      color: white;
      font-size: 10px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .media-card:hover .media-overlay {
      opacity: 1;
    }

    .media-model {
      font-weight: 600;
      margin-bottom: 2px;
    }

    .media-date {
      opacity: 0.8;
    }

    .preview-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .preview-modal.active {
      display: flex;
    }

    .preview-close {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .preview-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .preview-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .preview-nav:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .preview-nav.prev {
      left: 12px;
    }

    .preview-nav.next {
      right: 12px;
    }

    .preview-content {
      max-width: 100%;
      max-height: 60vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .preview-media {
      max-width: 100%;
      max-height: 50vh;
      border-radius: var(--border-radius);
      object-fit: contain;
    }

    .preview-video {
      max-width: 100%;
      max-height: 50vh;
      border-radius: var(--border-radius);
    }

    .preview-metadata {
      background: rgba(255, 255, 255, 0.05);
      padding: 16px;
      border-radius: var(--border-radius);
      margin-top: 16px;
      width: 100%;
      max-width: 400px;
      color: white;
      font-size: 12px;
    }

    .metadata-row {
      display: flex;
      margin-bottom: 8px;
    }

    .metadata-row:last-child {
      margin-bottom: 0;
    }

    .metadata-label {
      font-weight: 600;
      min-width: 80px;
      opacity: 0.7;
    }

    .metadata-value {
      flex: 1;
      word-break: break-word;
    }

    .metadata-prompt {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .preview-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .preview-actions .btn {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    .preview-actions .btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      opacity: 0.6;
    }

    .empty-state p {
      margin: 0 0 8px;
    }

    .loading {
      text-align: center;
      padding: 32px 16px;
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
      opacity: 0.5;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-state {
      text-align: center;
      padding: 24px 16px;
      color: var(--vscode-errorForeground);
    }

    .error-state p {
      margin: 0 0 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="auth-view" class="auth-container" style="display: none;">
      <h3>View Your Gallery</h3>
      <p>Sign in to view your generated images and videos.</p>
      <button class="btn btn-primary btn-block" onclick="authenticate()">
        Sign In with Genfeed
      </button>
      <button class="btn btn-secondary btn-block" onclick="setApiKey()">
        Use API Key
      </button>
    </div>

    <div id="loading-view" class="loading" style="display: none;">
      <div class="loading-spinner"></div>
      <p>Loading media...</p>
    </div>

    <div id="error-view" class="error-state" style="display: none;">
      <p id="error-message">Failed to load gallery</p>
      <button class="btn btn-secondary btn-small" onclick="refresh()">Try Again</button>
    </div>

    <div id="main-view" style="display: none;">
      <div class="header">
        <span class="header-title">Gallery</span>
        <button class="btn btn-secondary btn-small" onclick="refresh()">Refresh</button>
      </div>

      <div class="tabs-list">
        <button class="tabs-trigger active" data-tab="all" onclick="setTab('all')">All</button>
        <button class="tabs-trigger" data-tab="images" onclick="setTab('images')">Images</button>
        <button class="tabs-trigger" data-tab="videos" onclick="setTab('videos')">Videos</button>
      </div>

      <div id="gallery-grid" class="gallery-grid"></div>

      <div id="empty-state" class="empty-state" style="display: none;">
        <p id="empty-text">No media yet</p>
        <p style="font-size: 11px;">Generate your first image or video using the command palette or presets panel.</p>
      </div>
    </div>
  </div>

  <div id="preview-modal" class="preview-modal" onclick="closePreviewOnBackdrop(event)">
    <button class="preview-close" onclick="closePreview()">×</button>
    <button class="preview-nav prev" onclick="navigatePreview(-1)">‹</button>
    <button class="preview-nav next" onclick="navigatePreview(1)">›</button>
    <div class="preview-content" onclick="event.stopPropagation()">
      <img id="preview-image" class="preview-media" style="display: none;" />
      <video id="preview-video" class="preview-video" controls style="display: none;"></video>
      <div id="preview-metadata" class="preview-metadata"></div>
      <div class="preview-actions">
        <button class="btn btn-small" onclick="copyCurrentUrl()">Copy URL</button>
        <button class="btn btn-small" onclick="openCurrentInBrowser()">Open in Browser</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let media = [];
    let currentIndex = -1;
    let currentUrl = null;
    let activeTab = 'all';

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        updateUI(message);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closePreview();
      } else if (event.key === 'ArrowLeft') {
        navigatePreview(-1);
      } else if (event.key === 'ArrowRight') {
        navigatePreview(1);
      }
    });

    function updateUI(data) {
      const authView = document.getElementById('auth-view');
      const loadingView = document.getElementById('loading-view');
      const errorView = document.getElementById('error-view');
      const mainView = document.getElementById('main-view');

      authView.style.display = 'none';
      loadingView.style.display = 'none';
      errorView.style.display = 'none';
      mainView.style.display = 'none';

      if (!data.authenticated) {
        authView.style.display = 'block';
        return;
      }

      if (data.loading) {
        loadingView.style.display = 'block';
        return;
      }

      if (data.error) {
        errorView.style.display = 'block';
        document.getElementById('error-message').textContent = data.error;
        return;
      }

      mainView.style.display = 'block';
      media = data.media || [];
      activeTab = data.activeTab || 'all';
      updateTabs();
      renderGallery();
    }

    function updateTabs() {
      document.querySelectorAll('.tabs-trigger').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === activeTab);
      });
    }

    function setTab(tab) {
      activeTab = tab;
      updateTabs();
      vscode.postMessage({ command: 'setTab', tab });
    }

    function renderGallery() {
      const grid = document.getElementById('gallery-grid');
      const emptyState = document.getElementById('empty-state');
      const emptyText = document.getElementById('empty-text');

      if (media.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        const tabText = activeTab === 'all' ? 'media' : activeTab;
        emptyText.textContent = 'No ' + tabText + ' yet';
        return;
      }

      emptyState.style.display = 'none';
      grid.innerHTML = media.map((item, index) => {
        const thumbnail = item.thumbnailUrl || item.url;
        const isVideo = item.mediaType === 'video';
        return \`
          <div class="media-card" onclick="openPreview(\${index})">
            <img src="\${escapeAttr(thumbnail)}" class="media-thumbnail" loading="lazy" alt="Generated \${isVideo ? 'video' : 'image'}" />
            <span class="media-type-badge \${isVideo ? 'video' : ''}">\${isVideo ? 'Video' : 'Image'}</span>
            <div class="media-overlay">
              <div class="media-model">\${escapeHtml(item.model)}</div>
              <div class="media-date">\${formatDate(item.createdAt)}</div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function openPreview(index) {
      const item = media[index];
      if (!item) return;

      currentIndex = index;
      currentUrl = item.url;
      const isVideo = item.mediaType === 'video';

      const imgEl = document.getElementById('preview-image');
      const videoEl = document.getElementById('preview-video');

      if (isVideo) {
        imgEl.style.display = 'none';
        videoEl.style.display = 'block';
        videoEl.src = item.url;
        videoEl.load();
      } else {
        videoEl.style.display = 'none';
        videoEl.pause();
        imgEl.style.display = 'block';
        imgEl.src = item.url;
      }

      const durationRow = item.duration ? \`
        <div class="metadata-row">
          <span class="metadata-label">Duration</span>
          <span class="metadata-value">\${item.duration}s</span>
        </div>
      \` : '';

      document.getElementById('preview-metadata').innerHTML = \`
        <div class="metadata-row">
          <span class="metadata-label">Type</span>
          <span class="metadata-value">\${isVideo ? 'Video' : 'Image'}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Prompt</span>
          <span class="metadata-value metadata-prompt">\${escapeHtml(item.prompt)}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Model</span>
          <span class="metadata-value">\${escapeHtml(item.model)}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Size</span>
          <span class="metadata-value">\${item.width} × \${item.height}</span>
        </div>
        \${durationRow}
        <div class="metadata-row">
          <span class="metadata-label">Created</span>
          <span class="metadata-value">\${formatDateTime(item.createdAt)}</span>
        </div>
      \`;
      document.getElementById('preview-modal').classList.add('active');
    }

    function navigatePreview(direction) {
      if (currentIndex < 0 || media.length === 0) return;

      const videoEl = document.getElementById('preview-video');
      videoEl.pause();

      let newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = media.length - 1;
      if (newIndex >= media.length) newIndex = 0;

      openPreview(newIndex);
    }

    function closePreview() {
      const videoEl = document.getElementById('preview-video');
      videoEl.pause();
      document.getElementById('preview-modal').classList.remove('active');
      currentIndex = -1;
      currentUrl = null;
    }

    function closePreviewOnBackdrop(event) {
      if (event.target.id === 'preview-modal') {
        closePreview();
      }
    }

    function copyCurrentUrl() {
      if (currentUrl) {
        vscode.postMessage({ command: 'copyUrl', url: currentUrl });
      }
    }

    function openCurrentInBrowser() {
      if (currentUrl) {
        vscode.postMessage({ command: 'openInBrowser', url: currentUrl });
      }
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function authenticate() {
      vscode.postMessage({ command: 'authenticate' });
    }

    function setApiKey() {
      vscode.postMessage({ command: 'setApiKey' });
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

    function escapeAttr(str) {
      if (!str) return '';
      return str.replace(/["'&<>]/g, char => ({
        '"': '&quot;',
        "'": '&#39;',
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
      }[char]));
    }

    function formatDate(dateStr) {
      try {
        return new Date(dateStr).toLocaleDateString();
      } catch {
        return dateStr;
      }
    }

    function formatDateTime(dateStr) {
      try {
        return new Date(dateStr).toLocaleString();
      } catch {
        return dateStr;
      }
    }

    // Request initial data
    vscode.postMessage({ command: 'loadMedia' });
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

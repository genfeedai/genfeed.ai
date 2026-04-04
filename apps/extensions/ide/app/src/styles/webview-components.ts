/**
 * Reusable CSS component styles following shadcn naming conventions.
 * These can be embedded in VS Code webview HTML.
 */
export const webviewComponentsCss = `
  /* Container */
  .container {
    padding: var(--container-padding);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--secondary);
    color: var(--secondary-foreground);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--secondary-hover);
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--foreground);
  }

  .btn-outline:hover:not(:disabled) {
    background: var(--accent);
  }

  .btn-ghost {
    background: transparent;
    color: var(--foreground);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--accent);
  }

  .btn-destructive {
    background: var(--destructive);
    color: var(--destructive-foreground);
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 11px;
  }

  .btn-block {
    width: 100%;
  }

  /* Cards */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .card-title {
    font-weight: 600;
    font-size: 13px;
  }

  .card-description {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 8px;
  }

  .card-content {
    /* Content area */
  }

  .card-footer {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }

  /* Badges */
  .badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--badge);
    color: var(--badge-foreground);
    border-radius: 10px;
  }

  .badge-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--foreground);
  }

  /* Inputs */
  .input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--input);
    background: var(--input-background);
    color: var(--input-foreground);
    border-radius: var(--radius);
    font-family: inherit;
    font-size: 13px;
  }

  .input::placeholder {
    color: var(--input-placeholder);
  }

  .input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .textarea {
    min-height: 80px;
    resize: vertical;
  }

  /* Separator */
  .separator {
    height: 1px;
    background: var(--border);
    margin: 16px 0;
  }

  /* Tabs */
  .tabs-list {
    display: flex;
    gap: 4px;
    background: var(--card);
    padding: 4px;
    border-radius: var(--radius);
  }

  .tabs-trigger {
    flex: 1;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    border-radius: calc(var(--radius) - 2px);
    font-size: 12px;
    opacity: 0.7;
    transition: all 0.15s;
  }

  .tabs-trigger:hover {
    opacity: 1;
    background: var(--accent);
  }

  .tabs-trigger.active {
    opacity: 1;
    background: var(--primary);
    color: var(--primary-foreground);
  }

  /* Section */
  .section {
    margin-bottom: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  /* Input group */
  .input-group {
    margin-bottom: 12px;
  }

  .input-group label {
    display: block;
    font-size: 11px;
    margin-bottom: 4px;
    opacity: 0.8;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 24px;
    opacity: 0.6;
  }

  /* Loading spinner */
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    opacity: 0.5;
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Auth container (centered content) */
  .auth-container {
    text-align: center;
    padding: 24px var(--container-padding);
  }

  .auth-container h3 {
    margin: 0 0 8px;
    font-size: 14px;
  }

  .auth-container p {
    margin: 0 0 16px;
    opacity: 0.8;
    font-size: 12px;
  }
`;

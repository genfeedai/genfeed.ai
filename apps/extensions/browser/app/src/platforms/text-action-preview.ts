import type {
  TextActionMode,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';
import { applyContentThemeToElement } from '~theme/content-theme';

export interface TextActionPreviewOptions {
  mode: TextActionMode;
  original: string;
  /** Replaces the composer text; reports why it could not. */
  onApply: () => { error?: string; success: boolean };
  /** Restores the composer text; reports why it could not. */
  onUndo: () => { error?: string; success: boolean };
  result: TextActionResult;
}

const HOST_ID = 'genfeed-text-action-preview';

const STYLES = `
  :host {
    --card: #fff; --border: #cfd9de; --text: #0f1419; --muted: #536471;
    --accent: #1d9bf0; --accent-text: #fff; --hover: #f7f9f9; --error: #f4212e;
    all: initial;
    position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  :host([data-genfeed-theme="dark"]) {
    --card: #15202b; --border: #2f3336; --text: #e7e9ea; --muted: #71767b;
    --hover: #202327;
  }
  .card { box-sizing: border-box; width: 360px; max-width: calc(100vw - 32px);
    max-height: 70vh; overflow: auto; padding: 14px; border-radius: 14px;
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    box-shadow: 0 8px 28px rgba(0,0,0,.28); font-size: 14px; line-height: 1.4; }
  h2 { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
  .text { margin: 0; padding: 10px; border-radius: 10px; background: var(--hover);
    white-space: pre-wrap; overflow-wrap: anywhere; }
  .hint, .meta, summary { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .error { margin: 8px 0 0; font-size: 12px; color: var(--error); }
  details p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  .actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
  button { font: inherit; font-weight: 600; font-size: 13px; padding: 6px 14px;
    border-radius: 999px; border: 1px solid var(--border); background: transparent;
    color: var(--text); cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(label: string, onClick: () => void, isPrimary = false) {
  const button = element('button', isPrimary ? 'primary' : undefined, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Shows the suggested text beside Apply and Undo. The composer is only touched
 * by Apply or Undo; closing the card changes nothing. Text is set with
 * `textContent`, never as markup.
 */
export function showTextActionPreview(options: TextActionPreviewOptions): {
  dismiss: () => void;
} {
  document.getElementById(HOST_ID)?.remove();
  const host = element('div');
  host.id = HOST_ID;
  applyContentThemeToElement(host);
  const root = host.attachShadow({ mode: 'open' });
  root.appendChild(element('style', undefined, STYLES));

  const card = element('div', 'card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Genfeed text suggestion');
  const title = element(
    'h2',
    undefined,
    options.mode === 'proofread' ? 'Proofread' : 'Rewrite in my voice',
  );
  const suggestion = element('p', 'text', options.result.text);
  const status = element('p', 'error');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const actions = element('div', 'actions');
  card.append(title, suggestion);
  if (options.result.voiceHint) {
    card.appendChild(element('p', 'hint', options.result.voiceHint));
  }
  const details = element('details');
  details.append(
    element('summary', undefined, 'Original'),
    element('p', undefined, options.original),
  );
  card.append(details, status, actions);
  root.appendChild(card);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss();
  };
  function dismiss(): void {
    document.removeEventListener('keydown', onKeyDown, true);
    host.remove();
  }
  function fail(message: string | undefined, fallback: string): void {
    status.textContent = message ?? fallback;
    status.hidden = false;
  }
  function render(isApplied: boolean): void {
    status.hidden = true;
    actions.replaceChildren(
      ...(isApplied
        ? [
            actionButton('Undo', () => {
              const reverted = options.onUndo();
              if (reverted.success) render(false);
              else fail(reverted.error, 'Could not undo.');
            }),
            actionButton('Done', dismiss, true),
          ]
        : [
            actionButton('Dismiss', dismiss),
            actionButton(
              'Apply',
              () => {
                const written = options.onApply();
                if (written.success) render(true);
                else fail(written.error, 'Could not apply.');
              },
              true,
            ),
          ]),
    );
  }
  render(false);

  document.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(host);
  return { dismiss };
}

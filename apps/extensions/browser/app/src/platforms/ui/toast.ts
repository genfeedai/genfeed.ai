import { createShadowHost, GENFEED_FONT_STACK } from '~platforms/ui/tokens';

const TOAST_HOST_ID = 'genfeed-toast';
const TOAST_DURATION_MS = 3600;

const TOAST_CSS = `
  :host {
    all: initial; position: fixed; right: 20px; bottom: 20px;
    z-index: 2147483647; font-family: ${GENFEED_FONT_STACK};
  }
  .toast {
    box-sizing: border-box; max-width: 320px; padding: 12px 16px;
    border-radius: 12px; background: rgba(15, 20, 25, 0.92); color: #fff;
    font-size: 14px; font-weight: 600; line-height: 1.4;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }
  .toast[data-error] { background: rgba(244, 33, 46, 0.92); }
`;

let hideTimer: number | undefined;

/** The one toast Genfeed shows on a page. A new message replaces the last. */
export function showToast(message: string, isError = false): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
  window.clearTimeout(hideTimer);

  const { host, root } = createShadowHost({
    css: TOAST_CSS,
    id: TOAST_HOST_ID,
  });
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', isError ? 'alert' : 'status');
  if (isError) {
    toast.dataset.error = '';
  }
  toast.textContent = message;
  root.appendChild(toast);
  document.body.appendChild(host);

  hideTimer = window.setTimeout(() => host.remove(), TOAST_DURATION_MS);
}

/** The text of the toast on screen, for tests and assistive checks. */
export function currentToastText(): string | null {
  return (
    document
      .getElementById(TOAST_HOST_ID)
      ?.shadowRoot?.querySelector('.toast')?.textContent ?? null
  );
}

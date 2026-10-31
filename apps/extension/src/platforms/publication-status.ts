import type { PublicationStatusAction } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';

const STATUS_ID = 'genfeed-publication-recording-status';
let releaseAction: (() => void) | undefined;
export function showPublicationStatus(
  message: string,
  action?: PublicationStatusAction,
): void {
  releaseAction?.();
  releaseAction = undefined;
  let element = document.getElementById(STATUS_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = STATUS_ID;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.style.cssText =
      'position:fixed;bottom:16px;right:16px;max-width:320px;padding:12px;border-radius:8px;background:var(--background,#171717);color:var(--foreground,#fafafa);border:1px solid var(--border,#444);font:13px sans-serif;z-index:2147483647;pointer-events:none';
    document.body.appendChild(element);
  }
  element.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  element.append(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.disabled = action.disabled ?? false;
    button.style.cssText =
      'pointer-events:auto;display:block;margin-top:8px;padding:6px 10px;border-radius:6px;background:var(--primary,#fafafa);color:var(--primary-foreground,#171717);border:1px solid var(--border,#444);cursor:pointer';
    button.addEventListener('click', action.onClick);
    releaseAction = () => button.removeEventListener('click', action.onClick);
    element.append(button);
  }
}
export function removePublicationStatus(): void {
  releaseAction?.();
  releaseAction = undefined;
  document.getElementById(STATUS_ID)?.remove();
}

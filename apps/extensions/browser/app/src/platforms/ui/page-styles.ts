const STYLE_ID = 'genfeed-extension-styles';

// The hover actions on a post's image sit inside X's own image container, so
// they are styled from the page rather than from a shadow root.
const IMAGE_OVERLAY_CSS = `
  .genfeed-image-hoverable { position: relative; }

  .genfeed-image-overlay {
    position: absolute; right: 8px; bottom: 8px; z-index: 1001;
    display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }

  .genfeed-image-hoverable:hover .genfeed-image-overlay {
    opacity: 1; pointer-events: auto;
  }

  .genfeed-image-action {
    display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
    border-radius: 9999px; border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(15, 20, 25, 0.88); color: #fff;
    font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); transition: all 0.2s ease;
  }

  .genfeed-image-action:hover {
    transform: translateY(-1px); background: rgba(29, 155, 240, 0.95);
    border-color: rgba(29, 155, 240, 0.9);
  }

  .genfeed-image-action:disabled {
    opacity: 0.7; cursor: not-allowed; transform: none;
  }
`;

/** Injects the styles for the image hover actions, once per page. */
export function injectImageOverlayStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = IMAGE_OVERLAY_CSS;
  document.head.appendChild(style);
}

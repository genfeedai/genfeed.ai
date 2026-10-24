import {
  applyContentThemeToElement,
  GENFEED_HOST_ATTRIBUTE,
} from '~theme/content-theme';

export const GENFEED_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Theme tokens shared by every Genfeed surface injected into a page. */
export const GENFEED_TOKENS_CSS = `
  :host {
    --card: #fff; --border: #cfd9de; --text: #0f1419; --muted: #536471;
    --accent: #1d9bf0; --accent-text: #fff; --hover: #f7f9f9; --error: #f4212e;
    --shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }
  :host([data-genfeed-theme="dark"]) {
    --card: #15202b; --border: #2f3336; --text: #e7e9ea; --muted: #71767b;
    --hover: #202327; --shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
`;

interface ShadowHostOptions {
  css: string;
  id?: string;
}

/**
 * An element that carries its own styles in a shadow root, so the host site's
 * CSS cannot restyle it and ours cannot leak into the page.
 */
export function createShadowHost({ css, id }: ShadowHostOptions): {
  host: HTMLDivElement;
  root: ShadowRoot;
} {
  const host = document.createElement('div');
  if (id) {
    host.id = id;
  }
  host.setAttribute(GENFEED_HOST_ATTRIBUTE, '');
  applyContentThemeToElement(host);
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${GENFEED_TOKENS_CSS}${css}`;
  root.appendChild(style);
  return { host, root };
}

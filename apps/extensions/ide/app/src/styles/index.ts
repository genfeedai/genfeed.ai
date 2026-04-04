import { webviewComponentsCss } from '@/styles/webview-components';
import { webviewThemeCss } from '@/styles/webview-theme';

export { webviewComponentsCss, webviewThemeCss };

/**
 * Combines theme and component CSS for use in VS Code webviews.
 * Import this and inject into your webview HTML.
 *
 * @example
 * ```ts
 * import { getWebviewStyles } from './styles';
 *
 * const html = `
 *   <style>${getWebviewStyles()}</style>
 *   <div class="container">...</div>
 * `;
 * ```
 */
export function getWebviewStyles(): string {
  return `
    ${webviewThemeCss}
    ${webviewComponentsCss}
  `;
}

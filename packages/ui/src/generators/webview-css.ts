import { webviewSemanticTokenMap } from '@ui/semantic/webview';

export function generateWebviewTokenCss(): string {
  const semanticLines = Object.entries(webviewSemanticTokenMap).map(
    ([tokenName, value]) =>
      `    --${tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}: ${value};`,
  );

  return `:root {
${semanticLines.join('\n')}
    --input-background: var(--vscode-input-background);
    --input-foreground: var(--vscode-input-foreground);
    --input-placeholder: var(--vscode-input-placeholderForeground);
    --badge: var(--vscode-badge-background);
    --badge-foreground: var(--vscode-badge-foreground);
    --container-padding: 12px;
    --radius: 4px;
    --space-md: 12px;
    --space-lg: 16px;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--foreground);
    background: var(--background);
  }`;
}

export const webviewTokenCss = generateWebviewTokenCss();

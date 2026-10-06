import { SATOSHI_VARIABLE_WOFF2_BASE64 } from './satoshi-font';

export const SATOSHI_FONT_RESOURCE_PATH =
  '/assets/fonts/satoshi-variable.woff2';

function fontCss(source: string): string {
  return `
:root { --font-satoshi: "Satoshi"; }
@font-face {
  font-family: "Satoshi";
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url(${JSON.stringify(source)}) format("woff2");
}
`;
}

/** Sandboxed hosts can load the same font from an explicitly allowed origin. */
export function staticSurfaceFontCssForUrl(source: string): string {
  const url = new URL(source);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('The product font requires a public HTTP(S) URL.');
  }
  return fontCss(url.href);
}

/** Product font for standalone surfaces that cannot inherit the app stylesheet. */
export const staticSurfaceFontCss: string = fontCss(
  `data:font/woff2;base64,${SATOSHI_VARIABLE_WOFF2_BASE64}`,
);

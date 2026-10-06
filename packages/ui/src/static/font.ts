import { SATOSHI_VARIABLE_WOFF2_BASE64 } from './satoshi-font';

/** Product font for standalone surfaces that cannot inherit the app stylesheet. */
export const staticSurfaceFontCss: string = `
:root { --font-satoshi: "Satoshi"; }
@font-face {
  font-family: "Satoshi";
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url("data:font/woff2;base64,${SATOSHI_VARIABLE_WOFF2_BASE64}") format("woff2");
}
`;

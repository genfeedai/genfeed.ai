export type DesktopColorScheme = 'light' | 'dark';

const DESKTOP_BOOT_BACKGROUNDS: Record<DesktopColorScheme, string> = {
  dark: '#030303',
  light: '#fafaf9',
};

const buildDataUrl = (html: string): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

const BASE_BOOT_STYLES = `
      :root {
        --desktop-boot-background: ${DESKTOP_BOOT_BACKGROUNDS.light};
        --desktop-boot-foreground: #0d0d0d;
        --desktop-boot-muted: #707070;
        --desktop-boot-ring: rgba(13, 13, 13, 0.18);
        --desktop-boot-ring-active: rgba(13, 13, 13, 0.82);
        --desktop-boot-shadow: rgba(13, 13, 13, 0.12);
        background: var(--desktop-boot-background);
        color: var(--desktop-boot-foreground);
        color-scheme: light dark;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --desktop-boot-background: ${DESKTOP_BOOT_BACKGROUNDS.dark};
          --desktop-boot-foreground: #fafafa;
          --desktop-boot-muted: #949494;
          --desktop-boot-ring: rgba(255, 255, 255, 0.18);
          --desktop-boot-ring-active: rgba(255, 255, 255, 0.82);
          --desktop-boot-shadow: rgba(255, 255, 255, 0.14);
        }
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
      }

      body {
        display: grid;
        place-items: center;
        background: var(--desktop-boot-background);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
`;

const buildDesktopBootHtml = ({
  body,
  styles,
  title,
}: {
  body: string;
  styles: string;
  title: string;
}): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>${title}</title>
    <style>${BASE_BOOT_STYLES}${styles}
    </style>
  </head>
  <body>${body}
  </body>
</html>`;

export const getDesktopBootBackground = (
  colorScheme: DesktopColorScheme,
): string => DESKTOP_BOOT_BACKGROUNDS[colorScheme];

/** Canonical G mark from `apps/app/public/logo.svg` / CDN branding. */
export const buildDesktopLoadingScreenHtml = (): string =>
  buildDesktopBootHtml({
    title: 'Genfeed',
    styles: `
      * {
        box-sizing: border-box;
      }

      body {
        overflow: hidden;
      }

      .boot-mark {
        display: grid;
        gap: 22px;
        justify-items: center;
      }

      .logo {
        width: 80px;
        height: 80px;
        animation: boot-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        filter: drop-shadow(0 0 28px var(--desktop-boot-shadow));
      }

      .spinner {
        position: relative;
        width: 34px;
        height: 34px;
      }

      .spinner::before,
      .spinner::after {
        position: absolute;
        inset: 0;
        content: "";
        border: 1px solid var(--desktop-boot-ring);
        border-radius: 999px;
      }

      .spinner::after {
        border-color: var(--desktop-boot-ring-active) transparent transparent;
        animation: boot-spin 0.9s linear infinite;
      }

      @keyframes boot-pulse {
        0%,
        100% {
          opacity: 0.72;
          transform: translateY(0) scale(0.985);
        }

        50% {
          opacity: 1;
          transform: translateY(-1px) scale(1);
        }
      }

      @keyframes boot-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .logo,
        .spinner::after {
          animation: none;
        }
      }
`,
    body: `
    <main class="boot-mark" aria-label="Genfeed is loading">
      <svg
        class="logo"
        viewBox="0 0 500 500"
        fill="currentColor"
        role="img"
        aria-label="Genfeed"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="translate(0,500) scale(0.1,-0.1)">
          <path d="M2360 4944 c-490 -32 -952 -211 -1352 -524 -105 -82 -293 -269 -382 -380 -347 -433 -535 -944 -553 -1501 -9 -281 29 -535 122 -817 119 -361 309 -665 595 -953 490 -495 1195 -762 1873 -710 257 19 407 50 650 133 323 109 655 312 892 544 146 143 343 402 438 574 181 329 283 720 285 1089 1 144 -1 168 -19 202 -39 78 -2 73 -669 79 l-595 5 -60 32 c-59 30 -305 174 -793 462 -261 154 -299 169 -359 138 -17 -9 -39 -33 -49 -54 -18 -36 -19 -70 -16 -808 3 -618 6 -776 17 -802 27 -64 120 -92 199 -59 18 8 230 138 469 290 240 151 455 285 477 296 57 29 93 26 123 -10 54 -63 43 -148 -40 -314 -103 -207 -233 -352 -431 -481 -194 -125 -439 -195 -679 -195 -565 1 -1055 352 -1231 881 -59 179 -67 233 -66 469 0 198 2 223 26 320 50 197 134 371 247 512 194 242 444 412 691 471 133 32 174 37 308 37 371 -1 677 -118 951 -364 83 -75 128 -93 182 -74 35 11 101 52 474 287 258 163 273 175 292 219 32 76 -8 145 -181 317 -277 274 -646 487 -1049 604 -120 35 -172 46 -307 66 -98 14 -382 26 -480 19z" />
        </g>
      </svg>
      <div class="spinner" aria-hidden="true"></div>
    </main>
`,
  });

export const buildDesktopFailureScreenHtml = (): string =>
  buildDesktopBootHtml({
    title: 'Genfeed failed to start',
    styles: `
      main {
        max-width: 460px;
        padding: 32px;
        text-align: center;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 20px;
        font-weight: 650;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: var(--desktop-boot-muted);
        font-size: 14px;
        line-height: 1.6;
      }
`,
    body: `
    <main role="alert">
      <h1>Genfeed could not start</h1>
      <p>Your local data is still safe. Quit and reopen Genfeed; if this keeps happening, install the latest desktop release.</p>
    </main>
`,
  });

export const buildDesktopLoadingScreenUrl = (): string =>
  buildDataUrl(buildDesktopLoadingScreenHtml());

export const buildDesktopFailureScreenUrl = (): string =>
  buildDataUrl(buildDesktopFailureScreenHtml());

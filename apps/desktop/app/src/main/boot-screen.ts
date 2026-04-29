const DESKTOP_BOOT_BACKGROUND = '#000000';

const buildDataUrl = (html: string): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

export const getDesktopBootBackground = (): string => DESKTOP_BOOT_BACKGROUND;

export const buildDesktopLoadingScreenHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>Genfeed</title>
    <style>
      :root {
        background: ${DESKTOP_BOOT_BACKGROUND};
        color: #f7f7f7;
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
      }

      body {
        display: grid;
        place-items: center;
        background: ${DESKTOP_BOOT_BACKGROUND};
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      .boot-mark {
        display: grid;
        gap: 22px;
        justify-items: center;
      }

      .logo {
        height: 56px;
        width: auto;
        animation: boot-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        filter: drop-shadow(0 0 28px rgba(255, 255, 255, 0.14));
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
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
      }

      .spinner::after {
        border-color: rgba(255, 255, 255, 0.82) transparent transparent;
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
    </style>
  </head>
  <body>
    <main class="boot-mark" aria-label="Genfeed is loading">
      <svg
        class="logo"
        viewBox="0 0 760 160"
        fill="none"
        role="img"
        aria-label="Genfeed"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M79.8 139.6c-35.9 0-61.4-24.9-61.4-59.6s25.8-59.6 62.8-59.6c22.1 0 39.9 8.9 51.7 24.3l-22.5 20.5c-7.4-9-16-13.5-28-13.5-18.6 0-31.6 11.6-31.6 28.3 0 17.3 12.8 29.2 31.1 29.2 8.1 0 15.4-1.6 22.1-5.9V86.6H76.5V61.4h58.4v57.7c-14.2 12.8-34.1 20.5-55.1 20.5Z"
          fill="currentColor"
        />
        <path
          d="M202.6 139.6c-29.7 0-50.5-18.8-50.5-45.3s20.1-45.2 47.4-45.2c25.4 0 45.7 16.2 45.7 45.8 0 2.5-.3 5.9-.5 8.6h-61.3c2.5 8.3 9.6 13.1 20.3 13.1 8.1 0 13.4-2.3 19.2-7.2l17.3 18c-8.4 8-20.6 12.2-37.6 12.2Zm-19.8-53.2h32.8c-1.5-8.7-7.9-14.1-16.4-14.1-8.6 0-14.8 5.4-16.4 14.1Z"
          fill="currentColor"
        />
        <path
          d="M261 138V50.7h31.3v9.5c7-7.4 16.8-11.1 27.5-11.1 20.5 0 36.7 12 36.7 39.9v49h-32.8V94.4c0-12.2-5-17.3-13.2-17.3-9.2 0-16.7 5.8-16.7 20.1V138H261Z"
          fill="currentColor"
        />
        <path
          d="M381.4 138V76h-12.8V51.5h12.8v-1.7c0-21.4 13.4-35.6 38-35.6 7.7 0 15.8 1.4 21.1 4.5L432 42.1c-2.8-1.7-6.2-2.7-9.9-2.7-5.6 0-8.9 3.2-8.9 10.1v2h20.5V76h-19.5v62h-32.8Z"
          fill="currentColor"
        />
        <path
          d="M490.6 139.6c-29.7 0-50.5-18.8-50.5-45.3s20.1-45.2 47.4-45.2c25.4 0 45.7 16.2 45.7 45.8 0 2.5-.3 5.9-.5 8.6h-61.3c2.5 8.3 9.6 13.1 20.3 13.1 8.1 0 13.4-2.3 19.2-7.2l17.3 18c-8.4 8-20.6 12.2-37.6 12.2Zm-19.8-53.2h32.8c-1.5-8.7-7.9-14.1-16.4-14.1-8.6 0-14.8 5.4-16.4 14.1Z"
          fill="currentColor"
        />
        <path
          d="M591.7 139.6c-29.7 0-50.5-18.8-50.5-45.3s20.1-45.2 47.4-45.2c25.4 0 45.7 16.2 45.7 45.8 0 2.5-.3 5.9-.5 8.6h-61.3c2.5 8.3 9.6 13.1 20.3 13.1 8.1 0 13.4-2.3 19.2-7.2l17.3 18c-8.4 8-20.6 12.2-37.6 12.2Zm-19.8-53.2h32.8c-1.5-8.7-7.9-14.1-16.4-14.1-8.6 0-14.8 5.4-16.4 14.1Z"
          fill="currentColor"
        />
        <path
          d="M685.1 139.6c-23.6 0-42.7-17.5-42.7-45.3s19.1-45.2 42.7-45.2c10.5 0 19.4 3.2 25.5 10.1V18.8h32.8V138h-31.3v-8.3c-5.9 6.8-14.8 9.9-27 9.9Zm7.3-26.1c10.7 0 18.8-7.9 18.8-19.2s-8.1-19.1-18.8-19.1-18.8 7.8-18.8 19.1 8.1 19.2 18.8 19.2Z"
          fill="currentColor"
        />
      </svg>
      <div class="spinner" aria-hidden="true"></div>
    </main>
  </body>
</html>`;

export const buildDesktopFailureScreenHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>Genfeed failed to start</title>
    <style>
      :root {
        background: ${DESKTOP_BOOT_BACKGROUND};
        color: #f7f7f7;
        color-scheme: dark;
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
        background: ${DESKTOP_BOOT_BACKGROUND};
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }

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
        color: rgba(255, 255, 255, 0.62);
        font-size: 14px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main role="alert">
      <h1>Genfeed could not start</h1>
      <p>The embedded app shell failed to boot. Restart Genfeed and check the desktop logs if this keeps happening.</p>
    </main>
  </body>
</html>`;

export const buildDesktopLoadingScreenUrl = (): string =>
  buildDataUrl(buildDesktopLoadingScreenHtml());

export const buildDesktopFailureScreenUrl = (): string =>
  buildDataUrl(buildDesktopFailureScreenHtml());

/** Options for the subset of `turnstile.render` the signup screens use. */
export interface TurnstileRenderOptions {
  appearance: 'always' | 'execute' | 'interaction-only';
  callback: (token: string) => void;
  'error-callback': () => void;
  execution: 'execute' | 'render';
  'expired-callback': () => void;
  sitekey: string;
}

/** The part of Cloudflare's `window.turnstile` API the signup screens call. */
export interface TurnstileApi {
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string | undefined;
  reset: (widgetId: string) => void;
}

/** Fetch options carrying a solved Turnstile token, or none when captcha is off. */
export interface CaptchaFetchOptions {
  headers: Record<string, string>;
}

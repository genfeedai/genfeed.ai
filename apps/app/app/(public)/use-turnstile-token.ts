'use client';

import { useCallback, useEffect, useRef } from 'react';
import type {
  CaptchaFetchOptions,
  TurnstileApi,
} from '@/props/auth/turnstile.props';

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;
const TURNSTILE_TOKEN_TIMEOUT_MS = 15_000;

/** Request header the Better Auth captcha plugin reads the token from. */
export const CAPTCHA_RESPONSE_HEADER = 'x-captcha-response';

let turnstileApiPromise: Promise<TurnstileApi | null> | null = null;

function readTurnstileApi(): TurnstileApi | null {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null;
}

function loadTurnstileApi(): Promise<TurnstileApi | null> {
  if (turnstileApiPromise) {
    return turnstileApiPromise;
  }
  turnstileApiPromise = new Promise<TurnstileApi | null>((resolve) => {
    const existing = readTurnstileApi();
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(readTurnstileApi());
    script.onerror = () => {
      // A blocked script (ad blocker, offline) must be retryable next submit.
      turnstileApiPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return turnstileApiPromise;
}

/**
 * Invisible Cloudflare Turnstile for the account-creating auth calls. The check
 * runs when a form is submitted: `getCaptchaFetchOptions()` resolves to the
 * fetch options carrying the token header, or `undefined` when no site key is
 * configured (captcha off) or the challenge could not complete, in which case
 * the server answers with its own captcha error.
 *
 * A token is single use, so the widget is reset before every run.
 */
export function useTurnstileToken(): {
  getCaptchaFetchOptions: () => Promise<CaptchaFetchOptions | undefined>;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolveTokenRef = useRef<((token: string | null) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current) {
        readTurnstileApi()?.remove(widgetIdRef.current);
      }
      containerRef.current?.remove();
      widgetIdRef.current = null;
      containerRef.current = null;
      resolveTokenRef.current?.(null);
      resolveTokenRef.current = null;
    };
  }, []);

  const getCaptchaFetchOptions = useCallback(async (): Promise<
    CaptchaFetchOptions | undefined
  > => {
    if (!TURNSTILE_SITE_KEY) {
      return undefined;
    }
    const turnstile = await loadTurnstileApi();
    if (!turnstile) {
      return undefined;
    }

    const token = await new Promise<string | null>((resolve) => {
      const timeout = window.setTimeout(
        () => settle(null),
        TURNSTILE_TOKEN_TIMEOUT_MS,
      );
      function settle(value: string | null) {
        window.clearTimeout(timeout);
        resolveTokenRef.current = null;
        resolve(value);
      }
      resolveTokenRef.current = settle;

      if (widgetIdRef.current) {
        turnstile.reset(widgetIdRef.current);
        turnstile.execute(widgetIdRef.current);
        return;
      }

      // Invisible unless Cloudflare needs the visitor to interact; then the
      // widget shows here, pinned above the page.
      const container = document.createElement('div');
      container.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647';
      document.body.appendChild(container);
      containerRef.current = container;
      const widgetId = turnstile.render(container, {
        appearance: 'interaction-only',
        callback: (value) => resolveTokenRef.current?.(value),
        'error-callback': () => resolveTokenRef.current?.(null),
        execution: 'execute',
        'expired-callback': () => undefined,
        sitekey: TURNSTILE_SITE_KEY,
      });
      if (!widgetId) {
        settle(null);
        return;
      }
      widgetIdRef.current = widgetId;
      turnstile.execute(widgetId);
    });

    return token
      ? { headers: { [CAPTCHA_RESPONSE_HEADER]: token } }
      : undefined;
  }, []);

  return { getCaptchaFetchOptions };
}

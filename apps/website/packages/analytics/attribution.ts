'use client';

import { EnvironmentService } from '@services/core/environment.service';

/**
 * Campaign attribution forwarding for the marketing website (genfeed.ai).
 *
 * The public site is cookieless and stores nothing on the visitor's device,
 * so the only place a campaign parameter can survive the hop to the product
 * is the sign-up URL itself. Every outbound link to the app origin gets the
 * current page's `utm_*` and `ref` parameters appended at click time; the
 * app's PostHog client then records them on the signup and pins the initial
 * campaign on the identified person, which is what joins a channel to a
 * customer.
 *
 * Values are visitor-controlled input, so they are allowlisted by key,
 * bounded in length, and restricted to a URL-safe slug charset before they
 * are forwarded. Nothing is persisted: the parameters are read from the URL
 * at bootstrap and refreshed from the URL on every click, which keeps them
 * alive across App Router navigations and drops them on a hard reload.
 */

export const ATTRIBUTION_PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
] as const;

const MAX_ATTRIBUTION_VALUE_LENGTH = 100;
const SAFE_ATTRIBUTION_VALUE = /^[A-Za-z0-9._~-]+$/;

let hasInitStarted = false;
let initialAttribution: URLSearchParams | null = null;

function sanitizeAttributionValue(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  if (
    !trimmed ||
    trimmed.length > MAX_ATTRIBUTION_VALUE_LENGTH ||
    !SAFE_ATTRIBUTION_VALUE.test(trimmed)
  ) {
    return null;
  }

  return trimmed;
}

/**
 * Extract the forwardable attribution parameters from a query string. Keys
 * outside the allowlist and values outside the slug charset are dropped.
 */
export function readAttributionParams(
  search: string | URLSearchParams,
): URLSearchParams {
  const source =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  const attribution = new URLSearchParams();

  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const value = sanitizeAttributionValue(source.get(key));

    if (value) {
      attribution.set(key, value);
    }
  }

  return attribution;
}

function resolveOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Append attribution parameters to `href` when it points at the app origin.
 * Parameters already present on the link win, so a CTA that sets its own
 * `ref` or campaign is never overwritten. Relative links and any other
 * destination are returned untouched.
 */
export function withAttributionParams(
  href: string,
  attribution: URLSearchParams,
  appOrigin: string,
): string {
  const targetOrigin = resolveOrigin(appOrigin);

  if (!targetOrigin || Array.from(attribution.keys()).length === 0) {
    return href;
  }

  // Only absolute links can point at the app; a relative href is one of the
  // website's own pages and must never be resolved against the app origin.
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  if (url.origin !== targetOrigin) {
    return href;
  }

  let hasChanged = false;
  attribution.forEach((value, key) => {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      hasChanged = true;
    }
  });

  return hasChanged ? url.toString() : href;
}

function mergeAttribution(
  base: URLSearchParams | null,
  override: URLSearchParams,
): URLSearchParams {
  const merged = new URLSearchParams(base ?? undefined);
  override.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

function currentAttribution(): URLSearchParams {
  return mergeAttribution(
    initialAttribution,
    readAttributionParams(window.location.search),
  );
}

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function handleAnchorActivation(appOrigin: string, event: Event): void {
  const anchor = findAnchor(event.target);

  if (!anchor) {
    return;
  }

  const forwarded = withAttributionParams(
    anchor.getAttribute('href') ?? '',
    currentAttribution(),
    appOrigin,
  );

  if (forwarded !== anchor.getAttribute('href')) {
    anchor.setAttribute('href', forwarded);
  }
}

/**
 * Start forwarding attribution to app links for this page load. Safe to call
 * on every boot: it no-ops on the server and when already started. Listens in
 * the capture phase on `pointerdown` (mouse, touch, middle-click) and `click`
 * (keyboard activation) so the href is rewritten before the browser follows
 * it.
 */
export function initAttributionForwarding(
  appOrigin: string = EnvironmentService.apps.app,
): void {
  if (typeof window === 'undefined' || hasInitStarted) {
    return;
  }
  hasInitStarted = true;
  initialAttribution = readAttributionParams(window.location.search);

  const listener = (event: Event) => handleAnchorActivation(appOrigin, event);
  document.addEventListener('pointerdown', listener, true);
  document.addEventListener('click', listener, true);
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetAttributionForwardingForTests(): void {
  hasInitStarted = false;
  initialAttribution = null;
}

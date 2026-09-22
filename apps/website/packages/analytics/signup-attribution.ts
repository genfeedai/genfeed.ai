'use client';

import type { ISignupAttribution } from '@genfeedai/contracts/interfaces';
import {
  appendSignupAttributionParams,
  hasSignupAttribution,
  normalizeSignupLandingPath,
  readSignupAttributionParams,
  resolveExternalReferrerDomain,
} from '@genfeedai/helpers';
import { EnvironmentService } from '@services/core/environment.service';

/**
 * First-touch signup attribution for the marketing site.
 *
 * The site stores nothing on the visitor's device (see `posthog-client.ts`),
 * so the landing source lives in memory only: it survives App Router
 * navigation from the landing page to a sign-up CTA, but not a full reload.
 * Every sign-up link to the app is decorated on interaction, so the dozens of
 * hard-coded CTA hrefs need no per-component wiring.
 */

const SIGNUP_PATH_PREFIX = '/sign-up';
const LINK_INTENT_EVENTS = ['pointerdown', 'click'] as const;

let firstTouch: ISignupAttribution | null = null;
let hasInitStarted = false;

/** The landing page's source: its UTM tags, external referrer and path. */
export function captureSignupFirstTouch(
  location: Pick<Location, 'hostname' | 'pathname' | 'search'>,
  referrer: string,
): ISignupAttribution {
  const attribution = readSignupAttributionParams(
    new URLSearchParams(location.search),
  );
  const referrerDomain = resolveExternalReferrerDomain(
    referrer,
    location.hostname,
  );
  const landingPath = normalizeSignupLandingPath(location.pathname);

  return {
    ...attribution,
    ...(referrerDomain ? { referrerDomain } : {}),
    ...(landingPath ? { landingPath } : {}),
  };
}

/** Add the first-touch source to an app sign-up link; other links are left alone. */
export function decorateSignupLink(
  anchor: HTMLAnchorElement,
  attribution: ISignupAttribution,
  appOrigin: string,
): void {
  if (!hasSignupAttribution(attribution)) {
    return;
  }

  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return;
  }

  if (
    url.origin !== appOrigin ||
    !url.pathname.startsWith(SIGNUP_PATH_PREFIX)
  ) {
    return;
  }

  appendSignupAttributionParams(url, attribution);
  anchor.href = url.toString();
}

function resolveAppOrigin(): string | null {
  try {
    return new URL(EnvironmentService.apps.app).origin;
  } catch {
    return null;
  }
}

function handleLinkIntent(event: Event): void {
  const target = event.target;
  if (!firstTouch || !(target instanceof Element)) {
    return;
  }

  const anchor = target.closest('a[href]');
  const appOrigin = resolveAppOrigin();
  if (anchor instanceof HTMLAnchorElement && appOrigin) {
    decorateSignupLink(anchor, firstTouch, appOrigin);
  }
}

/** Capture the landing source once per page load and watch sign-up links. */
export function initSignupAttribution(): void {
  if (typeof window === 'undefined' || hasInitStarted) {
    return;
  }
  hasInitStarted = true;

  firstTouch = captureSignupFirstTouch(window.location, document.referrer);

  for (const type of LINK_INTENT_EVENTS) {
    document.addEventListener(type, handleLinkIntent, { capture: true });
  }
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetSignupAttributionForTests(): void {
  if (typeof document !== 'undefined') {
    for (const type of LINK_INTENT_EVENTS) {
      document.removeEventListener(type, handleLinkIntent, { capture: true });
    }
  }
  firstTouch = null;
  hasInitStarted = false;
}

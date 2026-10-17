'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useEffect } from 'react';
import { isAgentOnboardingPathname } from '@/lib/navigation/agent-onboarding-path';

// The agent onboarding thread and the expert-path handoff links
// (`/onboarding/positioning`, `/onboarding/first-system`) stay in the flow.
const ONBOARDING_HREF_PATTERN = /(^|\/)onboarding(\/|\?|$)/;

function isLeavingAnchor(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute('href');
  // A link that opens its own tab leaves the onboarding tab where it is.
  if (anchor.target === '_blank') {
    return false;
  }
  if (
    !href ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return false;
  }
  // Sign-out is the one way out: a user on the wrong account or stuck mid-flow
  // must be able to leave.
  if (href === APP_ROUTES.LOGOUT) {
    return false;
  }
  return !ONBOARDING_HREF_PATTERN.test(href);
}

/**
 * While agent onboarding is the route, links (sign-out aside) and the palette /
 * new-task shortcuts cannot leave it. Chrome controls are also disabled at their
 * source; this catches the logo and any link a control still renders.
 */
export default function OnboardingNavigationHold({
  pathname,
}: {
  pathname: string | null;
}) {
  const isHeld = isAgentOnboardingPathname(pathname);

  useEffect(() => {
    if (!isHeld) return;

    const blockPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !isLeavingAnchor(anchor)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const blockKeys = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase() ?? '';
      const hasCommand = event.metaKey || event.ctrlKey;
      if (hasCommand && (key === 'k' || (event.shiftKey && key === 'n'))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key !== 'enter') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !isLeavingAnchor(anchor)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('click', blockPointer, true);
    document.addEventListener('auxclick', blockPointer, true);
    window.addEventListener('keydown', blockKeys, true);
    return () => {
      document.removeEventListener('click', blockPointer, true);
      document.removeEventListener('auxclick', blockPointer, true);
      window.removeEventListener('keydown', blockKeys, true);
    };
  }, [isHeld]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { isAgentOnboardingPathname } from '@/lib/navigation/agent-onboarding-path';

function isLeavingAnchor(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute('href');
  if (
    !href ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return false;
  }
  return !href.includes('/agent/onboarding');
}

/**
 * While agent onboarding is the route, links and the palette / new-task
 * shortcuts cannot leave it. Chrome controls are also disabled at their
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
      const key = event.key.toLowerCase();
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

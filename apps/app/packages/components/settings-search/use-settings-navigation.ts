'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useSettingsNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<[URL, string, number] | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const activeRequestRef = useRef<URL | null>(null);
  const hasArrivedRef = useRef(false);

  const navigate = useCallback(
    (href: string) => {
      cancelRef.current?.();
      hasArrivedRef.current = false;
      const destination = new URL(href, window.location.origin);
      activeRequestRef.current = destination.hash ? destination : null;
      setPending(
        destination.hash
          ? [destination, window.location.pathname, Date.now() + 10_000]
          : null,
      );
      if (destination.hash) {
        router.push(href, { scroll: false });
      } else {
        router.push(href);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!pending) return;
    const [destination, sourcePath, deadline] = pending;
    if (activeRequestRef.current !== destination) return;
    let observer: MutationObserver | null = null;
    let isCancelled = false;
    const dispose = () => {
      isCancelled = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener('popstate', cancel);
      window.removeEventListener('hashchange', cancel);
      if (cancelRef.current === cancel) cancelRef.current = null;
    };
    const cancel = () => {
      activeRequestRef.current = null;
      dispose();
    };
    const timeout = window.setTimeout(
      cancel,
      Math.max(0, deadline - Date.now()),
    );
    cancelRef.current = cancel;
    window.addEventListener('popstate', cancel);
    window.addEventListener('hashchange', cancel);
    const isDestination =
      pathname === destination.pathname &&
      window.location.pathname === destination.pathname;
    if (isDestination) hasArrivedRef.current = true;
    if (
      !isDestination &&
      (hasArrivedRef.current ||
        (pathname !== sourcePath && pathname !== destination.pathname) ||
        (window.location.pathname !== sourcePath &&
          window.location.pathname !== destination.pathname))
    ) {
      cancel();
      return dispose;
    }
    const reveal = () => {
      if (
        isCancelled ||
        pathname !== destination.pathname ||
        window.location.pathname !== destination.pathname
      )
        return;
      const element = document.getElementById(
        decodeURIComponent(destination.hash.slice(1)),
      );
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      cancel();
    };
    observer = new MutationObserver(reveal);
    observer.observe(document.body, {
      attributeFilter: ['id'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    reveal();
    return dispose;
  }, [pathname, pending]);

  return navigate;
}

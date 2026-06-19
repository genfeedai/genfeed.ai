'use client';

import { useEffect } from 'react';

const ACTIVE_MODAL_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-vaul-drawer][data-state="open"]',
].join(',');

const NON_APP_BODY_CHILD_SELECTOR = [
  'script',
  'style',
  'link',
  'meta',
  '[data-radix-portal]',
].join(',');

export interface ModalGlobalSideEffectCleanupOptions {
  force?: boolean;
}

function getDocument(): Document | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document;
}

export function hasActiveModalSurface(
  doc: Document | null = getDocument(),
): boolean {
  if (!doc) {
    return false;
  }

  return Boolean(doc.querySelector(ACTIVE_MODAL_SELECTOR));
}

function cleanupBodyScrollLock(body: HTMLElement): void {
  if (body.style.pointerEvents === 'none') {
    body.style.removeProperty('pointer-events');
  }

  if (body.style.overflow === 'hidden') {
    body.style.removeProperty('overflow');
  }

  if (body.style.touchAction === 'none') {
    body.style.removeProperty('touch-action');
  }

  if (body.hasAttribute('data-scroll-locked')) {
    body.removeAttribute('data-scroll-locked');
    body.style.removeProperty('padding-right');
    body.style.removeProperty('margin-right');
  }
}

function cleanupAppRootLocks(body: HTMLElement): void {
  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child.matches(NON_APP_BODY_CHILD_SELECTOR)) {
      continue;
    }

    if (child.getAttribute('aria-hidden') === 'true') {
      child.removeAttribute('aria-hidden');
    }

    if (child.hasAttribute('inert')) {
      child.removeAttribute('inert');
    }
  }
}

export function cleanupModalGlobalSideEffects(
  options: ModalGlobalSideEffectCleanupOptions = {},
): void {
  const doc = getDocument();

  if (!doc?.body) {
    return;
  }

  if (!options.force && hasActiveModalSurface(doc)) {
    return;
  }

  doc.body.removeAttribute('aria-hidden');
  doc.body.removeAttribute('inert');
  cleanupBodyScrollLock(doc.body);
  cleanupAppRootLocks(doc.body);
}

export function scheduleModalGlobalSideEffectCleanup(
  options: ModalGlobalSideEffectCleanupOptions = {},
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const timeout = window.setTimeout(() => {
    cleanupModalGlobalSideEffects(options);
  }, 0);

  return () => {
    window.clearTimeout(timeout);
  };
}

export function useModalContentGlobalSideEffectCleanup(): void {
  useEffect(
    () => () => {
      scheduleModalGlobalSideEffectCleanup();
    },
    [],
  );
}

export function useRouteModalGlobalSideEffectCleanup(routeKey: string): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: routeKey is the deliberate route-change trigger for stale modal cleanup
  useEffect(() => scheduleModalGlobalSideEffectCleanup(), [routeKey]);

  useEffect(
    () => () => {
      scheduleModalGlobalSideEffectCleanup({ force: true });
    },
    [],
  );
}

import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  // Platform is fixed for the lifetime of the page.
  return () => undefined;
}

function getSnapshot(): boolean {
  return navigator.platform?.includes('Mac') ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True when running on macOS — no post-mount flash. */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

import { useSyncExternalStore } from 'react';

const PHONE_QUERY = '(max-width: 639px)';

function subscribeToPhoneViewport(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePhoneViewport(): boolean {
  return useSyncExternalStore(
    subscribeToPhoneViewport,
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

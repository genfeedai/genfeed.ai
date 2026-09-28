/** How often an open tab re-reads the Admin flags (#5468). */
export const PLATFORM_FLAGS_REFRESH_INTERVAL_MS = 60_000;

/** Event and channel name that tells every open tab to re-read the flags. */
export const PLATFORM_FLAGS_CHANGED = 'genfeed:platform-flags-changed';

/**
 * Tell every shell in this browser — this tab and the others — that an
 * operator just switched a flag, so they re-read it instead of waiting for
 * the next refresh.
 */
export function notifyPlatformFlagsChanged(): void {
  window.dispatchEvent(new Event(PLATFORM_FLAGS_CHANGED));
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }
  const channel = new BroadcastChannel(PLATFORM_FLAGS_CHANGED);
  channel.postMessage('changed');
  channel.close();
}

/** Subscribe to {@link notifyPlatformFlagsChanged} from any tab. */
export function subscribePlatformFlagsChanged(
  onChange: () => void,
): () => void {
  window.addEventListener(PLATFORM_FLAGS_CHANGED, onChange);
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(PLATFORM_FLAGS_CHANGED);
  channel?.addEventListener('message', onChange);

  return () => {
    window.removeEventListener(PLATFORM_FLAGS_CHANGED, onChange);
    channel?.close();
  };
}

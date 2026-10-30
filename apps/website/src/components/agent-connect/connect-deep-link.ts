export const AGENT_CONNECT_HASH = '#connect';

/**
 * `#connect` opens the connect dialog on any page — `/agent#connect`, or a
 * social bio link such as `/x#connect` — unless the page owns a `#connect`
 * setup section (the dedicated agent-client pages), where the hash scrolls.
 */
export function isConnectDeepLink(): boolean {
  return (
    window.location.hash === AGENT_CONNECT_HASH &&
    document.getElementById(AGENT_CONNECT_HASH.slice(1)) === null
  );
}

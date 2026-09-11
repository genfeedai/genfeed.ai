// Canvas pointer/click target helpers

/** React Flow renders connection handles with this class inside every node. */
const HANDLE_SELECTOR = '.react-flow__handle';

/**
 * Whether an event originated on (or inside) a React Flow connection handle.
 *
 * Handle pointer-down handlers don't call `stopPropagation`, so a plain click
 * on a handle still bubbles up to the enclosing node's click handler. Use
 * this to keep handle interactions (starting/ending a connection) from also
 * selecting the node underneath.
 */
export function isEventFromHandle(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest(HANDLE_SELECTOR) !== null;
}

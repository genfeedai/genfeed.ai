import { GROUP_ATTRIBUTE } from '~platforms/ui/menu';
import { GENFEED_HOST_ATTRIBUTE } from '~theme/content-theme';

/**
 * Places whose DOM churn never changes what the content script reacts to: the
 * text the person is typing, and the nodes Genfeed itself put on the page. X
 * re-renders its editor on every keystroke, so reacting to these made the
 * page lag.
 */
const QUIET_SELECTOR = [
  '[contenteditable="true"]',
  '[data-testid^="tweetTextarea"]',
  `[${GROUP_ATTRIBUTE}]`,
  `[${GENFEED_HOST_ATTRIBUTE}]`,
].join(', ');

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

/**
 * Whether a mutation happened inside the composer's editor or inside a node
 * Genfeed injected, and so can be ignored.
 */
export function isQuietMutation(mutation: MutationRecord): boolean {
  const target = elementOf(mutation.target);
  return target !== null && target.closest(QUIET_SELECTOR) !== null;
}

/** The mutations of a batch that are worth reacting to. */
export function meaningfulMutations(
  mutations: readonly MutationRecord[],
): MutationRecord[] {
  return mutations.filter((mutation) => !isQuietMutation(mutation));
}

function addsElements(mutation: MutationRecord): boolean {
  return Array.from(mutation.addedNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE,
  );
}

/**
 * Runs `onChange` at most once per `delayMs` when elements were added somewhere
 * other than the editor or Genfeed's own nodes. It does not wait for quiet,
 * because X's timeline never goes quiet. Returns a function that stops
 * observing.
 */
export function observeAddedElements(
  root: Node,
  onChange: () => void,
  delayMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver((mutations) => {
    if (!meaningfulMutations(mutations).some(addsElements)) {
      return;
    }
    if (timer !== undefined) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, delayMs);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}

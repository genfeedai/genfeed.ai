import type { PlatformConfig } from '~platforms/config';
import { createGenfeedGroup, GROUP_ATTRIBUTE } from '~platforms/ui/menu';
import type { ButtonSkin, MenuGroupSpec } from '~types/genfeed-menu';

const DEFAULT_HEIGHT_PX = 36;
const MIN_HEIGHT_PX = 24;
const MAX_HEIGHT_PX = 48;
const MAX_CLIMB = 8;
const LABEL_SEARCH_DEPTH = 8;

function isRowFlex(element: Element): boolean {
  const style = getComputedStyle(element);
  return (
    style.display.includes('flex') && style.flexDirection.startsWith('row')
  );
}

/**
 * The element to insert beside. Sites built on react-native-web (X) stack
 * every wrapper in a column, so a sibling of the submit button would sit above
 * it. Climb to the ancestor that is a direct child of a row, and put the group
 * there. Nothing is moved or wrapped, so the site's own rendering is untouched.
 */
export function findRowAnchor(submit: Element): Element {
  let current = submit;
  for (let step = 0; step < MAX_CLIMB; step += 1) {
    const parent = current.parentElement;
    if (!parent || parent === document.body) {
      break;
    }
    if (isRowFlex(parent)) {
      return current;
    }
    current = parent;
  }
  return submit;
}

/** Height and corner radius of the site's own submit button, so ours matches. */
export function measureSkin(submit: Element): ButtonSkin {
  const height = Math.round(submit.getBoundingClientRect().height);
  const isMeasured = height >= MIN_HEIGHT_PX && height <= MAX_HEIGHT_PX;
  const resolvedHeight = isMeasured ? height : DEFAULT_HEIGHT_PX;
  const radius = Number.parseFloat(
    getComputedStyle(submit).borderTopLeftRadius,
  );
  return {
    height: resolvedHeight,
    radius: Number.isFinite(radius)
      ? Math.min(radius, resolvedHeight / 2)
      : resolvedHeight / 2,
  };
}

function hasGroup(anchor: Element): boolean {
  return Boolean(
    anchor.parentElement?.querySelector(`:scope > [${GROUP_ATTRIBUTE}]`),
  );
}

/** Puts the Genfeed group on the row of a submit button, once. */
export function mountGenfeedGroup(
  submit: Element,
  groups: MenuGroupSpec[],
): HTMLElement | null {
  const anchor = findRowAnchor(submit);
  if (!anchor.parentElement || hasGroup(anchor)) {
    return null;
  }
  const group = createGenfeedGroup({ groups, skin: measureSkin(submit) });
  anchor.parentElement.insertBefore(group, anchor);
  return group;
}

function visibleText(element: Element): string {
  return (element.textContent ?? '').trim().toLowerCase();
}

/**
 * The submit buttons on the page. Most sites give theirs a selector; the rest
 * are found as the button, inside a reply box's own form, whose text is one of
 * the platform's submit labels.
 */
export function findSubmitButtons(
  platform: PlatformConfig,
  root: ParentNode = document,
): HTMLElement[] {
  const { submitButton, replyTextarea } = platform.selectors;
  if (submitButton) {
    return Array.from(root.querySelectorAll<HTMLElement>(submitButton));
  }
  const labels = platform.submitButtonLabels;
  if (!labels || !replyTextarea) {
    return [];
  }
  const found: HTMLElement[] = [];
  for (const box of root.querySelectorAll<HTMLElement>(replyTextarea)) {
    let scope = box.parentElement;
    for (let depth = 0; scope && depth < LABEL_SEARCH_DEPTH; depth += 1) {
      const button = Array.from(
        scope.querySelectorAll<HTMLElement>('button, [role="button"]'),
      ).find(
        (candidate) =>
          !box.contains(candidate) && labels.includes(visibleText(candidate)),
      );
      if (button) {
        found.push(button);
        break;
      }
      scope = scope.parentElement;
    }
  }
  return found;
}

/** Whether a node, or anything inside it, is something the group attaches to. */
export function mayContainSubmit(
  platform: PlatformConfig,
  node: Element,
): boolean {
  const selector =
    platform.selectors.submitButton ?? platform.selectors.replyTextarea;
  return node.matches(selector) || Boolean(node.querySelector(selector));
}

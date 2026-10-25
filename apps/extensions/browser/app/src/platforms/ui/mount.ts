import type { PlatformConfig } from '~platforms/config';
import { createGenfeedGroup, GROUP_ATTRIBUTE } from '~platforms/ui/menu';
import type { ButtonSkin, MenuGroupSpec } from '~types/genfeed-menu';

const DEFAULT_HEIGHT_PX = 36;
const MIN_HEIGHT_PX = 24;
const MAX_HEIGHT_PX = 48;
const MAX_CLIMB = 8;
const LABEL_SEARCH_DEPTH = 8;
const COMPOSER_SEARCH_DEPTH = 12;

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
export function findRowAnchor(submit: Element, boundary?: Element): Element {
  let current = submit;
  for (let step = 0; step < MAX_CLIMB; step += 1) {
    const parent = current.parentElement;
    if (!parent || parent === document.body || current === boundary) {
      break;
    }
    if (isRowFlex(parent)) {
      return current;
    }
    current = parent;
  }
  return submit;
}

const SOLID_ALPHA = 0.5;
const LIGHT_FOREGROUND = '#ffffff';
const DARK_FOREGROUND = '#0f1419';

function parseRgb(value: string): [number, number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [red, green, blue, alpha = 1] = parts;
  return [red, green, blue, alpha].every(Number.isFinite)
    ? [red, green, blue, alpha]
    : null;
}

function luminance([red, green, blue]: number[]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The host button's fill, and whichever of white or near-black reads on it.
 * Empty when the button has no solid fill to copy.
 */
function measureColors(
  submit: Element,
): Pick<ButtonSkin, 'background' | 'color'> {
  const rgb = parseRgb(getComputedStyle(submit).backgroundColor);
  if (!rgb || rgb[3] < SOLID_ALPHA) {
    return {};
  }
  const [red, green, blue] = rgb;
  return {
    background: `rgb(${red}, ${green}, ${blue})`,
    color: luminance(rgb) > 0.4 ? DARK_FOREGROUND : LIGHT_FOREGROUND,
  };
}

/**
 * Height, corner radius and fill of the site's own submit button, so ours sits
 * level with it and reads as part of the same UI on every platform.
 */
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
    ...measureColors(submit),
  };
}

function hasGroup(anchor: Element): boolean {
  return Boolean(
    anchor.parentElement?.querySelector(`:scope > [${GROUP_ATTRIBUTE}]`),
  );
}

/**
 * The nearest ancestor of a submit button that also holds the reply box: the
 * composer it belongs to. Null for a button that is not part of one, which is
 * when that ancestor is the whole page or holds another submit button too.
 */
export function findComposerScope(
  submit: Element,
  platform: PlatformConfig,
): Element | null {
  const { replyTextarea } = platform.selectors;
  let scope = submit.parentElement;
  for (
    let depth = 0;
    scope && depth < COMPOSER_SEARCH_DEPTH;
    depth += 1, scope = scope.parentElement
  ) {
    if (scope.querySelector(replyTextarea)) {
      const isPageWide = scope === document.body;
      const submits = platform.selectors.submitButton
        ? scope.querySelectorAll(platform.selectors.submitButton).length
        : 1;
      return isPageWide || submits > 1 ? null : scope;
    }
  }
  return null;
}

// The group mounted for each submit button, so a re-render that moves the
// button's row replaces the group instead of adding a second one.
const mountedGroups = new WeakMap<Element, HTMLElement>();

/** Puts the Genfeed group on the row of a submit button, once. */
export function mountGenfeedGroup(
  submit: Element,
  groups: MenuGroupSpec[],
  boundary?: Element,
): HTMLElement | null {
  const anchor = findRowAnchor(submit, boundary);
  const existing = mountedGroups.get(submit);
  if (existing?.isConnected) {
    if (existing.nextElementSibling === anchor) {
      return null;
    }
    existing.remove();
  }
  if (!anchor.parentElement || hasGroup(anchor)) {
    return null;
  }
  const group = createGenfeedGroup({ groups, skin: measureSkin(submit) });
  anchor.parentElement.insertBefore(group, anchor);
  mountedGroups.set(submit, group);
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

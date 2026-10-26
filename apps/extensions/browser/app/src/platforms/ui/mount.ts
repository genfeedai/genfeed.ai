import type { PlatformConfig } from '~platforms/config';
import { createGenfeedGroup, GROUP_ATTRIBUTE } from '~platforms/ui/menu';
import { readHostPalette } from '~theme/host-palette';
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

const ICON_BUTTON_SELECTOR = 'button[aria-label], [role="button"][aria-label]';
const ICON_SIZE_MIN_PX = 24;
const ICON_SIZE_MAX_PX = 48;
// X's icon row is a horizontal scroller with hidden Previous/Next buttons at
// both ends. They are not composer icons: anchoring after "Next" puts the
// group past the scroller, at the far end of the row.
const SCROLLER_NAV_SELECTOR =
  '[data-testid^="ScrollSnap-"][data-testid$="ButtonWrapper"]';

interface MountSlot {
  anchor: Element;
  isAfter: boolean;
  skin: ButtonSkin;
}

/** The last visible icon button of the composer's toolbar, which our button joins. */
function findToolbarIcon(
  boundary: Element,
  platform: PlatformConfig,
): { icon: Element; toolbar: Element } | null {
  const selector = platform.selectors.toolbar;
  const toolbar = selector ? boundary.querySelector(selector) : null;
  if (!toolbar) {
    return null;
  }
  const icons = Array.from(
    toolbar.querySelectorAll(ICON_BUTTON_SELECTOR),
  ).filter((icon) => !icon.closest(SCROLLER_NAV_SELECTOR));
  for (let index = icons.length - 1; index >= 0; index -= 1) {
    const { height } = icons[index].getBoundingClientRect();
    if (height >= ICON_SIZE_MIN_PX && height <= ICON_SIZE_MAX_PX) {
      return { icon: icons[index], toolbar };
    }
  }
  return null;
}

/**
 * Where the group goes: after the last icon of the composer's toolbar, round and
 * in the icons' own colour, or else just before the submit button.
 */
function findMountSlot(
  submit: Element,
  boundary: Element | undefined,
  platform: PlatformConfig | undefined,
): MountSlot {
  const toolbar =
    boundary && platform ? findToolbarIcon(boundary, platform) : null;
  if (toolbar) {
    const height = Math.round(toolbar.icon.getBoundingClientRect().height);
    return {
      anchor: findRowAnchor(toolbar.icon, toolbar.toolbar),
      isAfter: true,
      skin: {
        color: getComputedStyle(toolbar.icon).color,
        height,
        isIcon: true,
        radius: height / 2,
      },
    };
  }
  return {
    anchor: findRowAnchor(submit, boundary),
    isAfter: false,
    skin: platform?.selectors.toolbar
      ? collapsedComposerSkin(submit)
      : measureSkin(submit),
  };
}

/**
 * A composer with an icon row that is collapsed (X's reply box before it is
 * focused) has no icons to copy yet. The group still looks the way it will once
 * the row appears, so the button does not change shape when the user focuses.
 */
function collapsedComposerSkin(submit: Element): ButtonSkin {
  return {
    color: readHostPalette()?.text ?? getComputedStyle(submit).color,
    height: DEFAULT_HEIGHT_PX,
    isIcon: true,
    radius: DEFAULT_HEIGHT_PX / 2,
  };
}

function isInPlace(group: Element, slot: MountSlot): boolean {
  return (
    group.isConnected &&
    (slot.isAfter
      ? group.previousElementSibling === slot.anchor
      : group.nextElementSibling === slot.anchor)
  );
}

// The group mounted for each submit button, so a re-render that moves the
// button's row replaces the group instead of adding a second one.
const mountedGroups = new WeakMap<Element, HTMLElement>();

/**
 * Puts one Genfeed group in a composer, once. Any other group in the same
 * composer, left behind by a re-render, is removed.
 */
export function mountGenfeedGroup(
  submit: Element,
  groups: MenuGroupSpec[],
  boundary?: Element,
  platform?: PlatformConfig,
): HTMLElement | null {
  const slot = findMountSlot(submit, boundary, platform);
  const { anchor } = slot;
  const parent = anchor.parentElement;
  const previous = mountedGroups.get(submit);
  const scope = boundary ?? parent;
  const found = new Set<Element>(
    scope?.querySelectorAll(`[${GROUP_ATTRIBUTE}]`) ?? [],
  );
  if (previous) {
    found.add(previous);
  }
  const placed = Array.from(found).find((group) => isInPlace(group, slot));
  for (const group of found) {
    if (group !== placed) {
      group.remove();
    }
  }
  if (placed || !parent) {
    return null;
  }
  const group = createGenfeedGroup({ groups, skin: slot.skin });
  parent.insertBefore(group, slot.isAfter ? anchor.nextSibling : anchor);
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

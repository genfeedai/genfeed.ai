import { genfeedMark, icons } from '~platforms/ui/icons';
import { createShadowHost, GENFEED_FONT_STACK } from '~platforms/ui/tokens';
import { applyContentThemeToElement } from '~theme/content-theme';
import type {
  GenfeedGroupOptions,
  MenuGroupSpec,
  MenuItemControls,
  MenuItemSpec,
  MenuItemStatus,
} from '~types/genfeed-menu';
import { logger } from '~utils/logger.util';

const STATUS_RESET_MS = 3000;
const MENU_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;
const DEFAULT_HEIGHT_PX = 36;

export const GROUP_ATTRIBUTE = 'data-genfeed-group';

const STATUS_ICONS: Record<MenuItemStatus, string> = {
  busy: icons.spinner,
  done: icons.check,
  error: icons.x,
};

const TRIGGER_CSS = `
  :host {
    all: initial; display: inline-flex; flex: none; align-items: center;
    align-self: center; margin-inline-end: 6px;
  }
  .trigger {
    box-sizing: border-box; display: inline-grid; place-items: center;
    width: var(--gf-height, ${DEFAULT_HEIGHT_PX}px);
    height: var(--gf-height, ${DEFAULT_HEIGHT_PX}px); margin: 0; padding: 0;
    border: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: var(--gf-radius, 9999px); background: transparent;
    color: var(--accent); cursor: pointer; transition: background-color 0.15s;
  }
  .trigger:hover, .trigger[aria-expanded="true"] {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .trigger.native { border-color: transparent; background: var(--gf-bg); color: var(--gf-fg); }
  .trigger.native:hover, .trigger.native[aria-expanded="true"] {
    background: var(--gf-bg); filter: brightness(0.9);
  }
  .trigger.icon { border-color: transparent; background: transparent; color: var(--gf-fg, var(--muted)); }
  .trigger.icon:hover, .trigger.icon[aria-expanded="true"] {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .trigger svg { display: block; width: 20px; height: 20px; }
`;

const MENU_CSS = `
  :host {
    all: initial; position: fixed; z-index: 2147483647;
    font-family: ${GENFEED_FONT_STACK};
  }
  .menu {
    box-sizing: border-box; width: 272px; max-width: calc(100vw - 16px);
    overflow-y: auto; padding: 6px 0; border-radius: 16px;
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    box-shadow: var(--shadow); font-size: 15px; line-height: 20px;
  }
  [hidden] { display: none !important; }
  .group:not([hidden]) ~ .group:not([hidden]) { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
  .label { padding: 6px 16px 4px; color: var(--muted); font-size: 12px; }
  .item {
    box-sizing: border-box; display: flex; align-items: center; gap: 12px;
    width: 100%; min-height: 40px; margin: 0; padding: 0 16px; border: 0;
    background: transparent; color: inherit; font: inherit; font-weight: 500;
    text-align: left; cursor: pointer;
  }
  .item:hover, .item:focus-visible { background: var(--hover); outline: none; }
  .item:disabled { cursor: default; opacity: 0.75; }
  .item svg { flex: none; width: 18px; height: 18px; color: var(--muted); }
  .item[data-status="error"] svg { color: var(--error); }
  .item.nested { padding-left: 46px; }
  .toggle .chevron { display: inline-grid; margin-left: auto; transition: transform 0.15s; }
  .toggle .chevron svg { width: 16px; height: 16px; color: var(--muted); }
  .toggle[aria-expanded="true"] .chevron { transform: rotate(180deg); }
  .item[data-status="busy"] svg { animation: spin 1s linear infinite; }
  .hint { margin-left: auto; color: var(--muted); font-size: 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .item[data-status="busy"] svg { animation: none; }
    .toggle .chevron { transition: none; }
  }
`;

interface MenuItemView {
  button: HTMLButtonElement;
  spec: MenuItemSpec;
}

function setIcon(button: HTMLButtonElement, markup: string): void {
  const slot = button.querySelector('.icon');
  if (slot) {
    slot.innerHTML = markup;
  }
}

function buildItem(spec: MenuItemSpec, onActivate: () => void): MenuItemView {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'item';
  button.setAttribute('role', 'menuitem');
  if (spec.ariaLabel) {
    button.setAttribute('aria-label', spec.ariaLabel);
  }

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.style.display = 'contents';
  const label = document.createElement('span');
  label.className = 'text';
  button.append(icon, label);
  if (spec.hint) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = spec.hint;
    button.appendChild(hint);
  }

  let resetTimer: number | undefined;
  const reset = (): void => {
    window.clearTimeout(resetTimer);
    delete button.dataset.status;
    button.disabled = false;
    setIcon(button, spec.icon);
    label.textContent = spec.label;
  };
  const controls: MenuItemControls = {
    reset,
    setStatus: (status, text) => {
      window.clearTimeout(resetTimer);
      button.dataset.status = status;
      setIcon(button, STATUS_ICONS[status]);
      label.textContent = text;
      button.disabled = status === 'busy';
      if (status !== 'busy') {
        resetTimer = window.setTimeout(reset, STATUS_RESET_MS);
      }
    },
  };

  reset();

  button.addEventListener('click', () => {
    onActivate();
    void Promise.resolve()
      .then(() => spec.run(controls))
      .catch((error: unknown) => {
        logger.error(`Genfeed menu action failed: ${spec.id}`, error);
        controls.setStatus('error', 'Something went wrong');
      });
  });

  return { button, spec };
}

interface BuiltMenu {
  /** Whether no row is left to show, so the menu has nothing to open. */
  isEmpty: () => boolean;
  /** Hides the rows and groups that are not available right now. */
  refresh: () => void;
  items: MenuItemView[];
  menu: HTMLElement;
}

interface MenuSection {
  element: HTMLElement;
  toggle?: HTMLButtonElement;
  views: MenuItemView[];
}

function buildToggle(label: string): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'item toggle';
  toggle.setAttribute('role', 'menuitem');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = label;
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.innerHTML = icons.chevron;
  toggle.append(text, chevron);
  return toggle;
}

function buildMenu(
  groups: MenuGroupSpec[],
  onActivate: () => void,
  onLayout: () => void,
): BuiltMenu {
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Genfeed actions');
  const items: MenuItemView[] = [];
  const sections: MenuSection[] = [];

  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'group';
    section.setAttribute('role', 'group');
    const entry: MenuSection = { element: section, views: [] };
    if (group.label) {
      section.setAttribute('aria-label', group.label);
      if (group.isCollapsible) {
        entry.toggle = buildToggle(group.label);
        section.appendChild(entry.toggle);
      } else {
        const heading = document.createElement('div');
        heading.className = 'label';
        heading.textContent = group.label;
        section.appendChild(heading);
      }
    }
    entry.views = group.items.map((spec) => buildItem(spec, onActivate));
    for (const view of entry.views) {
      if (entry.toggle) {
        view.button.classList.add('nested');
      }
      section.appendChild(view.button);
    }
    items.push(...entry.views);
    sections.push(entry);
    menu.appendChild(section);
  }

  const refresh = (): void => {
    for (const section of sections) {
      const isExpanded = section.toggle
        ? section.toggle.getAttribute('aria-expanded') === 'true'
        : true;
      let hasAvailable = false;
      for (const view of section.views) {
        const isAvailable = view.spec.isAvailable?.() ?? true;
        view.button.hidden = !isAvailable || !isExpanded;
        hasAvailable ||= isAvailable;
      }
      if (section.toggle) {
        section.toggle.hidden = !hasAvailable;
      }
      section.element.hidden = !hasAvailable;
    }
  };

  for (const section of sections) {
    section.toggle?.addEventListener('click', () => {
      const isExpanded =
        section.toggle?.getAttribute('aria-expanded') === 'true';
      section.toggle?.setAttribute('aria-expanded', String(!isExpanded));
      refresh();
      onLayout();
    });
  }

  const isEmpty = (): boolean =>
    sections.every((section) => section.element.hidden);

  return { isEmpty, items, menu, refresh };
}

/**
 * The Genfeed control next to a site's submit button: one logo button, in the
 * host button's own colours, that opens a grouped menu. The button and the menu each live in their own
 * shadow root. The menu is attached to `document.body` while it is open, so
 * the site's stacking, clipping and opacity (X dims the disabled Reply
 * container) cannot touch it.
 */
export function createGenfeedGroup({
  groups,
  skin,
}: GenfeedGroupOptions): HTMLDivElement {
  const { host, root } = createShadowHost({ css: TRIGGER_CSS });
  host.setAttribute(GROUP_ATTRIBUTE, '');
  if (skin) {
    host.style.setProperty('--gf-height', `${skin.height}px`);
    host.style.setProperty('--gf-radius', `${skin.radius}px`);
    if (skin.isIcon && skin.color) {
      host.style.setProperty('--gf-fg', skin.color);
    } else if (skin.background && skin.color) {
      host.style.setProperty('--gf-bg', skin.background);
      host.style.setProperty('--gf-fg', skin.color);
    }
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = skin?.isIcon
    ? 'trigger icon'
    : skin?.background
      ? 'trigger native'
      : 'trigger';
  trigger.title = 'Genfeed';
  trigger.setAttribute('aria-label', 'Genfeed actions');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = genfeedMark;
  root.appendChild(trigger);

  const { host: menuHost, root: menuRoot } = createShadowHost({
    css: MENU_CSS,
  });
  let built: BuiltMenu | null = null;
  let isOpen = false;

  const place = (): void => {
    const menuElement = built?.menu;
    if (!menuElement) {
      return;
    }
    const anchor = trigger.getBoundingClientRect();
    const below =
      window.innerHeight - anchor.bottom - MENU_GAP_PX - VIEWPORT_MARGIN_PX;
    const above = anchor.top - MENU_GAP_PX - VIEWPORT_MARGIN_PX;
    const wantsHeight = menuElement.scrollHeight;
    const isAbove = wantsHeight > below && above > below;
    const room = Math.max(120, isAbove ? above : below);
    menuElement.style.maxHeight = `${room}px`;
    const width = menuElement.offsetWidth;
    const height = Math.min(wantsHeight, room);
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        anchor.right - width,
        window.innerWidth - width - VIEWPORT_MARGIN_PX,
      ),
    );
    menuHost.style.left = `${left}px`;
    menuHost.style.top = `${
      isAbove ? anchor.top - MENU_GAP_PX - height : anchor.bottom + MENU_GAP_PX
    }px`;
  };

  const onOutsidePress = (event: Event): void => {
    const path = event.composedPath();
    if (!path.includes(menuHost) && !path.includes(host)) {
      close();
    }
  };
  const onViewportChange = (): void => {
    if (!host.isConnected) {
      close();
      return;
    }
    place();
  };

  function close(restoreFocus = false): void {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    trigger.setAttribute('aria-expanded', 'false');
    menuHost.remove();
    document.removeEventListener('pointerdown', onOutsidePress, true);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    if (restoreFocus) {
      trigger.focus();
    }
  }

  function open(focusFirst: boolean): void {
    if (isOpen) {
      return;
    }
    if (!built) {
      built = buildMenu(groups, () => close(), place);
      menuRoot.appendChild(built.menu);
    }
    built.refresh();
    if (built.isEmpty()) {
      return;
    }
    applyContentThemeToElement(menuHost);
    menuHost.style.visibility = 'hidden';
    document.body.appendChild(menuHost);
    place();
    menuHost.style.visibility = '';
    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutsidePress, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    if (focusFirst) {
      menuRoot.querySelector<HTMLButtonElement>('.item:not([hidden])')?.focus();
    }
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen) {
      close();
    } else {
      open(event.detail === 0);
    }
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault();
      open(true);
    }
  });

  menuRoot.addEventListener('keydown', (event) => {
    const keyEvent = event as KeyboardEvent;
    const enabled = Array.from(
      menuRoot.querySelectorAll<HTMLButtonElement>('button.item'),
    ).filter((item) => !item.disabled && !item.hidden);
    const index = enabled.indexOf(menuRoot.activeElement as HTMLButtonElement);
    const focusAt = (next: number): void => {
      keyEvent.preventDefault();
      enabled[(next + enabled.length) % enabled.length]?.focus();
    };
    switch (keyEvent.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index === -1 ? -1 : index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(-1);
        break;
      case 'Escape':
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  });

  return host;
}

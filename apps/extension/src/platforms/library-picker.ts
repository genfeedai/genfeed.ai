import { activateComposer } from '~platforms/composer-helpers';
import type { PlatformConfig } from '~platforms/config';
import { attachMediaToComposer } from '~platforms/media-attach';
import { icons } from '~platforms/ui/icons';
import { showToast } from '~platforms/ui/toast';
import { createShadowHost, GENFEED_FONT_STACK } from '~platforms/ui/tokens';
import type { PageLibraryItem } from '~types/extension';

const PICKER_ID = 'genfeed-library-picker';
const PICKER_WIDTH_PX = 320;
const VIEWPORT_MARGIN_PX = 12;
const ANCHOR_GAP_PX = 8;

const PICKER_CSS = `
  :host { all: initial; position: fixed; z-index: 2147483646; font-family: ${GENFEED_FONT_STACK}; }
  .panel {
    box-sizing: border-box; width: ${PICKER_WIDTH_PX}px; max-height: 420px; overflow: auto;
    padding: 12px; border-radius: 16px; border: 1px solid var(--border);
    background: var(--card); color: var(--text); box-shadow: var(--shadow);
  }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 700; }
  .close {
    display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
    border: 0; border-radius: 9999px; background: transparent; color: var(--muted); cursor: pointer;
  }
  .close:hover, .close:focus-visible { background: var(--hover); outline: none; }
  .close svg { width: 18px; height: 18px; }
  .note { margin: 4px 0 8px; color: var(--muted); font-size: 13px; line-height: 18px; }
  .note[data-error] { color: var(--error); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .tile {
    position: relative; aspect-ratio: 1; padding: 0; overflow: hidden; cursor: pointer;
    border: 1px solid var(--border); border-radius: 10px; background: var(--hover); color: var(--muted);
  }
  .tile:hover, .tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .tile:disabled { cursor: progress; opacity: 0.6; }
  .tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .tile .placeholder { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
  .tile .badge {
    position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 9999px;
    background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 11px; font-weight: 600;
  }
  .open {
    margin-top: 8px; padding: 6px 14px; border: 1px solid var(--border); border-radius: 9999px;
    background: transparent; color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .open:hover, .open:focus-visible { background: var(--hover); outline: none; }
`;

interface PickerResponse {
  dataUrl?: string;
  error?: string;
  filename?: string;
  items?: PageLibraryItem[];
  success?: boolean;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Places the picker beside the menu's button, inside the viewport. */
function place(host: HTMLElement, anchor: Element | null): void {
  const rect = anchor?.getBoundingClientRect();
  const width = Math.min(
    PICKER_WIDTH_PX,
    window.innerWidth - 2 * VIEWPORT_MARGIN_PX,
  );
  const left = rect
    ? Math.min(
        Math.max(rect.right - width, VIEWPORT_MARGIN_PX),
        window.innerWidth - width - VIEWPORT_MARGIN_PX,
      )
    : (window.innerWidth - width) / 2;
  host.style.left = `${left}px`;
  if (rect && rect.top > window.innerHeight / 2) {
    host.style.bottom = `${window.innerHeight - rect.top + ANCHOR_GAP_PX}px`;
  } else {
    host.style.top = `${(rect?.bottom ?? VIEWPORT_MARGIN_PX) + ANCHOR_GAP_PX}px`;
  }
}

/**
 * A small grid of the active brand's Library images and videos, opened from the
 * page menu. Picking one attaches it to the reply box the way a person would,
 * and posts nothing. A site that cannot take the file gets an Open asset button.
 */
export function openLibraryPicker(
  platform: PlatformConfig | null,
  anchor: Element | null,
): void {
  document.getElementById(PICKER_ID)?.remove();
  const { host, root } = createShadowHost({ css: PICKER_CSS, id: PICKER_ID });
  const panel = element('div', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Attach from Library');
  const head = element('div', 'head');
  const close = element('button', 'close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = icons.x;
  head.append(element('span', 'title', 'Attach from Library'), close);
  const note = element('p', 'note', 'Loading your Library…');
  note.setAttribute('role', 'status');
  const grid = element('div', 'grid');
  panel.append(head, note, grid);
  root.appendChild(panel);
  place(host, anchor);
  document.body.appendChild(host);

  const dismiss = (): void => {
    host.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') dismiss();
  };
  const onOutside = (event: PointerEvent): void => {
    if (!event.composedPath().includes(host)) dismiss();
  };
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);

  const showNote = (text: string, isError = false): void => {
    note.textContent = text;
    note.toggleAttribute('data-error', isError);
    note.setAttribute('role', isError ? 'alert' : 'status');
    note.hidden = false;
  };

  const offerOpen = (item: PageLibraryItem, message: string): void => {
    showNote(message, true);
    panel.querySelector('.open')?.remove();
    const open = element('button', 'open', 'Open asset');
    open.type = 'button';
    open.addEventListener('click', () => {
      void chrome.runtime.sendMessage({
        event: 'pageLibraryOpen',
        reference: item.reference,
      });
      dismiss();
    });
    note.after(open);
  };

  const attach = async (
    item: PageLibraryItem,
    tile: HTMLButtonElement,
  ): Promise<void> => {
    for (const other of grid.querySelectorAll('button')) other.disabled = true;
    showNote(`Attaching ${item.kind}…`);
    try {
      const response = (await chrome.runtime.sendMessage({
        event: 'pageLibraryFile',
        reference: item.reference,
      })) as PickerResponse | undefined;
      if (!response?.success || !response.dataUrl || !response.filename) {
        offerOpen(item, response?.error ?? 'Could not download this asset.');
        return;
      }
      await activateComposer(platform);
      const outcome = await attachMediaToComposer(
        platform,
        response.dataUrl,
        response.filename,
      );
      if (outcome === 'attached') {
        showToast(`Added the ${item.kind} to the reply box. Review and post.`);
        dismiss();
        return;
      }
      offerOpen(item, `This site can't take the ${item.kind} here.`);
    } finally {
      for (const other of grid.querySelectorAll('button'))
        other.disabled = false;
      tile.blur();
    }
  };

  const render = (items: PageLibraryItem[]): void => {
    if (items.length === 0) {
      showNote("This brand's Library has no images or videos yet.");
      return;
    }
    note.hidden = true;
    for (const item of items) {
      const tile = element('button', 'tile');
      tile.type = 'button';
      tile.title = item.title;
      tile.setAttribute('aria-label', `Attach ${item.kind}: ${item.title}`);
      if (item.thumbnail) {
        const image = element('img');
        image.src = item.thumbnail;
        image.alt = '';
        tile.appendChild(image);
      } else {
        const placeholder = element('span', 'placeholder');
        placeholder.innerHTML =
          item.kind === 'video' ? icons.video : icons.image;
        tile.appendChild(placeholder);
      }
      if (item.kind === 'video')
        tile.appendChild(element('span', 'badge', 'Video'));
      tile.addEventListener('click', () => {
        void attach(item, tile);
      });
      grid.appendChild(tile);
    }
  };

  void chrome.runtime
    .sendMessage({ event: 'pageLibraryList' })
    .then((response: PickerResponse | undefined) => {
      if (!host.isConnected) return;
      if (!response?.success || !response.items) {
        showNote(response?.error ?? 'Could not load your Library.', true);
        return;
      }
      render(response.items);
    })
    .catch(() => {
      if (host.isConnected)
        showNote('Could not reach Genfeed. Refresh this tab.', true);
    });
}

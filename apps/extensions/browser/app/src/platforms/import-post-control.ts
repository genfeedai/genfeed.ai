import type { PlatformConfig } from '~platforms/config';
import { createSaveButton } from '~platforms/ui-helpers';

interface ImportMenuOptions {
  dropdown: HTMLElement;
  platform: string;
  postId: string;
  postUrl: string;
}

function isSafePostId(postId: string): boolean {
  return /^[\w:-]+$/.test(postId);
}

async function sendImport(
  postId: string,
  platform: string,
  postUrl: string,
): Promise<{ deduplicated?: boolean; error?: string; success?: boolean }> {
  const response = await chrome.runtime.sendMessage({
    event: 'savePost',
    platform,
    postId,
    url: postUrl,
  });
  return response ?? { success: false };
}

function setMenuState(
  item: HTMLButtonElement,
  label: string,
  isDisabled: boolean,
): void {
  item.disabled = isDisabled;
  item.textContent = label;
}

/** First menu item. Uses the same savePost contract as the button. */
export function attachImportMenuItem({
  dropdown,
  platform,
  postId,
  postUrl,
}: ImportMenuOptions): void {
  const menu = dropdown.querySelector('.genfeed-dropdown-menu');
  if (!menu || menu.querySelector('[data-genfeed-import-menu]')) {
    return;
  }
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'genfeed-menu-item';
  item.dataset.genfeedImportMenu = 'true';
  item.textContent = 'Import post';
  item.addEventListener('click', async (event) => {
    event.stopPropagation();
    menu.classList.remove('active');
    setMenuState(item, 'Importing…', true);
    try {
      const response = await sendImport(postId, platform, postUrl);
      if (response.success) {
        setMenuState(
          item,
          response.deduplicated ? 'Already imported' : 'Imported',
          false,
        );
        return;
      }
      setMenuState(item, response.error || 'Import failed', false);
    } catch {
      setMenuState(item, 'Import failed', false);
    }
  });
  menu.prepend(item);
}

/** Bookmark control on the viewed post. Production previously had no caller. */
export function attachViewedPostImport(
  platform: PlatformConfig,
  platformName: string,
): void {
  const postId = platform.extractPostId();
  if (!postId || !isSafePostId(postId)) {
    return;
  }
  if (document.querySelector(`[data-genfeed-import="${postId}"]`)) {
    return;
  }
  const actions = platform.selectors.actionsContainer
    ? document.querySelector(platform.selectors.actionsContainer)
    : null;
  if (!actions) {
    return;
  }
  const button = createSaveButton(
    postId,
    platformName,
    platform.constructPostUrl(postId),
  );
  button.dataset.genfeedImport = postId;
  actions.appendChild(button);
}

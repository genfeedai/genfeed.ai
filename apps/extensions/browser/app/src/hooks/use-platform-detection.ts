import { useEffect } from 'react';

import { usePlatformStore } from '~store/use-platform-store';
import type { PagePost } from '~types/extension';

interface PlatformDetectedPayload {
  composeBoxAvailable?: boolean;
  pageContext?: {
    post?: PagePost;
    postAuthor?: string;
    postContent?: string;
    url?: string;
  };
  platform?: string;
  url?: string;
}

/**
 * Keeps the panel on the page in the active tab: the page reports itself as it
 * navigates, and the panel asks again whenever the user switches tabs.
 */
export function usePlatformDetection(): void {
  const setPlatform = usePlatformStore((s) => s.setPlatform);
  const setPageContext = usePlatformStore((s) => s.setPageContext);
  const setComposeBoxAvailable = usePlatformStore(
    (s) => s.setComposeBoxAvailable,
  );

  useEffect(() => {
    let isDisposed = false;

    function applyPage(payload: PlatformDetectedPayload): void {
      setPlatform(payload.platform ?? null);
      setPageContext(payload.pageContext ?? { url: payload.url });
      if (payload.composeBoxAvailable !== undefined) {
        setComposeBoxAvailable(payload.composeBoxAvailable);
      }
    }

    function handleMessage(
      message: { type?: string; payload?: PlatformDetectedPayload },
      sender: chrome.runtime.MessageSender,
    ): void {
      // A tab in the background reports too; only the one in view counts.
      if (
        message.type === 'PLATFORM_DETECTED' &&
        message.payload &&
        sender.tab?.active !== false
      ) {
        applyPage(message.payload);
      }
    }

    async function readActiveTab(): Promise<void> {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) return;
        const response: PlatformDetectedPayload | undefined =
          await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
        if (!isDisposed && response?.pageContext) {
          applyPage(response);
        }
      } catch {
        // A page without the content script (a new tab, the web store) has no
        // post and no platform; the panel keeps working without them.
        if (!isDisposed) {
          setPlatform(null);
          setPageContext({});
          setComposeBoxAvailable(false);
        }
      }
    }

    function handleActivated(): void {
      void readActiveTab();
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.tabs.onActivated?.addListener(handleActivated);
    void readActiveTab();
    return () => {
      isDisposed = true;
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.tabs.onActivated?.removeListener(handleActivated);
    };
  }, [setPlatform, setPageContext, setComposeBoxAvailable]);
}

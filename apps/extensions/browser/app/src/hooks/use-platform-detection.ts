import { useEffect } from 'react';

import { usePlatformStore } from '~store/use-platform-store';

export function usePlatformDetection(): void {
  const setPlatform = usePlatformStore((s) => s.setPlatform);
  const setPageContext = usePlatformStore((s) => s.setPageContext);
  const setCanSubmitFromComposer = usePlatformStore(
    (s) => s.setCanSubmitFromComposer,
  );
  const setComposeBoxAvailable = usePlatformStore(
    (s) => s.setComposeBoxAvailable,
  );
  const setSubmitButtonAvailable = usePlatformStore(
    (s) => s.setSubmitButtonAvailable,
  );

  useEffect(() => {
    function handleMessage(
      message: {
        type?: string;
        payload?: {
          platform?: string;
          url?: string;
          pageContext?: {
            url?: string;
            postContent?: string;
            postAuthor?: string;
          };
          composeBoxAvailable?: boolean;
          submitButtonAvailable?: boolean;
          canSubmitFromComposer?: boolean;
        };
      },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void,
    ): void {
      if (message.type === 'PLATFORM_DETECTED' && message.payload) {
        setPlatform(message.payload.platform ?? null);
        if (message.payload.pageContext) {
          setPageContext(message.payload.pageContext);
        }
        if (message.payload.composeBoxAvailable !== undefined) {
          setComposeBoxAvailable(message.payload.composeBoxAvailable);
        }
        if (message.payload.submitButtonAvailable !== undefined) {
          setSubmitButtonAvailable(message.payload.submitButtonAvailable);
        }
        if (message.payload.canSubmitFromComposer !== undefined) {
          setCanSubmitFromComposer(message.payload.canSubmitFromComposer);
        }
      }

      if (message.type === 'CONTENT_INSERTED') {
        // Content was inserted successfully - could update UI state here
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [
    setPlatform,
    setPageContext,
    setComposeBoxAvailable,
    setSubmitButtonAvailable,
    setCanSubmitFromComposer,
  ]);
}

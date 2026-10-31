import type { ExtensionWorkspaceState } from '@genfeedai/contracts/interfaces';
import { create } from 'zustand';
import {
  getWorkspaceState,
  subscribeWorkspace,
} from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';

export const useWorkspaceStore = create<ExtensionWorkspaceState>(() =>
  getWorkspaceState(),
);
subscribeWorkspace((state) => {
  if (state.status === 'loading') {
    useBrandStore.setState({
      activeBrandId: null,
      brands: [],
      brandVoice: null,
    });
    useChatStore.setState({
      activeThreadId: null,
      messages: [],
      threads: [],
      isGenerating: false,
      error: null,
    });
    usePlatformStore.setState({
      pageContext: {},
      currentPlatform: null,
      composeBoxAvailable: false,
    });
  }
  useWorkspaceStore.setState(state, true);
});

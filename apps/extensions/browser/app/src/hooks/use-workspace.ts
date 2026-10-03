import { useEffect, useRef } from 'react';
import { loadWorkspace } from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function useWorkspace() {
  const state = useWorkspaceStore();
  const appliedRevision = useRef<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const reload = () => {
      void loadWorkspace({
        forceRefresh: true,
        signal: controller.signal,
      }).catch(() => undefined);
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.extension_workspace_changed)
        void loadWorkspace({
          forceRefresh: true,
          isStoredSelectionPreferred: true,
          signal: controller.signal,
        }).catch(() => undefined);
      else if (changes.genfeed_token && !changes.genfeed_token.newValue)
        reload();
    };
    reload();
    window.addEventListener('focus', reload);
    chrome.storage.onChanged.addListener(changed);
    return () => {
      controller.abort();
      window.removeEventListener('focus', reload);
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  useEffect(() => {
    if (state.status === 'refreshing' || state.status === 'blocked') return;
    const nextRevision =
      state.status === 'ready' ? state.snapshot.revision : null;
    if (state.status === 'ready' && appliedRevision.current === nextRevision) {
      useBrandStore.setState({
        brands: state.snapshot.brands.map((brand) => ({
          ...brand,
          handle: brand.slug,
        })),
      });
      return;
    }
    appliedRevision.current = nextRevision;
    useBrandStore.setState({
      activeBrandId: state.status === 'ready' ? state.snapshot.brandId : null,
      brands:
        state.status === 'ready'
          ? state.snapshot.brands.map((brand) => ({
              ...brand,
              handle: brand.slug,
            }))
          : [],
      brandVoice: null,
    });
    useChatStore.setState({
      activeThreadId: null,
      messages: [],
      threads: [],
      isGenerating: false,
      error: null,
    });
    if (state.status === 'ready' && state.snapshot.brandId)
      void chrome.runtime
        .sendMessage({
          event: 'captureSetBrand',
          brandId: state.snapshot.brandId,
        })
        .catch(() => undefined);
  }, [state]);
  return state;
}

import { create } from 'zustand';

interface PageContext {
  url?: string;
  postContent?: string;
  postAuthor?: string;
}

interface PlatformState {
  currentPlatform: string | null;
  pageContext: PageContext;
  canSubmitFromComposer: boolean;
  composeBoxAvailable: boolean;
  submitButtonAvailable: boolean;
}

interface PlatformActions {
  setPlatform: (platform: string | null) => void;
  setPageContext: (context: PageContext) => void;
  setCanSubmitFromComposer: (canSubmit: boolean) => void;
  setComposeBoxAvailable: (available: boolean) => void;
  setSubmitButtonAvailable: (available: boolean) => void;
}

export const usePlatformStore = create<PlatformState & PlatformActions>(
  (set) => ({
    canSubmitFromComposer: false,
    composeBoxAvailable: false,
    currentPlatform: null,
    pageContext: {},
    setCanSubmitFromComposer: (canSubmit) =>
      set({ canSubmitFromComposer: canSubmit }),
    setComposeBoxAvailable: (available) =>
      set({ composeBoxAvailable: available }),
    setPageContext: (context) => set({ pageContext: context }),
    setPlatform: (platform) => set({ currentPlatform: platform }),
    setSubmitButtonAvailable: (available) =>
      set({ submitButtonAvailable: available }),
    submitButtonAvailable: false,
  }),
);

import { create } from 'zustand';

interface PageContext {
  url?: string;
  postContent?: string;
  postAuthor?: string;
}

interface PlatformState {
  currentPlatform: string | null;
  pageContext: PageContext;
  composeBoxAvailable: boolean;
}

interface PlatformActions {
  setPlatform: (platform: string | null) => void;
  setPageContext: (context: PageContext) => void;
  setComposeBoxAvailable: (available: boolean) => void;
}

export const usePlatformStore = create<PlatformState & PlatformActions>(
  (set) => ({
    composeBoxAvailable: false,
    currentPlatform: null,
    pageContext: {},
    setComposeBoxAvailable: (available) =>
      set({ composeBoxAvailable: available }),
    setPageContext: (context) => set({ pageContext: context }),
    setPlatform: (platform) => set({ currentPlatform: platform }),
  }),
);

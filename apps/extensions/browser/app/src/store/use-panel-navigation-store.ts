import { create } from 'zustand';
import type { ActiveTab } from '~components/navigation/SidebarNav';

interface PanelNavigationState {
  clearRequest: () => void;
  /** A tab a component inside the panel asked to open, until the panel consumes it. */
  requestedTab: ActiveTab | null;
  requestTab: (tab: ActiveTab) => void;
}

/** Lets a component deep in the side panel (an error with "Provider settings") switch tabs. */
export const usePanelNavigationStore = create<PanelNavigationState>((set) => ({
  clearRequest: () => set({ requestedTab: null }),
  requestedTab: null,
  requestTab: (requestedTab) => set({ requestedTab }),
}));

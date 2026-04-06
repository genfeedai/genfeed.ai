import { create } from 'zustand';

type ConfirmationAction = (() => Promise<void> | void) | null;

interface RunWorkflowConfirmationStore {
  isOpen: boolean;
  pendingAction: ConfirmationAction;
  requestConfirmation: (action: Exclude<ConfirmationAction, null>) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
  reset: () => void;
}

export const useRunWorkflowConfirmationStore =
  create<RunWorkflowConfirmationStore>((set, get) => ({
    cancel: () => {
      set({ isOpen: false, pendingAction: null });
    },

    confirm: async () => {
      const { pendingAction } = get();

      set({ isOpen: false, pendingAction: null });

      if (pendingAction) {
        await pendingAction();
      }
    },

    isOpen: false,
    pendingAction: null,

    requestConfirmation: (action) => {
      set({ isOpen: true, pendingAction: action });
    },

    reset: () => {
      set({ isOpen: false, pendingAction: null });
    },
  }));

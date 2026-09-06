export type Props = {
  isSaving: boolean;
  isVisible: boolean;
  isLoading: boolean;
  streakFreezes: number;
  completedCount: number;
  totalCount: number;
  setVisibility: (visible: boolean) => Promise<void>;
};

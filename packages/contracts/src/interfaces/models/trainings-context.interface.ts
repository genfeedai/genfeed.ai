export interface ITrainingsContextType {
  refreshTrainings: (() => void) | null;
  isRefreshing: boolean;
  setRefreshTrainings: (fn: (() => Promise<void>) | null) => void;
}

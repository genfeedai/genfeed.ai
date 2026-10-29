export interface UseConnectCardDismissalResult {
  dismiss: () => void;
  /** `null` until storage has been read. */
  isDismissed: boolean | null;
}

export type TrialCardClaimCardProps = {
  /** Called after the trial credits are paid so balances can refresh. */
  onClaimed?: () => void | Promise<void>;
};

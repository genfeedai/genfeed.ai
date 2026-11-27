/** One Google Ads account a pending connection can choose. */
export interface IGoogleAdsAccount {
  /** Customer id, `123-456-7890`. */
  id: string;
  name: string;
  /** Another live credential of the brand already holds this account. */
  isAlreadyConnected: boolean;
  /** The manager account this account is reached through, when it is. */
  managerId?: string;
  managerName?: string;
}

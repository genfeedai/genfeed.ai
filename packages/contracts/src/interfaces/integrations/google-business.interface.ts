/** One Google Business Profile location a pending connection can choose. */
export interface IGoogleBusinessLocation {
  /** `accounts/{accountId}/locations/{locationId}`. */
  id: string;
  title: string;
  /** One line of the storefront address, to tell same-named locations apart. */
  address?: string;
  /** Another live credential of the brand already holds this location. */
  isAlreadyConnected: boolean;
}

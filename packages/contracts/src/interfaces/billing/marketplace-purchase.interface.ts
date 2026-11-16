/** What a buyer gets back after paying for a marketplace listing with credits. */
export interface IMarketplaceCreditPurchaseResult {
  /** Credits taken from the buyer's organization. */
  creditsPaid: number;
  listingId: string;
  /** The completed purchase in the marketplace; the item is now in the library. */
  purchaseId: string;
}

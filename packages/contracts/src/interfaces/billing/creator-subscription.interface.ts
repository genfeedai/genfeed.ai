import type { CreatorSubscriptionStatus } from '../../enums/credit.enum';

/** A creator brand's paid subscription offer, as its organization manages it. */
export interface ICreatorSubscriptionPlan {
  activeSubscribers: number;
  brandId: string;
  handle: string;
  isEnabled: boolean;
  label: string;
  /** Null until the creator sets a price. */
  monthlyPriceCredits: number | null;
}

export interface IUpdateCreatorSubscriptionPlanRequest {
  isEnabled: boolean;
  monthlyPriceCredits: number;
}

/** One reader's subscription to one creator. */
export interface ICreatorSubscriptionSummary {
  brandId: string;
  cancelAtPeriodEnd: boolean;
  creatorHandle: string;
  creatorLabel: string;
  currentPeriodEnd: string;
  id: string;
  priceCredits: number;
  status: CreatorSubscriptionStatus;
}

/** What the support page offers a reader: the price, and their subscription. */
export interface ICreatorSubscriptionOffer {
  /** Null when the creator has no paid subscription on offer. */
  monthlyPriceCredits: number | null;
  subscription: ICreatorSubscriptionSummary | null;
}

export interface ISubscribeToCreatorRequest {
  handle: string;
  idempotencyKey: string;
}

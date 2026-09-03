import type { IStripePrice, IStripeUrl } from '@genfeedai/contracts/interfaces';

export class StripePrice implements IStripePrice {
  declare public id: string;
  declare public product: string;
  declare public label: string;
  declare public unitAmount: number;
  declare public interval: string;
  declare public currency: string;
  declare public description?: string;
  declare public price?: number;
  declare public features?: string[];

  constructor(data: Partial<IStripePrice> = {}) {
    Object.assign(this, data);
  }
}

export class StripeUrl implements IStripeUrl {
  declare public id: string;
  declare public customer: string;
  declare public status: string;
  declare public url: string;
  declare public expiresAt: string;

  constructor(data: Partial<IStripeUrl> = {}) {
    Object.assign(this, data);
  }
}

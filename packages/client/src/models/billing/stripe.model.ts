import type { IStripePrice, IStripeUrl } from '@genfeedai/interfaces';

export class StripePrice implements IStripePrice {
  public declare id: string;
  public declare product: string;
  public declare label: string;
  public declare unitAmount: number;
  public declare interval: string;
  public declare currency: string;
  public declare description?: string;
  public declare price?: number;
  public declare features?: string[];

  constructor(data: Partial<IStripePrice> = {}) {
    Object.assign(this, data);
  }
}

export class StripeUrl implements IStripeUrl {
  public declare id: string;
  public declare customer: string;
  public declare status: string;
  public declare url: string;
  public declare expiresAt: string;

  constructor(data: Partial<IStripeUrl> = {}) {
    Object.assign(this, data);
  }
}

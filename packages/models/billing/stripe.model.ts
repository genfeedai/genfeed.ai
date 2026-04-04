import {
  StripePrice as BaseStripePrice,
  StripeUrl as BaseStripeUrl,
} from '@genfeedai/client/models';

export class StripePrice extends BaseStripePrice {
  constructor(partial: Partial<BaseStripePrice> = {}) {
    super(partial);

    this.description =
      this.interval === 'month' ? 'Unlimited usage per month' : 'Pay as you go';
    this.price = this.unitAmount / 100;
    this.features =
      this.interval === 'month'
        ? [
            'Unlimited usage per month',
            'Unlimited usage per month',
            'Unlimited usage per month',
          ]
        : ['no roll over'];
  }
}

export class StripeUrl extends BaseStripeUrl {}

import type { IUrlResponse } from '../index';

export interface IStripePrice {
  id: string;
  product: string;
  label: string;
  description?: string;
  price?: number;
  unitAmount: number;
  interval: string;
  currency: string;
  features?: string[];
}

export interface IStripeUrl extends IUrlResponse {
  id: string;
  customer: string;
  status: string;
  expiresAt: string;
}

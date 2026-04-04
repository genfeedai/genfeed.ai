import type { IUrlResponse } from '../index';

export interface ICreateCheckoutDto {
  listingId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface ICheckoutResponse extends IUrlResponse {
  sessionId: string;
}

export interface IClaimFreeResponse {
  purchaseId: string;
  message: string;
}

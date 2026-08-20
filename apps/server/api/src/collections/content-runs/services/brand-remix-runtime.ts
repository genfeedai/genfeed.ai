import { randomUUID } from 'node:crypto';

export const BRAND_REMIX_RUNTIME = Symbol('BRAND_REMIX_RUNTIME');

export interface BrandRemixRuntime {
  now(): Date;
  randomId(): string;
}

export const systemBrandRemixRuntime: BrandRemixRuntime = {
  now: () => new Date(),
  randomId: () => randomUUID(),
};

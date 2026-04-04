// Interfaces
export type { IEnvConfig } from './interfaces/env-config.interface';
export * from './schemas';
export type { ConfigServiceOptions } from './services/base-config.service';
// Services
export { BaseConfigService } from './services/base-config.service';

// License & Edition
export { isEEEnabled, isCloudConnected } from './license';

// Pricing
export { getPricingConfig } from './pricing';
export type { PricingConfig } from './pricing';

// Deployment
export type { ClientSurface, Deployment } from './deployment';
export {
  envFlag,
  getClientSurface,
  getDeployment,
  isCloudDeployment,
  isCommunity,
  isDesktopClient,
  isSaaS,
  isSelfHostedDeployment,
} from './deployment';
export {
  conditionalRequired,
  conditionalRequiredNumber,
  SELF_HOSTED_REQUIRED,
} from './helpers';
// Interfaces
export type { IEnvConfig } from './interfaces/env-config.interface';
// License & Edition
export { isEEEnabled } from './license';
export type { PricingConfig } from './pricing';
// Pricing
export { getPricingConfig } from './pricing';
export * from './schemas';
export type { ConfigServiceOptions } from './services/base-config.service';
// Services
export { BaseConfigService } from './services/base-config.service';
export type { CreateServiceConfigOptions } from './services/create-service-config';
export { createServiceConfig } from './services/create-service-config';

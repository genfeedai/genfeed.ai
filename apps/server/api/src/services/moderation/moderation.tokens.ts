import type {
  IModerationProvider,
  ModerationProviderName,
} from '@genfeedai/contracts/interfaces';

/** Every moderation adapter this process can bind, keyed by provider name. */
export type ModerationProviders = Readonly<
  Record<ModerationProviderName, IModerationProvider>
>;

/**
 * DI token for {@link ModerationProviders} (#4880). The `moderation`
 * PostHog flag picks one per job (#5468), so switching needs no restart.
 */
export const MODERATION_PROVIDERS = Symbol('MODERATION_PROVIDERS');

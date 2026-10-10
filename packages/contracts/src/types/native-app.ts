/**
 * Native app vocabulary (#5502), kept in a leaf module so the app catalog
 * constants and their interfaces can both use it without importing each other.
 * Consumers import these through `constants/native-apps.constant`.
 */
export type NativeSecondaryAppId =
  | 'playground'
  | 'storyboard'
  | 'turbo'
  | 'motion'
  | 'clips'
  | 'editor'
  | 'automation'
  | 'messages'
  | 'discovery';

export type NativeAppReleaseEligibility = 'released' | 'founder-only';

export type NativeAppContextualEntry = 'edit' | 'clip';

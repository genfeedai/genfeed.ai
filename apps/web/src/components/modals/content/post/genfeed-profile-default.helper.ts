import { AssetScope, Platform } from '@genfeedai/contracts';

interface ComposerChannel {
  id: string;
  isConnected?: boolean;
  platform?: string;
}

/**
 * Channels a new post starts with: the brand's own Genfeed profile, when the
 * brand is public. A private brand's profile is not visible, so publishing
 * there would fail; the creator picks it by hand once the brand is public.
 */
export function defaultComposerCredentialIds(
  credentials: readonly ComposerChannel[],
  brandScope: AssetScope | string | undefined,
): string[] {
  if (String(brandScope ?? '').toUpperCase() !== AssetScope.PUBLIC) {
    return [];
  }
  const profile = credentials.find(
    (credential) =>
      credential.platform === Platform.GENFEED &&
      credential.isConnected !== false,
  );
  return profile ? [profile.id] : [];
}

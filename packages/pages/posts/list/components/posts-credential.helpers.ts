import { CredentialPlatform, Platform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';

export const PLATFORM_TO_CREDENTIAL_MAP: Partial<
  Record<Platform, CredentialPlatform>
> = {
  [Platform.TWITTER]: CredentialPlatform.TWITTER,
  [Platform.INSTAGRAM]: CredentialPlatform.INSTAGRAM,
  [Platform.YOUTUBE]: CredentialPlatform.YOUTUBE,
  [Platform.TIKTOK]: CredentialPlatform.TIKTOK,
  [Platform.FACEBOOK]: CredentialPlatform.FACEBOOK,
  [Platform.LINKEDIN]: CredentialPlatform.LINKEDIN,
  [Platform.REDDIT]: CredentialPlatform.REDDIT,
  [Platform.DISCORD]: CredentialPlatform.DISCORD,
  [Platform.TELEGRAM]: CredentialPlatform.TELEGRAM,
  [Platform.TWITCH]: CredentialPlatform.TWITCH,
  [Platform.MEDIUM]: CredentialPlatform.MEDIUM,
  [Platform.PINTEREST]: CredentialPlatform.PINTEREST,
  // THREADS uses Instagram credentials
  [Platform.THREADS]: CredentialPlatform.INSTAGRAM,
};

export const CREDENTIAL_TO_PLATFORM_MAP: Partial<
  Record<CredentialPlatform, Platform | null>
> = {
  [CredentialPlatform.TWITTER]: Platform.TWITTER,
  [CredentialPlatform.INSTAGRAM]: Platform.INSTAGRAM,
  [CredentialPlatform.YOUTUBE]: Platform.YOUTUBE,
  [CredentialPlatform.TIKTOK]: Platform.TIKTOK,
  [CredentialPlatform.FACEBOOK]: Platform.FACEBOOK,
  [CredentialPlatform.LINKEDIN]: Platform.LINKEDIN,
  [CredentialPlatform.REDDIT]: Platform.REDDIT,
  [CredentialPlatform.DISCORD]: Platform.DISCORD,
  [CredentialPlatform.TELEGRAM]: Platform.TELEGRAM,
  [CredentialPlatform.TWITCH]: Platform.TWITCH,
  [CredentialPlatform.MEDIUM]: Platform.MEDIUM,
  [CredentialPlatform.PINTEREST]: Platform.PINTEREST,
};

export function getCredentialForPlatform(
  platform: Platform,
  credentials: ICredential[],
): ICredential | undefined {
  const credentialPlatform = PLATFORM_TO_CREDENTIAL_MAP[platform];
  return credentials.find(
    (cred) => cred.platform === credentialPlatform && cred.isConnected,
  );
}

export function getAvailablePlatforms(credentials: ICredential[]): Platform[] {
  const platforms: Platform[] = [];
  for (const cred of credentials) {
    if (!cred.isConnected) {
      continue;
    }
    const mappedPlatform =
      CREDENTIAL_TO_PLATFORM_MAP[cred.platform as CredentialPlatform];
    if (mappedPlatform && !platforms.includes(mappedPlatform)) {
      platforms.push(mappedPlatform);
    }
  }
  return platforms;
}

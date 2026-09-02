import {
  BaseCredential,
  BaseCredentialInstagram,
  BaseCredentialOAuth,
} from '@genfeedai/client/models';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { User } from '@models/auth/user.model';

export class CredentialInstagram extends BaseCredentialInstagram {}

export class CredentialOAuth extends BaseCredentialOAuth {}

export class Credential extends BaseCredential {
  constructor(partial: Partial<ICredential>) {
    super(partial);

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user as unknown as Partial<User>);
    }
  }

  public get externalUrl(): string {
    const handle = this.externalHandle?.replace(/^@/, '').trim();
    if (!handle) {
      return '';
    }

    const platformUrls: Record<string, string> = {
      [CredentialPlatform.YOUTUBE]: `https://www.youtube.com/@${handle}`,
      [CredentialPlatform.TIKTOK]: `https://www.tiktok.com/@${handle}`,
      [CredentialPlatform.TWITTER]: `https://x.com/${handle}`,
      [CredentialPlatform.INSTAGRAM]: `https://www.instagram.com/${handle}`,
      [CredentialPlatform.LINKEDIN]: `https://www.linkedin.com/in/${handle}`,
    };

    return platformUrls[this.platform] ?? '';
  }
}

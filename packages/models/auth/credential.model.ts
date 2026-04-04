import type { ICredential } from '@cloud/interfaces';
import {
  BaseCredential,
  BaseCredentialInstagram,
  BaseCredentialOAuth,
} from '@genfeedai/client/models';
import { CredentialPlatform } from '@genfeedai/enums';
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
    const platformUrls: Record<string, string> = {
      [CredentialPlatform.YOUTUBE]: `https://www.youtube.com/@${this.externalHandle}`,
      [CredentialPlatform.TIKTOK]: `https://www.tiktok.com/@${this.externalHandle}`,
      [CredentialPlatform.TWITTER]: `https://x.com/${this.externalHandle}`,
      [CredentialPlatform.INSTAGRAM]: `https://www.instagram.com/${this.externalHandle}`,
      [CredentialPlatform.LINKEDIN]: `https://www.linkedin.com/in/${this.externalHandle}`,
    };

    return platformUrls[this.platform] ?? '';
  }
}

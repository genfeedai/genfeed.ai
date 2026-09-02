import { Brand as BaseBrand } from '@genfeedai/client/models';
import { type AssetScope, CredentialPlatform } from '@genfeedai/contracts';
import type {
  IAsset,
  IBrand,
  ICredential,
  ILink,
} from '@genfeedai/contracts/interfaces';
import {
  getDeepLink,
  isMobileDevice,
} from '@genfeedai/helpers/ui/mobile/mobile.helper';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { User } from '@models/auth/user.model';
import { Asset } from '@models/ingredients/asset.model';
import { Link } from '@models/social/link.model';

export class Brand extends BaseBrand {
  constructor(partial: Partial<IBrand>) {
    super(partial);

    // AssetScope mirrors the Prisma AssetScope enum 1:1 (SCREAMING_SNAKE,
    // PUBLIC). Normalize with toUpperCase so a stray legacy-lowercase value
    // still lands on a valid AssetScope member for checks like
    // scope === AssetScope.PUBLIC.
    if (typeof this.scope === 'string') {
      this.scope = this.scope.toUpperCase() as AssetScope;
    }

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user as unknown as Partial<User>);
    }

    if (
      partial?.logo &&
      typeof partial.logo === 'object' &&
      'id' in partial.logo
    ) {
      this.logo = new Asset(partial.logo as IAsset);
    }

    if (
      partial?.banner &&
      typeof partial.banner === 'object' &&
      'id' in partial.banner
    ) {
      this.banner = new Asset(partial.banner as IAsset);
    }

    if (partial?.references && Array.isArray(partial.references)) {
      this.references = partial.references.map((r) => new Asset(r as IAsset));
    }

    if (partial?.links && Array.isArray(partial.links)) {
      this.links = partial.links.map((l) => new Link(l as ILink));
    }

    this.credentials = partial.credentials || [];
  }

  get logoUrl(): string | undefined {
    if (!this.logo) {
      return undefined;
    }
    return `${EnvironmentService.cdnUrl}/logos/${this.logo.id}`;
  }

  get bannerUrl(): string | undefined {
    if (!this.banner) {
      return undefined;
    }
    return `${EnvironmentService.cdnUrl}/banners/${this.banner.id}`;
  }

  get primaryReferenceUrl(): string | undefined {
    const firstReference = this.references?.[0];
    if (!firstReference) {
      return undefined;
    }
    return `${EnvironmentService.cdnUrl}/references/${firstReference.id}`;
  }

  get totalCredentials(): number {
    return this.credentials?.length ?? 0;
  }

  private findCredential(
    platform: CredentialPlatform,
  ): ICredential | undefined {
    return this.credentials.find(
      (cred: ICredential) => cred.platform === platform,
    );
  }

  get youtubeHandle(): string | undefined {
    return (
      this.findCredential(CredentialPlatform.YOUTUBE)?.externalHandle ??
      undefined
    );
  }

  get youtubeUrl(): string | undefined {
    const credential = this.findCredential(CredentialPlatform.YOUTUBE);
    return credential
      ? `https://www.youtube.com/channel/${credential.externalId}`
      : undefined;
  }

  get tiktokHandle(): string | undefined {
    return (
      this.findCredential(CredentialPlatform.TIKTOK)?.externalHandle ??
      undefined
    );
  }

  get tiktokUrl(): string | undefined {
    const credential = this.findCredential(CredentialPlatform.TIKTOK);
    return credential
      ? `https://tiktok.com/@${credential.externalHandle}`
      : undefined;
  }

  get instagramHandle(): string | undefined {
    return (
      this.findCredential(CredentialPlatform.INSTAGRAM)?.externalHandle ??
      undefined
    );
  }

  get instagramUrl(): string | undefined {
    const credential = this.findCredential(CredentialPlatform.INSTAGRAM);
    return credential
      ? `https://instagram.com/${credential.externalHandle}`
      : undefined;
  }

  get twitterHandle(): string | undefined {
    return (
      this.findCredential(CredentialPlatform.TWITTER)?.externalHandle ??
      undefined
    );
  }

  get twitterUrl(): string | undefined {
    const credential = this.findCredential(CredentialPlatform.TWITTER);
    return credential
      ? `https://x.com/${credential.externalHandle}`
      : undefined;
  }

  get linkedinHandle(): string | undefined {
    return (
      this.findCredential(CredentialPlatform.LINKEDIN)?.externalHandle ??
      undefined
    );
  }

  get linkedinUrl(): string | undefined {
    const credential = this.findCredential(CredentialPlatform.LINKEDIN);
    return credential
      ? `https://linkedin.com/in/${credential.externalHandle}`
      : undefined;
  }

  private toDeepLink(url: string | undefined): string | undefined {
    return url ? getDeepLink(url, isMobileDevice()) : undefined;
  }

  get youtubeDeepLink(): string | undefined {
    return this.toDeepLink(this.youtubeUrl);
  }

  get tiktokDeepLink(): string | undefined {
    return this.toDeepLink(this.tiktokUrl);
  }

  get instagramDeepLink(): string | undefined {
    return this.toDeepLink(this.instagramUrl);
  }

  get twitterDeepLink(): string | undefined {
    return this.toDeepLink(this.twitterUrl);
  }

  get linkedinDeepLink(): string | undefined {
    return this.toDeepLink(this.linkedinUrl);
  }
}

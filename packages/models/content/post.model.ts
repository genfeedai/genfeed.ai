import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { Post as BasePost } from '@genfeedai/client/models';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { SocialUrlHelper } from '@genfeedai/helpers';
import { Credential } from '@models/auth/credential.model';
import { User } from '@models/auth/user.model';
import { Ingredient } from '@models/content/ingredient.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class Post extends BasePost {
  constructor(partial: Partial<IPost>) {
    super(partial);

    if (partial?.ingredients && Array.isArray(partial.ingredients)) {
      this.ingredients = partial.ingredients.map(
        (ingredient: IIngredient) => new Ingredient(ingredient),
      ) as unknown as IIngredient[];
    }

    if (
      partial?.credential &&
      typeof partial.credential === 'object' &&
      'id' in partial.credential
    ) {
      this.credential = new Credential(partial.credential);
    }

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user);
    }

    if (
      partial?.organization &&
      typeof partial.organization === 'object' &&
      'id' in partial.organization
    ) {
      this.organization = new Organization(partial.organization);
    }

    if (
      partial?.brand &&
      typeof partial.brand === 'object' &&
      'id' in partial.brand
    ) {
      this.brand = new Brand(partial.brand);
    }

    if (partial?.children && Array.isArray(partial.children)) {
      this.children = partial.children.map((child) => new Post(child));
    }
  }

  public get postUrl(): string {
    if (this.url) {
      return this.url;
    }

    if (!this.externalId) {
      return '';
    }

    const username = this.credential?.externalHandle || '';

    switch (this.platform) {
      case CredentialPlatform.YOUTUBE:
        return SocialUrlHelper.buildYoutubeUrl(this.externalId);

      case CredentialPlatform.TIKTOK:
        return SocialUrlHelper.buildTikTokUrl(this.externalId, username);

      case CredentialPlatform.TWITTER:
        if (!username) {
          return `https://x.com/i/status/${this.externalId}`;
        }
        return SocialUrlHelper.buildTwitterUrl(this.externalId, username);

      case CredentialPlatform.INSTAGRAM: {
        const instagramId = this.externalShortcode || this.externalId;
        return SocialUrlHelper.buildInstagramUrl(instagramId);
      }

      case CredentialPlatform.LINKEDIN:
        return SocialUrlHelper.buildLinkedInUrl(this.externalId);

      default:
        return '';
    }
  }

  public get platformUrl(): string | null {
    const isYouTube = this.platform === CredentialPlatform.YOUTUBE;

    if (isYouTube) {
      const allowedStatuses = [
        PostStatus.PUBLIC,
        PostStatus.UNLISTED,
        PostStatus.PRIVATE,
      ];

      if (!allowedStatuses.includes(this.status as PostStatus)) {
        return null;
      }

      if (this.url) {
        return this.url;
      }

      if (this.externalId) {
        return `https://studio.youtube.com/video/${this.externalId}`;
      }

      return null;
    }

    if (this.status !== PostStatus.PUBLIC) {
      return null;
    }

    if (this.url) {
      return this.url;
    }

    if (!this.externalId) {
      return null;
    }

    const username = this.credential?.externalHandle || '';

    switch (this.platform) {
      case CredentialPlatform.TIKTOK:
        return SocialUrlHelper.buildTikTokUrl(this.externalId, username);

      case CredentialPlatform.INSTAGRAM: {
        const instagramId = this.externalShortcode || this.externalId;
        if (!instagramId) {
          return null;
        }
        return SocialUrlHelper.buildInstagramUrl(instagramId);
      }

      case CredentialPlatform.TWITTER:
        if (!username) {
          return `https://x.com/i/status/${this.externalId}`;
        }
        return SocialUrlHelper.buildTwitterUrl(this.externalId, username);

      case CredentialPlatform.LINKEDIN:
        return SocialUrlHelper.buildLinkedInUrl(this.externalId);

      case CredentialPlatform.FACEBOOK:
        return `https://www.facebook.com/${this.externalId}`;

      default:
        return null;
    }
  }
}

import { Article as BaseArticle } from '@genfeedai/client/models';
import { User } from '@models/auth/user.model';
import { Tag } from '@models/content/tag.model';
import { Brand } from '@models/organization/brand.model';

export class Article extends BaseArticle {
  constructor(partial: Partial<Article>) {
    super(partial);

    if (partial?.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }

    if (partial?.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }

    if (partial?.tags && Array.isArray(partial.tags)) {
      this.tags = partial.tags.map((t: Tag) => new Tag(t));
    }
  }

  get bannerUrl(): string | undefined {
    return this.banner?.url;
  }

  get wordCount(): number {
    if (!this.content) {
      return 0;
    }
    return this.content.split(/\s+/).length;
  }

  get readingTime(): number {
    return Math.ceil(this.wordCount / 200);
  }

  get author(): string | undefined {
    return this.user?.handle;
  }
}

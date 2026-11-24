import { Article as BaseArticle } from '@genfeedai/client/models';
import {
  ARTICLE_WORDS_PER_MINUTE,
  countArticleWords,
} from '@genfeedai/contracts/constants';
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

  get wordCount(): number {
    return countArticleWords(this.content);
  }

  get readingTime(): number {
    // The public list sends the minutes and leaves the body out.
    return (
      this.readingTimeMinutes ??
      Math.ceil(this.wordCount / ARTICLE_WORDS_PER_MINUTE)
    );
  }

  get author(): string | undefined {
    return this.user?.handle || undefined;
  }
}

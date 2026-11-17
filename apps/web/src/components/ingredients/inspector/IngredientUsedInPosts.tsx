'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { IngredientUsedInPostsProps } from '@/props/content/ingredient.props';

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

const EMPTY_POSTS: IPost[] = [];

/**
 * The posts that carry this asset, each linking to its post. Nothing renders
 * while loading or when no post uses the asset, so an unused upload does not
 * carry an empty heading. Shares the per-asset cache the Studio inspector
 * reads.
 */
export default function IngredientUsedInPosts({
  className,
  ingredientId,
}: IngredientUsedInPostsProps) {
  const translate = useTranslations('pages.library.inspector');
  const { href } = useOrgUrl();
  const { data } = useAuthedQuery({
    queryFn: (service) => service.getPosts(ingredientId),
    queryKey: ['ingredient-posts', ingredientId],
    service: createIngredientsService,
  });
  const posts = data ?? EMPTY_POSTS;

  if (posts.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={translate('usedInPosts')}
      className={className ?? 'flex min-w-0 flex-col gap-2'}
    >
      <h4 className="text-2xs uppercase tracking-label text-muted-foreground">
        {translate('usedInPosts')}
      </h4>
      <ul className="flex min-w-0 flex-col gap-1">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              className="block truncate text-xs text-foreground hover:underline"
              href={href(`${APP_ROUTES.PUBLISHING.POSTS}/${post.id}`)}
            >
              {post.label?.trim() || translate('untitledPost')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
